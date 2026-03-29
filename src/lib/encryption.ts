/**
 * E2E Encryption for Shyft P2P Chat
 * Uses NaCl box (X25519-XSalsa20-Poly1305) — same crypto as Signal.
 *
 * Key derivation: wallet signs "shyft-encryption-key-v1:{address}" → SHA-256 → X25519 keypair
 * Key exchange:   public keys published on-chain as "PUBKEY:{base64}" message content
 * Encrypted msg:  "ENC:{base64_nonce}:{base64_encrypted}" stored in Message.content (max 512 chars)
 */

import nacl from "tweetnacl";

// ========== Helpers ==========

export function toBase64(bytes: Uint8Array): string {
  // Browser-safe base64 encoding
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function fromBase64(str: string): Uint8Array {
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ========== Key Derivation ==========

/**
 * Derive a deterministic X25519 encryption keypair from a wallet signature.
 * The wallet signs a fixed message, the signature is SHA-256 hashed to produce the secret key.
 * This is deterministic — same wallet always produces the same keypair.
 */
export async function deriveEncryptionKeypair(
  walletAddress: string,
  signMessage: (message: Uint8Array) => Promise<Uint8Array>
): Promise<nacl.BoxKeyPair> {
  const msg = new TextEncoder().encode(`shyft-encryption-key-v1:${walletAddress}`);
  const signature = await signMessage(msg);
  // SHA-256 the signature to get 32 bytes for the secret key
  const hashBuffer = await crypto.subtle.digest("SHA-256", signature.buffer as ArrayBuffer);
  const secretKey = new Uint8Array(hashBuffer);
  return nacl.box.keyPair.fromSecretKey(secretKey);
}

// ========== Encryption / Decryption ==========

/**
 * Encrypt a plaintext message using NaCl box.
 * sender's secret key + recipient's public key → authenticated encryption.
 */
export function encryptMessage(
  plaintext: string,
  senderSecretKey: Uint8Array,
  recipientPublicKey: Uint8Array
): string {
  const messageBytes = new TextEncoder().encode(plaintext);
  const nonce = nacl.randomBytes(nacl.box.nonceLength); // 24 bytes
  const encrypted = nacl.box(messageBytes, nonce, recipientPublicKey, senderSecretKey);
  if (!encrypted) throw new Error("Encryption failed");
  // Format: "ENC:{base64_nonce}:{base64_encrypted}"
  return `ENC:${toBase64(nonce)}:${toBase64(encrypted)}`;
}

/**
 * Decrypt an encrypted message using NaCl box.open.
 * sender's public key + recipient's secret key → decrypt.
 * Returns null if decryption fails (wrong keys, tampered data, etc.)
 */
export function decryptMessage(
  encryptedContent: string,
  senderPublicKey: Uint8Array,
  recipientSecretKey: Uint8Array
): string | null {
  if (!encryptedContent.startsWith("ENC:")) return null;
  const parts = encryptedContent.split(":");
  if (parts.length !== 3) return null;
  try {
    const nonce = fromBase64(parts[1]);
    const encrypted = fromBase64(parts[2]);
    const decrypted = nacl.box.open(encrypted, nonce, senderPublicKey, recipientSecretKey);
    if (!decrypted) return null;
    return new TextDecoder().decode(decrypted);
  } catch {
    return null;
  }
}

// ========== Key Exchange Helpers ==========

/** Format a public key for on-chain storage as the first message in a chat */
export function formatPubkeyMessage(encryptionPublicKey: Uint8Array): string {
  return `PUBKEY:${toBase64(encryptionPublicKey)}`;
}

/** Parse a PUBKEY message to extract the encryption public key */
export function parsePubkeyMessage(content: string): Uint8Array | null {
  if (!content.startsWith("PUBKEY:")) return null;
  try {
    return fromBase64(content.slice(7));
  } catch {
    return null;
  }
}

/** Check if a message is an encrypted message */
export function isEncryptedMessage(content: string): boolean {
  return content.startsWith("ENC:");
}

/** Check if a message is a public key exchange message */
export function isPubkeyMessage(content: string): boolean {
  return content.startsWith("PUBKEY:");
}
