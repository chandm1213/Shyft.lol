"use client";

import { useCallback, useEffect, useState } from "react";
import { useAnchorWallet, useConnection } from "@/hooks/usePrivyWallet";
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
function encodeCreateSessionData(topUp: boolean, validUntil: number, lamports: number | null): Uint8Array {
  // Anchor discriminator for "create_session" = sha256("global:create_session")[0..8]
  const discriminator = [242, 193, 143, 179, 150, 25, 122, 227];

  // topUp: Option<bool> — Some(true/false)
  const topUpBytes = [1, topUp ? 1 : 0]; // Some(bool)

  // validUntil: Option<i64> — Some(timestamp)
  const validUntilBytes = new Uint8Array(9);
  validUntilBytes[0] = 1; // Some
  writeI64LE(validUntilBytes, BigInt(validUntil), 1);

  // lamports: Option<u64> — Some(amount) or None
  let lamportsBytes: Uint8Array;
  if (lamports !== null && lamports > 0) {
    lamportsBytes = new Uint8Array(9);
    lamportsBytes[0] = 1; // Some
    writeU64LE(lamportsBytes, BigInt(lamports), 1);
  } else {
    lamportsBytes = new Uint8Array([0]); // None
  }

  // Concat all parts
  const total = discriminator.length + topUpBytes.length + validUntilBytes.length + lamportsBytes.length;
  const result = new Uint8Array(total);
  let offset = 0;
  result.set(discriminator, offset); offset += discriminator.length;
  result.set(topUpBytes, offset); offset += topUpBytes.length;
  result.set(validUntilBytes, offset); offset += validUntilBytes.length;
  result.set(lamportsBytes, offset);

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
  /** Remaining SOL balance on the session key */
  sessionBalance: number | null;
  /** Create a new session (1 wallet sign) — runs until balance is depleted.
   *  Returns the keypair + token PDA directly (don't wait for re-render). */
  createSession: () => Promise<{ keypair: Keypair; tokenPda: PublicKey } | null>;
  /** Revoke current session (refunds remaining SOL to wallet) */
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
  const [sessionBalance, setSessionBalance] = useState<number | null>(null);
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

  // Validate session token exists on-chain AND track ephemeral key balance
  useEffect(() => {
    if (!sessionTokenPda || !sessionKeypair || !connection) return;

    /** Refund remaining SOL from ephemeral key back to wallet (no wallet popup needed) */
    const refundAndClear = async (balance: number) => {
      const txFee = 5000;
      if (authority && balance > txFee + 1000) {
        try {
          const refundIx = SystemProgram.transfer({
            fromPubkey: sessionKeypair.publicKey,
            toPubkey: authority,
            lamports: balance - txFee,
          });
          const refundTx = new Transaction().add(refundIx);
          refundTx.feePayer = sessionKeypair.publicKey;
          refundTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
          refundTx.sign(sessionKeypair);
          const refundSig = await connection.sendRawTransaction(refundTx.serialize());
          await connection.confirmTransaction(refundSig, "confirmed");
          console.log("🔑 Auto-refunded", ((balance - txFee) / 1e9).toFixed(6), "SOL back to wallet:", refundSig);
        } catch (err: any) {
          console.warn("🔑 Auto-refund failed (funds may remain on ephemeral key):", err?.message?.slice(0, 80));
        }
      }
      // Clear state + storage regardless
      setSessionKeypair(null);
      setSessionTokenPda(null);
      setExpiresAt(null);
      setSessionBalance(null);
      if (authority) localStorage.removeItem(STORAGE_KEY_PREFIX + authority.toBase58());
    };

    const clearSession = () => {
      console.log("🔑 Clearing invalid session (no balance to refund)");
      setSessionKeypair(null);
      setSessionTokenPda(null);
      setExpiresAt(null);
      setSessionBalance(null);
      if (authority) localStorage.removeItem(STORAGE_KEY_PREFIX + authority.toBase58());
    };

    const checkBalance = () => {
      Promise.all([
        connection.getAccountInfo(sessionTokenPda),
        connection.getBalance(sessionKeypair.publicKey),
      ]).then(([info, balance]) => {
        if (!info) {
          console.log("🔑 Session token PDA no longer exists on-chain");
          if (balance > 6000) {
            console.log("🔑 Refunding remaining", (balance / 1e9).toFixed(6), "SOL before clearing...");
            refundAndClear(balance);
          } else {
            clearSession();
          }
        } else if (balance < 2_000_000) {
          console.log("🔑 Session key balance low:", balance, "lamports — refunding & ending session");
          refundAndClear(balance);
        } else {
          setSessionBalance(balance / 1e9);
          console.log("🔑 Session key balance:", (balance / 1e9).toFixed(4), "SOL");
        }
      }).catch(() => {});
    };
    checkBalance();
    // Poll balance every 15 seconds to keep UI updated
    const interval = setInterval(checkBalance, 15_000);
    return () => clearInterval(interval);
  }, [sessionTokenPda, sessionKeypair, connection, authority]);

  /** Create a new session — requires 1 wallet signature */
  const createSession = useCallback(async (): Promise<{ keypair: Keypair; tokenPda: PublicKey } | null> => {
    if (!wallet || !authority || !connection) return null;
    setIsCreating(true);

    try {
      // Generate ephemeral keypair
      const ephemeralKp = Keypair.generate();
      const [tokenPda] = getSessionTokenPda(TARGET_PROGRAM_ID, ephemeralKp.publicKey, authority);

      // Session valid for 7 days (max allowed by on-chain program)
      // Session stays active until the balance runs out
      const validUntil = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;

      // topUp=true tells the program to transfer lamports from authority to ephemeral key
      // 50_000_000 lamports (0.05 SOL) — enough for ~20 comments/reactions before needing refill
      const createIx = new TransactionInstruction({
        programId: SESSION_KEYS_PROGRAM_ID,
        keys: [
          { pubkey: tokenPda, isSigner: false, isWritable: true },
          { pubkey: ephemeralKp.publicKey, isSigner: true, isWritable: true },
          { pubkey: authority, isSigner: true, isWritable: true },
          { pubkey: TARGET_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data: Buffer.from(encodeCreateSessionData(true, validUntil, 50_000_000)),
      });

      const tx = new Transaction().add(createIx);
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

  /** Revoke current session — refunds remaining SOL back to wallet */
  const revokeSession = useCallback(async () => {
    if (!wallet || !authority || !sessionKeypair || !sessionTokenPda) return;

    try {
      // 1. Refund remaining SOL from ephemeral key back to wallet
      const balance = await connection.getBalance(sessionKeypair.publicKey);
      const txFee = 5000; // reserve for this refund tx fee
      if (balance > txFee + 1000) {
        const refundIx = SystemProgram.transfer({
          fromPubkey: sessionKeypair.publicKey,
          toPubkey: authority,
          lamports: balance - txFee,
        });
        const refundTx = new Transaction().add(refundIx);
        refundTx.feePayer = sessionKeypair.publicKey;
        refundTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
        refundTx.sign(sessionKeypair);
        const refundSig = await connection.sendRawTransaction(refundTx.serialize());
        await connection.confirmTransaction(refundSig, "confirmed");
        console.log("🔑 Refunded", ((balance - txFee) / 1e9).toFixed(4), "SOL back to wallet:", refundSig);
      }

      // 2. Revoke the session token on-chain (rent goes back to authority)
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
    setSessionBalance(null);
    localStorage.removeItem(STORAGE_KEY_PREFIX + authority.toBase58());
  }, [wallet, authority, connection, sessionKeypair, sessionTokenPda]);

  const isActive = !!sessionKeypair && !!sessionTokenPda && !!expiresAt && Date.now() < expiresAt;

  return {
    isActive,
    isCreating,
    sessionKeypair,
    sessionTokenPda,
    expiresAt,
    sessionBalance,
    createSession,
    revokeSession,
  };
}
