"use client";

import { useCallback, useEffect, useState } from "react";
import { useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { AnchorProvider } from "@coral-xyz/anchor";
import bs58 from "bs58";

/** Session Keys on-chain program */
const SESSION_KEYS_PROGRAM_ID = new PublicKey("KeyspM2ssCJbqUhQ4k7sveSiY4WjnYsrXkC8oDbwde5");
/** Our Solana program */
const TARGET_PROGRAM_ID = new PublicKey("EEnouVLAoQGMEbrypEhP3Ct5RgCViCWG4n1nCZNwMxjQ");
/** Seed prefix used by session-keys crate */
const SESSION_TOKEN_SEED = "session_token";

/** Derive the SessionToken PDA */
function getSessionTokenPda(
  targetProgram: PublicKey,
  sessionSigner: PublicKey,
  authority: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from(SESSION_TOKEN_SEED),
      targetProgram.toBuffer(),
      sessionSigner.toBuffer(),
      authority.toBuffer(),
    ],
    SESSION_KEYS_PROGRAM_ID
  );
}

/** Write a u64 as little-endian bytes into a Uint8Array at offset */
function writeU64LE(arr: Uint8Array, value: bigint, offset: number): void {
  const view = new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
  view.setBigUint64(offset, value, true);
}

/** Write an i64 as little-endian bytes into a Uint8Array at offset */
function writeI64LE(arr: Uint8Array, value: bigint, offset: number): void {
  const view = new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
  view.setBigInt64(offset, value, true);
}

/** Encode create_session instruction data (Anchor discriminator + args) */
function encodeCreateSessionData(topUp: boolean, validUntil: number): Uint8Array {
  // Anchor discriminator for "create_session" = sha256("global:create_session")[0..8]
  const discriminator = [242, 193, 143, 179, 150, 25, 122, 227];

  // topUp: Option<bool> — Some(true/false)
  const topUpBytes = [1, topUp ? 1 : 0]; // Some(bool)

  // validUntil: Option<i64> — Some(timestamp)
  const validUntilBytes = new Uint8Array(9);
  validUntilBytes[0] = 1; // Some
  writeI64LE(validUntilBytes, BigInt(validUntil), 1);

  // Concat all parts (on-chain IDL only has topUp + validUntil, no lamports arg)
  const total = discriminator.length + topUpBytes.length + validUntilBytes.length;
  const result = new Uint8Array(total);
  let offset = 0;
  result.set(discriminator, offset); offset += discriminator.length;
  result.set(topUpBytes, offset); offset += topUpBytes.length;
  result.set(validUntilBytes, offset);

  return result;
}

/** Encode revoke_session instruction data */
function encodeRevokeSessionData(): Uint8Array {
  // Anchor discriminator for "revoke_session" = sha256("global:revoke_session")[0..8]
  return new Uint8Array([86, 92, 198, 120, 144, 2, 7, 194]);
}

const STORAGE_KEY_PREFIX = "shyft_session_";

interface StoredSession {
  keypairSecret: string; // bs58-encoded secret key
  sessionTokenPda: string;
  validUntil: number; // unix timestamp in seconds
  authority: string;
}

export interface SessionKeyState {
  /** Whether session is active and valid */
  isActive: boolean;
  /** Session is being created */
  isCreating: boolean;
  /** Ephemeral keypair (signer for transactions) */
  sessionKeypair: Keypair | null;
  /** SessionToken PDA on-chain */
  sessionTokenPda: PublicKey | null;
  /** When the session expires (unix ms) */
  expiresAt: number | null;
  /** Create a new session (1 wallet sign) — valid for 24 hours.
   *  Returns the keypair + token PDA directly (don't wait for re-render). */
  createSession: () => Promise<{ keypair: Keypair; tokenPda: PublicKey } | null>;
  /** Revoke current session */
  revokeSession: () => Promise<void>;
}

/**
 * Lightweight session key hook — manages ephemeral keypairs + on-chain SessionToken.
 * Sign ONCE, then all posts/comments/likes/reactions use the session key (no wallet popups).
 */
export function useSessionKey(): SessionKeyState {
  const wallet = useAnchorWallet();
  const { connection } = useConnection();
  const [sessionKeypair, setSessionKeypair] = useState<Keypair | null>(null);
  const [sessionTokenPda, setSessionTokenPda] = useState<PublicKey | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const authority = wallet?.publicKey ?? null;

  // Load existing session from localStorage on mount
  useEffect(() => {
    if (!authority) return;
    const stored = localStorage.getItem(STORAGE_KEY_PREFIX + authority.toBase58());
    if (!stored) return;

    try {
      const data: StoredSession = JSON.parse(stored);
      const now = Math.floor(Date.now() / 1000);

      // Check if session is still valid (with 5 minute buffer)
      if (data.validUntil > now + 300 && data.authority === authority.toBase58()) {
        const kp = Keypair.fromSecretKey(bs58.decode(data.keypairSecret));
        setSessionKeypair(kp);
        setSessionTokenPda(new PublicKey(data.sessionTokenPda));
        setExpiresAt(data.validUntil * 1000);
        console.log("🔑 Restored session key, expires:", new Date(data.validUntil * 1000).toLocaleTimeString());
      } else {
        // Expired — clean up
        localStorage.removeItem(STORAGE_KEY_PREFIX + authority.toBase58());
        console.log("🔑 Session expired, cleared");
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY_PREFIX + authority.toBase58());
    }
  }, [authority]);

  // Validate session token still exists on-chain
  useEffect(() => {
    if (!sessionTokenPda || !connection) return;
    connection.getAccountInfo(sessionTokenPda).then((info) => {
      if (!info) {
        console.log("🔑 Session token PDA no longer exists on-chain — clearing");
        setSessionKeypair(null);
        setSessionTokenPda(null);
        setExpiresAt(null);
        if (authority) {
          localStorage.removeItem(STORAGE_KEY_PREFIX + authority.toBase58());
        }
      }
    }).catch(() => {});
  }, [sessionTokenPda, connection, authority]);

  /** Create a new session — requires 1 wallet signature */
  const createSession = useCallback(async (): Promise<{ keypair: Keypair; tokenPda: PublicKey } | null> => {
    if (!wallet || !authority || !connection) return null;
    setIsCreating(true);

    try {
      // Generate ephemeral keypair
      const ephemeralKp = Keypair.generate();
      const [tokenPda] = getSessionTokenPda(TARGET_PROGRAM_ID, ephemeralKp.publicKey, authority);

      // Session valid for 24 hours
      const validUntil = Math.floor(Date.now() / 1000) + 24 * 60 * 60;

      // Build create_session instruction
      const createIx = new TransactionInstruction({
        programId: SESSION_KEYS_PROGRAM_ID,
        keys: [
          { pubkey: tokenPda, isSigner: false, isWritable: true },
          { pubkey: ephemeralKp.publicKey, isSigner: true, isWritable: true },
          { pubkey: authority, isSigner: true, isWritable: true },
          { pubkey: TARGET_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data: Buffer.from(encodeCreateSessionData(true, validUntil)),
      });

      // Transfer SOL to ephemeral key so it can pay tx fees
      const topUpIx = SystemProgram.transfer({
        fromPubkey: authority,
        toPubkey: ephemeralKp.publicKey,
        lamports: 2_000_000, // 0.002 SOL for ~200 transactions
      });

      const tx = new Transaction().add(topUpIx).add(createIx);
      tx.feePayer = authority;
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

      // Ephemeral keypair must co-sign
      tx.partialSign(ephemeralKp);

      // Wallet signs (this is the ONLY wallet popup)
      const signed = await wallet.signTransaction(tx);
      const sig = await connection.sendRawTransaction(signed.serialize());
      await connection.confirmTransaction(sig, "confirmed");

      console.log("🔑 Session created:", sig);
      console.log("🔑 Session signer:", ephemeralKp.publicKey.toBase58());
      console.log("🔑 Session token PDA:", tokenPda.toBase58());
      console.log("🔑 Valid until:", new Date(validUntil * 1000).toLocaleString());

      // Store in state
      setSessionKeypair(ephemeralKp);
      setSessionTokenPda(tokenPda);
      setExpiresAt(validUntil * 1000);

      // Persist to localStorage
      const stored: StoredSession = {
        keypairSecret: bs58.encode(ephemeralKp.secretKey),
        sessionTokenPda: tokenPda.toBase58(),
        validUntil,
        authority: authority.toBase58(),
      };
      localStorage.setItem(STORAGE_KEY_PREFIX + authority.toBase58(), JSON.stringify(stored));

      return { keypair: ephemeralKp, tokenPda };
    } catch (err: any) {
      console.error("Session creation failed:", err);
      return null;
    } finally {
      setIsCreating(false);
    }
  }, [wallet, authority, connection]);

  /** Revoke current session */
  const revokeSession = useCallback(async () => {
    if (!wallet || !authority || !sessionKeypair || !sessionTokenPda) return;

    try {
      const revokeIx = new TransactionInstruction({
        programId: SESSION_KEYS_PROGRAM_ID,
        keys: [
          { pubkey: sessionTokenPda, isSigner: false, isWritable: true },
          { pubkey: authority, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data: Buffer.from(encodeRevokeSessionData()),
      });

      const tx = new Transaction().add(revokeIx);
      tx.feePayer = authority;
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      const signed = await wallet.signTransaction(tx);
      const sig = await connection.sendRawTransaction(signed.serialize());
      await connection.confirmTransaction(sig, "confirmed");
      console.log("🔑 Session revoked:", sig);
    } catch (err: any) {
      console.warn("Session revoke failed:", err?.message?.slice(0, 80));
    }

    // Clear state + storage
    setSessionKeypair(null);
    setSessionTokenPda(null);
    setExpiresAt(null);
    localStorage.removeItem(STORAGE_KEY_PREFIX + authority.toBase58());
  }, [wallet, authority, connection, sessionKeypair, sessionTokenPda]);

  const isActive = !!sessionKeypair && !!sessionTokenPda && !!expiresAt && Date.now() < expiresAt;

  return {
    isActive,
    isCreating,
    sessionKeypair,
    sessionTokenPda,
    expiresAt,
    createSession,
    revokeSession,
  };
}
