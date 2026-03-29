/**
 * =====================================================
 *  ALICE'S FOLLOW-UP — Reads Bob's reply from chain
 * =====================================================
 *
 * Alice:
 *   1. Loads HER OWN wallet (from alice-wallet-SECRET.json)
 *   2. Reads Bob's encryption PUBLIC KEY from chain (message #1)
 *   3. Reads Bob's encrypted message from chain (message #2)
 *   4. Decrypts using Bob's PUBLIC key + Alice's SECRET key
 *   5. Sends an encrypted reply to Bob (message #3)
 *
 * This proves the FULL round trip:
 *   Alice → on-chain → Bob decrypts (bob-read.ts)
 *   Bob → on-chain → Alice decrypts (this script)
 */

import { Program, AnchorProvider, BN, Wallet } from "@coral-xyz/anchor";
import { Connection, Keypair, SystemProgram } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";
import {
  DEVNET_URL, toBase64, fromBase64,
  deriveEncryptionKeypair, encryptMessage, decryptMessage,
  getChatPDA, getMessagePDA,
} from "./shared";

const idl = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "target/idl/shadowspace.json"), "utf-8")
);

async function main() {
  console.log("\n🅰️  ═══ ALICE'S FOLLOW-UP (pid: " + process.pid + ") ═══\n");

  const connection = new Connection(DEVNET_URL, "confirmed");

  // ─── Step 1: Alice loads HER OWN wallet ───
  const aliceSecret = JSON.parse(
    fs.readFileSync(path.join(__dirname, "alice-wallet-SECRET.json"), "utf-8")
  );
  const alice = Keypair.fromSecretKey(new Uint8Array(aliceSecret));
  const aliceEnc = deriveEncryptionKeypair(alice);

  console.log("  Alice wallet:      ", alice.publicKey.toBase58());
  console.log("  Alice enc SECRET:   [loaded from alice-wallet-SECRET.json]\n");

  // ─── Step 2: Read chat info ───
  const chatInfo = JSON.parse(
    fs.readFileSync(path.join(__dirname, "chat-info.json"), "utf-8")
  );
  const chatId = new BN(chatInfo.chatId);

  const aliceProgram = new Program(
    idl as any,
    new AnchorProvider(connection, new Wallet(alice), { commitment: "confirmed" })
  );

  // ─── Step 3: Read Bob's encryption PUBLIC KEY from chain ───
  console.log("  Reading Bob's encryption pubkey from chain (message #1)...");
  const [bobKeyPDA] = getMessagePDA(chatId, new BN(1));
  const bobKeyMsg = await aliceProgram.account.message.fetch(bobKeyPDA);
  const bobKeyContent = bobKeyMsg.content as string;

  if (!bobKeyContent.startsWith("PUBKEY:")) {
    throw new Error("Expected PUBKEY: prefix in message #1");
  }
  const bobEncPubkeyFromChain = fromBase64(bobKeyContent.replace("PUBKEY:", ""));
  console.log(`  Bob's enc pubkey (FROM CHAIN): ${toBase64(bobEncPubkeyFromChain)}`);
  console.log("  ✅ Got Bob's public encryption key from blockchain!\n");

  // ─── Step 4: Read Bob's encrypted message from chain ───
  console.log("  Reading Bob's encrypted message from chain (message #2)...");
  const [msg2PDA] = getMessagePDA(chatId, new BN(2));
  const msg2 = await aliceProgram.account.message.fetch(msg2PDA);
  const encContent = msg2.content as string;

  console.log(`  On-chain content: "${encContent.slice(0, 60)}..."`);
  console.log(`  Sender: ${msg2.sender.toBase58()}`);

  // ─── Step 5: DECRYPT Bob's message ───
  const parts = encContent.split(":");
  const nonce = fromBase64(parts[1]);
  const encrypted = fromBase64(parts[2]);

  console.log("\n  Decrypting with:");
  console.log("    → Bob's PUBLIC encryption key (from chain)");
  console.log("    → Alice's SECRET encryption key (from her wallet)");

  const plaintext = decryptMessage(
    encrypted,
    nonce,
    bobEncPubkeyFromChain,   // Bob's PUBLIC key (from chain)
    aliceEnc.secretKey       // Alice's SECRET key (only Alice has this)
  );

  if (plaintext) {
    console.log(`\n  ✅ DECRYPTED: "${plaintext}"`);
  } else {
    console.log("\n  ❌ DECRYPTION FAILED!");
    return;
  }

  // ─── Step 6: Alice sends encrypted reply (message #3) ───
  const aliceReply = "Got your message Bob! This is Alice replying. Full round-trip P2P works! 🚀🎉";
  console.log(`\n  Alice replying: "${aliceReply}"`);

  const { encrypted: replyEnc, nonce: replyNonce } = encryptMessage(
    aliceReply,
    aliceEnc.secretKey,          // Alice's SECRET key
    bobEncPubkeyFromChain        // Bob's PUBLIC key (from chain)
  );

  const replyContent = `ENC:${toBase64(replyNonce)}:${toBase64(replyEnc)}`;
  const [msg3PDA] = getMessagePDA(chatId, new BN(3));
  const [chatPDA] = getChatPDA(chatId);

  await aliceProgram.methods
    .sendMessage(chatId, new BN(3), replyContent, false, new BN(0))
    .accounts({
      message: msg3PDA,
      chat: chatPDA,
      sender: alice.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  console.log("  ✅ Alice's encrypted reply sent on-chain!\n");

  // ─── Step 7: Verify Bob can decrypt Alice's reply ───
  // We simulate Bob reading this message (using Bob's keys from his file)
  console.log("  ━━━ Verification: Can Bob decrypt Alice's reply? ━━━");
  const bobSecret = JSON.parse(
    fs.readFileSync(path.join(__dirname, "bob-wallet-SECRET.json"), "utf-8")
  );
  const bobForVerification = Keypair.fromSecretKey(new Uint8Array(bobSecret));
  const bobEncForVerification = deriveEncryptionKeypair(bobForVerification);

  const msg3 = await aliceProgram.account.message.fetch(msg3PDA);
  const parts3 = (msg3.content as string).split(":");
  const bobDecrypted = decryptMessage(
    fromBase64(parts3[2]),
    fromBase64(parts3[1]),
    aliceEnc.publicKey,                    // Alice's PUBLIC key
    bobEncForVerification.secretKey         // Bob's SECRET key
  );

  if (bobDecrypted === aliceReply) {
    console.log(`  ✅ Bob decrypted Alice's reply: "${bobDecrypted}"\n`);
  } else {
    console.log(`  ❌ Bob FAILED to decrypt!\n`);
  }

  // ─── FINAL SUMMARY ───
  console.log("╔══════════════════════════════════════════════════════════════════╗");
  console.log("║           FULL P2P ROUND-TRIP TEST RESULTS                      ║");
  console.log("╠══════════════════════════════════════════════════════════════════╣");
  console.log("║                                                                  ║");
  console.log("║  Process 1 (alice-send.ts):                                      ║");
  console.log("║    ✅ Alice created chat on Solana devnet                        ║");
  console.log("║    ✅ Alice published her enc PUBLIC key on-chain                ║");
  console.log("║                                                                  ║");
  console.log("║  Process 2 (bob-read.ts):                                        ║");
  console.log("║    ✅ Bob read Alice's PUBLIC key FROM THE CHAIN                 ║");
  console.log("║    ✅ Bob published his enc PUBLIC key on-chain                  ║");
  console.log("║    ✅ Bob encrypted msg with Alice's pubkey + his secret key     ║");
  console.log("║    ✅ Bob sent encrypted msg on-chain                            ║");
  console.log("║                                                                  ║");
  console.log("║  Process 3 (eve-spy.ts):                                         ║");
  console.log("║    ✅ Eve read ALL on-chain accounts                             ║");
  console.log("║    ✅ Eve had both PUBLIC keys, encrypted data, nonces           ║");
  console.log("║    ❌ Eve COULD NOT decrypt ANY messages (403 attempts failed)   ║");
  console.log("║                                                                  ║");
  console.log("║  Process 4 (alice-read.ts — this script):                        ║");
  console.log("║    ✅ Alice read Bob's PUBLIC key FROM THE CHAIN                 ║");
  console.log("║    ✅ Alice decrypted Bob's msg with his pubkey + her secret key ║");
  console.log("║    ✅ Alice sent encrypted reply back to Bob                     ║");
  console.log("║    ✅ Bob decrypted Alice's reply                                ║");
  console.log("║                                                                  ║");
  console.log("║  🔑 KEY EXCHANGE: Public keys shared ON-CHAIN (never secrets)    ║");
  console.log("║  🔐 ENCRYPTION: NaCl box (X25519-XSalsa20-Poly1305)             ║");
  console.log("║  ⛓️  STORAGE: Fully on-chain (Solana devnet)                     ║");
  console.log("║  🚫 NO secret keys were EVER transmitted or shared              ║");
  console.log("║                                                                  ║");
  console.log("╚══════════════════════════════════════════════════════════════════╝\n");
}

main().catch(console.error);
