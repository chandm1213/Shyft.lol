/**
 * Shared crypto + chain helpers for P2P chat test.
 * NO private keys in this file — each user script has its own.
 */
import nacl from "tweetnacl";
import { createHash } from "crypto";
import { PublicKey, Keypair } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";

export const PROGRAM_ID = new PublicKey("EEnouVLAoQGMEbrypEhP3Ct5RgCViCWG4n1nCZNwMxjQ");
export const DEVNET_URL = "https://api.devnet.solana.com";
export const CHAT_SEED = Buffer.from("chat");
export const MESSAGE_SEED = Buffer.from("message");

export function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}
export function fromBase64(str: string): Uint8Array {
  return new Uint8Array(Buffer.from(str, "base64"));
}

/**
 * Derive X25519 encryption keypair from a Solana wallet keypair.
 * In the real app, this uses a wallet signature. Here we simulate
 * the same deterministic derivation.
 */
export function deriveEncryptionKeypair(wallet: Keypair): nacl.BoxKeyPair {
  const signMessage = `shyft-encryption-key-v1:${wallet.publicKey.toBase58()}`;
  const signature = nacl.sign.detached(Buffer.from(signMessage), wallet.secretKey);
  const hash = createHash("sha256").update(signature).digest();
  return nacl.box.keyPair.fromSecretKey(new Uint8Array(hash));
}

/** Encrypt: sender's secret key + recipient's public key */
export function encryptMessage(
  plaintext: string,
  senderSecretKey: Uint8Array,
  recipientPublicKey: Uint8Array
): { encrypted: Uint8Array; nonce: Uint8Array } {
  const messageBytes = new TextEncoder().encode(plaintext);
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const encrypted = nacl.box(messageBytes, nonce, recipientPublicKey, senderSecretKey);
  if (!encrypted) throw new Error("Encryption failed");
  return { encrypted, nonce };
}

/** Decrypt: sender's public key + recipient's secret key */
export function decryptMessage(
  encrypted: Uint8Array,
  nonce: Uint8Array,
  senderPublicKey: Uint8Array,
  recipientSecretKey: Uint8Array
): string | null {
  const decrypted = nacl.box.open(encrypted, nonce, senderPublicKey, recipientSecretKey);
  if (!decrypted) return null;
  return new TextDecoder().decode(decrypted);
}

export function getChatPDA(chatId: BN): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [CHAT_SEED, chatId.toArrayLike(Buffer, "le", 8)],
    PROGRAM_ID
  );
}

export function getMessagePDA(chatId: BN, messageIndex: BN): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [MESSAGE_SEED, chatId.toArrayLike(Buffer, "le", 8), messageIndex.toArrayLike(Buffer, "le", 8)],
    PROGRAM_ID
  );
}
