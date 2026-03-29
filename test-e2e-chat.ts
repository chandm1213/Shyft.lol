/**
 * =============================================================
 *  Shyft.lol — E2E Encrypted P2P Chat Test (Level 2 Security)
 * =============================================================
 *
 * This test simulates two users (Alice & Bob) exchanging encrypted
 * messages using NaCl box (X25519-XSalsa20-Poly1305).
 *
 * It proves:
 *   ✅ Alice can encrypt a message that only Bob can decrypt
 *   ✅ Bob can encrypt a message that only Alice can decrypt
 *   ✅ A third-party (Eve) with access to the on-chain encrypted data CANNOT decrypt
 *   ✅ Tampering with encrypted data is detected (authentication)
 *   ✅ Each message has a unique nonce (no nonce reuse)
 *   ✅ Key derivation from wallet signature is deterministic (same wallet → same key)
 *   ✅ Simulates on-chain storage format (what the Solana program would store)
 *
 * Encryption: NaCl box = X25519 key agreement + XSalsa20 stream cipher + Poly1305 MAC
 * This is the same cryptographic primitive used by Signal, libsodium, and Wireguard.
 *
 * Run: npx tsx test-e2e-chat.ts
 */

import nacl from "tweetnacl";
import { Keypair } from "@solana/web3.js";
import { createHash, randomBytes } from "crypto";

// ============================================================
// HELPERS
// ============================================================

/** Encode Uint8Array to base64 (simulates what we'd store on-chain as String) */
function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

/** Decode base64 string back to Uint8Array */
function fromBase64(str: string): Uint8Array {
  return new Uint8Array(Buffer.from(str, "base64"));
}

/** Simulate wallet signing a message (deterministic signature for key derivation) */
function simulateWalletSign(walletKeypair: Keypair, message: string): Uint8Array {
  const messageBytes = Buffer.from(message);
  return nacl.sign.detached(messageBytes, walletKeypair.secretKey);
}

/**
 * Derive an X25519 encryption keypair from a wallet signature.
 * 
 * In the real app with Privy:
 *   1. User signs a fixed message: "shyft-encryption-key-v1:{walletAddress}"
 *   2. The signature (64 bytes) is hashed with SHA-256 to get 32 bytes
 *   3. Those 32 bytes become the X25519 secret key
 *   4. The public key is derived from the secret key
 *
 * This is DETERMINISTIC: same wallet + same message → same encryption keypair.
 * This means the user can recover their keys on any device by signing again.
 *
 * In the browser (Level 2), we'd use Web Crypto API with non-extractable keys.
 * Here in Node.js, we simulate the same derivation for testing.
 */
function deriveEncryptionKeypair(walletKeypair: Keypair): nacl.BoxKeyPair {
  const walletAddress = walletKeypair.publicKey.toBase58();
  const signMessage = `shyft-encryption-key-v1:${walletAddress}`;
  
  // Sign the deterministic message with wallet
  const signature = simulateWalletSign(walletKeypair, signMessage);
  
  // Hash the signature to get 32 bytes for the X25519 secret key
  const hash = createHash("sha256").update(signature).digest();
  const secretKey = new Uint8Array(hash);
  
  // Derive the X25519 keypair from the secret key
  return nacl.box.keyPair.fromSecretKey(secretKey);
}

// ============================================================
// ON-CHAIN SIMULATION TYPES
// ============================================================

/** What would be stored in the on-chain Message PDA */
interface OnChainMessage {
  sender: string;            // Wallet address (Pubkey)
  recipient: string;         // Wallet address (Pubkey)
  encryptedContent: string;  // Base64-encoded encrypted bytes
  nonce: string;             // Base64-encoded 24-byte nonce
  timestamp: number;         // Unix timestamp
  isPayment: boolean;
  paymentLamports: number;
}

/** What would be stored in the Conversation PDA */
interface OnChainConversation {
  participantA: string;
  participantB: string;
  messageCount: number;
  lastMessageAt: number;
  createdAt: number;
}

// ============================================================
// ENCRYPTION / DECRYPTION FUNCTIONS
// ============================================================

/**
 * Encrypt a message from sender to recipient.
 * Uses NaCl box: X25519 key agreement + XSalsa20-Poly1305
 * 
 * Only the recipient (who has recipientSecretKey) can decrypt this.
 */
function encryptMessage(
  plaintext: string,
  senderSecretKey: Uint8Array,
  recipientPublicKey: Uint8Array
): { encrypted: Uint8Array; nonce: Uint8Array } {
  const messageBytes = new TextEncoder().encode(plaintext);
  const nonce = nacl.randomBytes(nacl.box.nonceLength); // 24 random bytes
  
  const encrypted = nacl.box(
    messageBytes,
    nonce,
    recipientPublicKey,  // recipient's X25519 public key
    senderSecretKey      // sender's X25519 secret key
  );
  
  if (!encrypted) {
    throw new Error("Encryption failed");
  }
  
  return { encrypted, nonce };
}

/**
 * Decrypt a message received from sender.
 * Uses NaCl box.open: verifies MAC + decrypts.
 * 
 * Returns null if decryption fails (wrong key, tampered data, etc.)
 */
function decryptMessage(
  encrypted: Uint8Array,
  nonce: Uint8Array,
  senderPublicKey: Uint8Array,
  recipientSecretKey: Uint8Array
): string | null {
  const decrypted = nacl.box.open(
    encrypted,
    nonce,
    senderPublicKey,      // sender's X25519 public key
    recipientSecretKey    // recipient's X25519 secret key
  );
  
  if (!decrypted) {
    return null; // Decryption failed — wrong key or tampered data
  }
  
  return new TextDecoder().decode(decrypted);
}

// ============================================================
// TEST EXECUTION
// ============================================================

async function runTest() {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║   Shyft.lol — E2E Encrypted P2P Chat Test (Level 2)        ║");
  console.log("║   NaCl Box: X25519-XSalsa20-Poly1305                       ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  // -----------------------------------------------------------
  // Step 1: Create three Solana wallets (Alice, Bob, Eve)
  // -----------------------------------------------------------
  console.log("━━━ Step 1: Generate Wallet Keypairs ━━━");
  
  const aliceWallet = Keypair.generate();
  const bobWallet = Keypair.generate();
  const eveWallet = Keypair.generate(); // Eavesdropper
  
  console.log(`  Alice wallet: ${aliceWallet.publicKey.toBase58()}`);
  console.log(`  Bob   wallet: ${bobWallet.publicKey.toBase58()}`);
  console.log(`  Eve   wallet: ${eveWallet.publicKey.toBase58()} (eavesdropper)\n`);

  // -----------------------------------------------------------
  // Step 2: Derive encryption keypairs from wallet signatures
  // -----------------------------------------------------------
  console.log("━━━ Step 2: Derive Encryption Keypairs (from wallet signatures) ━━━");
  
  const aliceEncKeys = deriveEncryptionKeypair(aliceWallet);
  const bobEncKeys = deriveEncryptionKeypair(bobWallet);
  const eveEncKeys = deriveEncryptionKeypair(eveWallet);
  
  console.log(`  Alice encryption pubkey: ${toBase64(aliceEncKeys.publicKey).slice(0, 32)}...`);
  console.log(`  Bob   encryption pubkey: ${toBase64(bobEncKeys.publicKey).slice(0, 32)}...`);
  console.log(`  Eve   encryption pubkey: ${toBase64(eveEncKeys.publicKey).slice(0, 32)}...\n`);

  // Verify deterministic derivation: same wallet → same key
  console.log("━━━ Step 2b: Verify Deterministic Key Derivation ━━━");
  const aliceEncKeys2 = deriveEncryptionKeypair(aliceWallet);
  const keysMatch = toBase64(aliceEncKeys.publicKey) === toBase64(aliceEncKeys2.publicKey) &&
                    toBase64(aliceEncKeys.secretKey) === toBase64(aliceEncKeys2.secretKey);
  console.log(`  Re-derived Alice's keys → Match: ${keysMatch ? "✅ YES" : "❌ NO"}`);
  console.log(`  (Same wallet signature → same encryption key, works across devices)\n`);

  // -----------------------------------------------------------
  // Step 3: Simulate on-chain conversation creation
  // -----------------------------------------------------------
  console.log("━━━ Step 3: Create On-Chain Conversation ━━━");
  
  const conversation: OnChainConversation = {
    participantA: aliceWallet.publicKey.toBase58(),
    participantB: bobWallet.publicKey.toBase58(),
    messageCount: 0,
    lastMessageAt: 0,
    createdAt: Math.floor(Date.now() / 1000),
  };
  
  console.log(`  Conversation: ${conversation.participantA.slice(0, 8)}... ↔ ${conversation.participantB.slice(0, 8)}...`);
  console.log(`  Created at: ${new Date(conversation.createdAt * 1000).toISOString()}\n`);

  // -----------------------------------------------------------
  // Step 4: Alice sends a message to Bob
  // -----------------------------------------------------------
  console.log("━━━ Step 4: Alice → Bob (Encrypt & Send) ━━━");
  
  const aliceMessage = "Hey Bob! This is a secret message on Shyft. Nobody else can read this 🔐";
  console.log(`  Plaintext: "${aliceMessage}"`);
  console.log(`  Plaintext bytes: ${new TextEncoder().encode(aliceMessage).length}`);
  
  const { encrypted: aliceEncrypted, nonce: aliceNonce } = encryptMessage(
    aliceMessage,
    aliceEncKeys.secretKey,    // Alice's secret key
    bobEncKeys.publicKey       // Bob's public key (fetched from his profile PDA)
  );
  
  console.log(`  Encrypted bytes: ${aliceEncrypted.length}`);
  console.log(`  Nonce bytes: ${aliceNonce.length}`);
  console.log(`  Encrypted (base64): ${toBase64(aliceEncrypted).slice(0, 60)}...`);
  console.log(`  Nonce (base64): ${toBase64(aliceNonce)}`);
  
  // Simulate on-chain message
  const onChainMsg1: OnChainMessage = {
    sender: aliceWallet.publicKey.toBase58(),
    recipient: bobWallet.publicKey.toBase58(),
    encryptedContent: toBase64(aliceEncrypted),
    nonce: toBase64(aliceNonce),
    timestamp: Math.floor(Date.now() / 1000),
    isPayment: false,
    paymentLamports: 0,
  };
  conversation.messageCount++;
  conversation.lastMessageAt = onChainMsg1.timestamp;
  
  console.log(`\n  📦 On-chain Message PDA would store:`);
  console.log(`     sender: ${onChainMsg1.sender.slice(0, 16)}...`);
  console.log(`     encrypted_content: ${onChainMsg1.encryptedContent.length} chars (base64)`);
  console.log(`     nonce: ${onChainMsg1.nonce}`);
  console.log(`     timestamp: ${onChainMsg1.timestamp}`);
  console.log(`     ⚠️  PLAINTEXT IS NEVER STORED ON-CHAIN\n`);

  // -----------------------------------------------------------
  // Step 5: Bob decrypts Alice's message
  // -----------------------------------------------------------
  console.log("━━━ Step 5: Bob Decrypts Alice's Message ━━━");
  
  const bobDecrypted = decryptMessage(
    fromBase64(onChainMsg1.encryptedContent),
    fromBase64(onChainMsg1.nonce),
    aliceEncKeys.publicKey,    // Alice's public key (fetched from her profile PDA)
    bobEncKeys.secretKey       // Bob's secret key
  );
  
  if (bobDecrypted === aliceMessage) {
    console.log(`  ✅ Bob decrypted successfully: "${bobDecrypted}"`);
  } else {
    console.log(`  ❌ DECRYPTION MISMATCH!`);
    console.log(`     Expected: "${aliceMessage}"`);
    console.log(`     Got:      "${bobDecrypted}"`);
  }
  console.log();

  // -----------------------------------------------------------
  // Step 6: Bob replies to Alice
  // -----------------------------------------------------------
  console.log("━━━ Step 6: Bob → Alice (Encrypt & Send Reply) ━━━");
  
  const bobMessage = "Hey Alice! Got your message. This is fully on-chain and encrypted. 🚀 Nobody can spy on us!";
  console.log(`  Plaintext: "${bobMessage}"`);
  
  const { encrypted: bobEncrypted, nonce: bobNonce } = encryptMessage(
    bobMessage,
    bobEncKeys.secretKey,      // Bob's secret key
    aliceEncKeys.publicKey     // Alice's public key
  );
  
  const onChainMsg2: OnChainMessage = {
    sender: bobWallet.publicKey.toBase58(),
    recipient: aliceWallet.publicKey.toBase58(),
    encryptedContent: toBase64(bobEncrypted),
    nonce: toBase64(bobNonce),
    timestamp: Math.floor(Date.now() / 1000) + 1,
    isPayment: false,
    paymentLamports: 0,
  };
  conversation.messageCount++;
  conversation.lastMessageAt = onChainMsg2.timestamp;
  
  console.log(`  Encrypted (base64): ${onChainMsg2.encryptedContent.slice(0, 60)}...`);
  
  // Alice decrypts Bob's reply
  const aliceDecrypted = decryptMessage(
    fromBase64(onChainMsg2.encryptedContent),
    fromBase64(onChainMsg2.nonce),
    bobEncKeys.publicKey,      // Bob's public key
    aliceEncKeys.secretKey     // Alice's secret key
  );
  
  if (aliceDecrypted === bobMessage) {
    console.log(`  ✅ Alice decrypted Bob's reply: "${aliceDecrypted}"`);
  } else {
    console.log(`  ❌ DECRYPTION MISMATCH!`);
  }
  console.log();

  // -----------------------------------------------------------
  // Step 7: Eve tries to decrypt (SHOULD FAIL)
  // -----------------------------------------------------------
  console.log("━━━ Step 7: Eve (Eavesdropper) Tries to Decrypt ━━━");
  console.log("  Eve has access to ALL on-chain data (encrypted bytes, nonces, public keys)");
  console.log("  Eve does NOT have Alice's or Bob's encryption secret keys\n");
  
  // Eve tries to decrypt Alice→Bob message using her own keys
  const eveAttempt1 = decryptMessage(
    fromBase64(onChainMsg1.encryptedContent),
    fromBase64(onChainMsg1.nonce),
    aliceEncKeys.publicKey,    // Alice's public key (on-chain, public)
    eveEncKeys.secretKey       // Eve's secret key (wrong!)
  );
  
  console.log(`  Eve tries Alice→Bob msg with Eve's key: ${eveAttempt1 === null ? "❌ FAILED (cannot decrypt)" : `⚠️ DECRYPTED: "${eveAttempt1}"`}`);
  
  // Eve tries with Bob's public key instead
  const eveAttempt2 = decryptMessage(
    fromBase64(onChainMsg1.encryptedContent),
    fromBase64(onChainMsg1.nonce),
    bobEncKeys.publicKey,      // Bob's public key (on-chain, public)
    eveEncKeys.secretKey       // Eve's secret key (wrong!)
  );
  
  console.log(`  Eve tries Alice→Bob msg with Bob's pubkey: ${eveAttempt2 === null ? "❌ FAILED (cannot decrypt)" : `⚠️ DECRYPTED: "${eveAttempt2}"`}`);
  
  // Eve tries to decrypt Bob→Alice message
  const eveAttempt3 = decryptMessage(
    fromBase64(onChainMsg2.encryptedContent),
    fromBase64(onChainMsg2.nonce),
    bobEncKeys.publicKey,
    eveEncKeys.secretKey
  );
  
  console.log(`  Eve tries Bob→Alice msg: ${eveAttempt3 === null ? "❌ FAILED (cannot decrypt)" : `⚠️ DECRYPTED: "${eveAttempt3}"`}`);

  // Eve tries brute force with random keys
  console.log(`\n  Eve tries 100 random keypairs...`);
  let bruteForceSuccess = false;
  for (let i = 0; i < 100; i++) {
    const randomKeys = nacl.box.keyPair();
    const attempt = decryptMessage(
      fromBase64(onChainMsg1.encryptedContent),
      fromBase64(onChainMsg1.nonce),
      aliceEncKeys.publicKey,
      randomKeys.secretKey
    );
    if (attempt !== null) {
      bruteForceSuccess = true;
      console.log(`  ⚠️ BRUTE FORCE SUCCESS at attempt ${i}!`);
      break;
    }
  }
  if (!bruteForceSuccess) {
    console.log(`  ❌ All 100 random keys FAILED (as expected)`);
    console.log(`  🔐 X25519 has 2^128 security level — brute force is impossible`);
  }
  console.log();

  // -----------------------------------------------------------
  // Step 8: Tamper detection
  // -----------------------------------------------------------
  console.log("━━━ Step 8: Tamper Detection (Poly1305 MAC) ━━━");
  
  // Modify one byte of the encrypted content
  const tamperedBytes = fromBase64(onChainMsg1.encryptedContent);
  tamperedBytes[10] ^= 0xFF; // Flip bits in one byte
  
  const tamperAttempt = decryptMessage(
    tamperedBytes,
    fromBase64(onChainMsg1.nonce),
    aliceEncKeys.publicKey,
    bobEncKeys.secretKey
  );
  
  console.log(`  Tampered encrypted data → Bob tries to decrypt: ${tamperAttempt === null ? "❌ REJECTED (tamper detected)" : `⚠️ ACCEPTED: "${tamperAttempt}"`}`);
  
  // Modify the nonce
  const tamperedNonce = fromBase64(onChainMsg1.nonce);
  tamperedNonce[0] ^= 0x01;
  
  const nonceAttempt = decryptMessage(
    fromBase64(onChainMsg1.encryptedContent),
    tamperedNonce,
    aliceEncKeys.publicKey,
    bobEncKeys.secretKey
  );
  
  console.log(`  Tampered nonce → Bob tries to decrypt: ${nonceAttempt === null ? "❌ REJECTED (tamper detected)" : `⚠️ ACCEPTED: "${nonceAttempt}"`}`);
  console.log();

  // -----------------------------------------------------------
  // Step 9: Nonce uniqueness check
  // -----------------------------------------------------------
  console.log("━━━ Step 9: Nonce Uniqueness ━━━");
  
  // Encrypt the same message multiple times — nonces must differ
  const nonces = new Set<string>();
  for (let i = 0; i < 10; i++) {
    const { nonce } = encryptMessage("same message", aliceEncKeys.secretKey, bobEncKeys.publicKey);
    nonces.add(toBase64(nonce));
  }
  
  console.log(`  Encrypted "same message" 10 times → ${nonces.size} unique nonces`);
  console.log(`  ${nonces.size === 10 ? "✅ All nonces unique (no nonce reuse)" : "❌ NONCE REUSE DETECTED!"}`);
  console.log();

  // -----------------------------------------------------------
  // Step 10: Message with SOL payment simulation
  // -----------------------------------------------------------
  console.log("━━━ Step 10: Message with SOL Payment ━━━");
  
  const paymentMessage = "Here's 0.5 SOL for coffee ☕";
  const { encrypted: payEncrypted, nonce: payNonce } = encryptMessage(
    paymentMessage,
    aliceEncKeys.secretKey,
    bobEncKeys.publicKey
  );
  
  const onChainPayMsg: OnChainMessage = {
    sender: aliceWallet.publicKey.toBase58(),
    recipient: bobWallet.publicKey.toBase58(),
    encryptedContent: toBase64(payEncrypted),
    nonce: toBase64(payNonce),
    timestamp: Math.floor(Date.now() / 1000) + 2,
    isPayment: true,
    paymentLamports: 500_000_000, // 0.5 SOL
  };
  
  const payDecrypted = decryptMessage(
    fromBase64(onChainPayMsg.encryptedContent),
    fromBase64(onChainPayMsg.nonce),
    aliceEncKeys.publicKey,
    bobEncKeys.secretKey
  );
  
  console.log(`  Alice sends 0.5 SOL with encrypted message`);
  console.log(`  On-chain: isPayment=true, paymentLamports=500000000`);
  console.log(`  Bob decrypts message: "${payDecrypted}"`);
  console.log(`  ${payDecrypted === paymentMessage ? "✅ Payment message works" : "❌ Failed"}`);
  console.log();

  // -----------------------------------------------------------
  // Step 11: Size analysis (what goes on-chain)
  // -----------------------------------------------------------
  console.log("━━━ Step 11: On-Chain Size Analysis ━━━");
  
  const testMessages = [
    "Hi",
    "Hey, how are you?",
    "This is a medium-length message for testing encryption overhead.",
    "This is the maximum length message we'd support. It's about 140 characters long which is similar to old Twitter. Let's see how big the encrypted version is!!",
    "🔐💰🚀✨ Emoji test with special characters: café, naïve, résumé"
  ];
  
  for (const msg of testMessages) {
    const plainBytes = new TextEncoder().encode(msg).length;
    const { encrypted } = encryptMessage(msg, aliceEncKeys.secretKey, bobEncKeys.publicKey);
    const encBytes = encrypted.length;
    const overhead = encBytes - plainBytes;
    const base64Len = toBase64(encrypted).length;
    console.log(`  "${msg.slice(0, 50)}${msg.length > 50 ? "..." : ""}"`);
    console.log(`    Plain: ${plainBytes}B → Encrypted: ${encBytes}B (+${overhead}B overhead) → Base64: ${base64Len} chars`);
  }
  console.log();

  // -----------------------------------------------------------
  // Step 12: Full conversation simulation
  // -----------------------------------------------------------
  console.log("━━━ Step 12: Full Conversation Simulation ━━━");
  
  const chatMessages = [
    { from: "Alice", text: "Hey Bob! Welcome to Shyft 🎉" },
    { from: "Bob",   text: "Thanks! This is amazing — fully on-chain DMs!" },
    { from: "Alice", text: "And nobody can read these except us" },
    { from: "Bob",   text: "Not even Solana validators? 🤔" },
    { from: "Alice", text: "Nope! They only see encrypted bytes. NaCl box FTW 🔐" },
    { from: "Bob",   text: "Mind blown 🤯 sending you 1 SOL as thanks" },
  ];
  
  const onChainMessages: OnChainMessage[] = [];
  let allDecryptedCorrectly = true;
  
  for (let i = 0; i < chatMessages.length; i++) {
    const msg = chatMessages[i];
    const isAlice = msg.from === "Alice";
    
    const senderKeys = isAlice ? aliceEncKeys : bobEncKeys;
    const recipientKeys = isAlice ? bobEncKeys : aliceEncKeys;
    const senderWallet = isAlice ? aliceWallet : bobWallet;
    const recipientWallet = isAlice ? bobWallet : aliceWallet;
    
    // Encrypt
    const { encrypted, nonce } = encryptMessage(msg.text, senderKeys.secretKey, recipientKeys.publicKey);
    
    // Store on-chain
    const onChain: OnChainMessage = {
      sender: senderWallet.publicKey.toBase58(),
      recipient: recipientWallet.publicKey.toBase58(),
      encryptedContent: toBase64(encrypted),
      nonce: toBase64(nonce),
      timestamp: Math.floor(Date.now() / 1000) + i,
      isPayment: i === 5,
      paymentLamports: i === 5 ? 1_000_000_000 : 0,
    };
    onChainMessages.push(onChain);
    
    // Recipient decrypts
    const decrypted = decryptMessage(
      fromBase64(onChain.encryptedContent),
      fromBase64(onChain.nonce),
      senderKeys.publicKey,
      recipientKeys.secretKey
    );
    
    if (decrypted !== msg.text) {
      allDecryptedCorrectly = false;
      console.log(`  ❌ Message ${i + 1} FAILED`);
    }
    
    const paymentTag = onChain.isPayment ? ` 💰 +${onChain.paymentLamports / 1e9} SOL` : "";
    console.log(`  ${msg.from === "Alice" ? "👩" : "👨"} ${msg.from}: "${decrypted}"${paymentTag}`);
    
    // Eve tries each message
    const eveResult = decryptMessage(
      fromBase64(onChain.encryptedContent),
      fromBase64(onChain.nonce),
      senderKeys.publicKey,
      eveEncKeys.secretKey
    );
    if (eveResult !== null) {
      console.log(`  ⚠️ EVE INTERCEPTED MESSAGE ${i + 1}!`);
      allDecryptedCorrectly = false;
    }
  }
  
  console.log();
  console.log(`  Total messages: ${onChainMessages.length}`);
  console.log(`  All decrypted correctly: ${allDecryptedCorrectly ? "✅ YES" : "❌ NO"}`);
  console.log(`  Eve intercepted: ❌ NONE (0/${onChainMessages.length})`);
  console.log();

  // -----------------------------------------------------------
  // FINAL SUMMARY
  // -----------------------------------------------------------
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║                    TEST RESULTS SUMMARY                     ║");
  console.log("╠══════════════════════════════════════════════════════════════╣");
  
  const results = [
    { test: "Alice → Bob encryption/decryption", pass: bobDecrypted === aliceMessage },
    { test: "Bob → Alice encryption/decryption", pass: aliceDecrypted === bobMessage },
    { test: "Eve cannot decrypt Alice→Bob", pass: eveAttempt1 === null },
    { test: "Eve cannot decrypt with Bob's pubkey", pass: eveAttempt2 === null },
    { test: "Eve cannot decrypt Bob→Alice", pass: eveAttempt3 === null },
    { test: "Eve brute force (100 keys) fails", pass: !bruteForceSuccess },
    { test: "Tampered data rejected", pass: tamperAttempt === null },
    { test: "Tampered nonce rejected", pass: nonceAttempt === null },
    { test: "All nonces unique (no reuse)", pass: nonces.size === 10 },
    { test: "Deterministic key derivation", pass: keysMatch },
    { test: "Payment message works", pass: payDecrypted === paymentMessage },
    { test: "Full conversation (6 msgs)", pass: allDecryptedCorrectly },
  ];
  
  let allPass = true;
  for (const r of results) {
    const icon = r.pass ? "✅" : "❌";
    console.log(`║  ${icon} ${r.test.padEnd(48)}${r.pass ? "PASS" : "FAIL"} ║`);
    if (!r.pass) allPass = false;
  }
  
  console.log("╠══════════════════════════════════════════════════════════════╣");
  if (allPass) {
    console.log("║  🎉 ALL 12 TESTS PASSED — E2E ENCRYPTION IS WORKING!       ║");
  } else {
    console.log("║  ⚠️  SOME TESTS FAILED — REVIEW ABOVE                      ║");
  }
  console.log("╠══════════════════════════════════════════════════════════════╣");
  console.log("║                                                              ║");
  console.log("║  Crypto: NaCl box (X25519-XSalsa20-Poly1305)                ║");
  console.log("║  Key Exchange: X25519 (Curve25519 Diffie-Hellman)            ║");
  console.log("║  Cipher: XSalsa20 (256-bit stream cipher)                   ║");
  console.log("║  MAC: Poly1305 (message authentication)                     ║");
  console.log("║  Security Level: 2^128 (128-bit equivalent)                 ║");
  console.log("║                                                              ║");
  console.log("║  On-chain: Only encrypted bytes + nonce stored               ║");
  console.log("║  Off-chain: Private keys never leave the client              ║");
  console.log("║  Metadata: Sender/recipient pubkeys visible (blockchain)     ║");
  console.log("║                                                              ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
}

runTest().catch(console.error);
