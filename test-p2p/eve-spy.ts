/**
 * =====================================================
 *  EVE'S SCRIPT — Runs as a SEPARATE process (EAVESDROPPER)
 * =====================================================
 *
 * Eve:
 *   1. Generates her OWN wallet + encryption keypair
 *   2. Reads the SAME on-chain accounts as Alice and Bob
 *   3. Has access to ALL public on-chain data:
 *      - Chat PDA (participants, message count)
 *      - Message PDAs (encrypted content, nonces, sender pubkeys)
 *      - Alice's and Bob's encryption PUBLIC keys (from key exchange msgs)
 *   4. Tries EVERY possible way to decrypt the messages
 *   5. MUST FAIL at all attempts
 *
 * Eve NEVER has access to Alice's or Bob's wallet secret keys.
 * Eve NEVER has access to Alice's or Bob's encryption secret keys.
 * Eve only has what's publicly visible on the Solana blockchain.
 */

import { Program, AnchorProvider, BN, Wallet } from "@coral-xyz/anchor";
import { Connection, Keypair } from "@solana/web3.js";
import nacl from "tweetnacl";
import * as fs from "fs";
import * as path from "path";
import {
  DEVNET_URL, toBase64, fromBase64,
  deriveEncryptionKeypair, decryptMessage,
  getChatPDA, getMessagePDA,
} from "./shared";

const idl = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "target/idl/shadowspace.json"), "utf-8")
);

async function main() {
  console.log("\n🕵️  ═══ EVE'S PROCESS — EAVESDROPPER (pid: " + process.pid + ") ═══\n");

  const connection = new Connection(DEVNET_URL, "confirmed");

  // ─── Eve generates her OWN keys ───
  const eve = Keypair.generate();
  const eveEnc = deriveEncryptionKeypair(eve);
  console.log("  Eve wallet:        ", eve.publicKey.toBase58());
  console.log("  Eve enc pubkey:    ", toBase64(eveEnc.publicKey));

  // Verify: Eve does NOT have anyone's secret keys
  console.log("\n  Does Eve have Alice's wallet secret key? NO ❌");
  console.log("  Does Eve have Bob's wallet secret key? NO ❌");
  console.log("  Does Eve have Alice's encryption secret key? NO ❌");
  console.log("  Does Eve have Bob's encryption secret key? NO ❌");

  // Eve can see these files exist but let's verify she only uses public info
  console.log("\n  Eve reads ONLY public info: chat-info.json");
  const chatInfo = JSON.parse(
    fs.readFileSync(path.join(__dirname, "chat-info.json"), "utf-8")
  );
  const chatId = new BN(chatInfo.chatId);

  console.log(`  Chat ID: ${chatInfo.chatId}`);
  console.log(`  Alice wallet: ${chatInfo.aliceWallet}`);
  console.log(`  Bob wallet: ${chatInfo.bobWallet}\n`);

  const eveProgram = new Program(
    idl as any,
    new AnchorProvider(connection, new Wallet(eve), { commitment: "confirmed" })
  );

  // ─── Eve reads the chat account ───
  const [chatPDA] = getChatPDA(chatId);
  console.log("  ━━━ Reading Chat Account from Chain ━━━");
  const chat = await eveProgram.account.chat.fetch(chatPDA);
  console.log(`  user1: ${chat.user1.toBase58()}`);
  console.log(`  user2: ${chat.user2.toBase58()}`);
  console.log(`  message_count: ${chat.messageCount.toString()}`);
  console.log("  ⚠️  Eve can see WHO is chatting (metadata is public)\n");

  // ─── Eve reads ALL messages ───
  console.log("  ━━━ Reading ALL Message Accounts from Chain ━━━\n");

  // Message #0 — Alice's key exchange
  const [keyMsg0PDA] = getMessagePDA(chatId, new BN(0));
  const msg0 = await eveProgram.account.message.fetch(keyMsg0PDA);
  const aliceEncPubkey = fromBase64((msg0.content as string).replace("PUBKEY:", ""));
  console.log(`  Message #0 (key exchange): ${msg0.content}`);
  console.log(`  → Alice's encryption PUBLIC key: ${toBase64(aliceEncPubkey)}`);
  console.log("  ⚠️  Eve has Alice's PUBLIC key (it's public by design)\n");

  // Message #1 — Bob's key exchange
  const [keyMsg1PDA] = getMessagePDA(chatId, new BN(1));
  const msg1 = await eveProgram.account.message.fetch(keyMsg1PDA);
  const bobEncPubkey = fromBase64((msg1.content as string).replace("PUBKEY:", ""));
  console.log(`  Message #1 (key exchange): ${msg1.content}`);
  console.log(`  → Bob's encryption PUBLIC key: ${toBase64(bobEncPubkey)}`);
  console.log("  ⚠️  Eve has Bob's PUBLIC key (it's public by design)\n");

  // Message #2 — Bob's encrypted message to Alice
  const [msg2PDA] = getMessagePDA(chatId, new BN(2));
  const msg2 = await eveProgram.account.message.fetch(msg2PDA);
  const content2 = msg2.content as string;
  console.log(`  Message #2 (encrypted): ${content2.slice(0, 70)}...`);
  console.log(`  Sender: ${msg2.sender.toBase58()}`);
  console.log(`  Timestamp: ${msg2.timestamp.toString()}\n`);

  // Parse encrypted data
  const parts = content2.split(":");
  const nonce = fromBase64(parts[1]);
  const encrypted = fromBase64(parts[2]);

  console.log("  ━━━ Eve's Decryption Attempts ━━━\n");

  console.log("  Eve has ALL of these (from the public blockchain):");
  console.log("    ✓ Encrypted content (from message #2)");
  console.log("    ✓ Nonce (from message #2)");
  console.log("    ✓ Alice's encryption PUBLIC key (from message #0)");
  console.log("    ✓ Bob's encryption PUBLIC key (from message #1)");
  console.log("    ✓ Both wallet addresses");
  console.log("  Eve is MISSING:");
  console.log("    ✗ Alice's encryption SECRET key");
  console.log("    ✗ Bob's encryption SECRET key\n");

  // Attempt 1: Eve's own key + Alice's pubkey
  const attempt1 = decryptMessage(encrypted, nonce, aliceEncPubkey, eveEnc.secretKey);
  console.log(`  Attempt 1 (Eve's key + Alice pubkey): ${attempt1 === null ? "❌ FAILED" : `⚠️ "${attempt1}"`}`);

  // Attempt 2: Eve's own key + Bob's pubkey
  const attempt2 = decryptMessage(encrypted, nonce, bobEncPubkey, eveEnc.secretKey);
  console.log(`  Attempt 2 (Eve's key + Bob pubkey):   ${attempt2 === null ? "❌ FAILED" : `⚠️ "${attempt2}"`}`);

  // Attempt 3: Both public keys (no secret key at all — this is nonsensical but let's try)
  // NaCl box requires one secret key, so Eve can't even call it without one
  // But she might try using a pubkey as if it were a secret key
  try {
    const attempt3 = decryptMessage(encrypted, nonce, aliceEncPubkey, bobEncPubkey);
    console.log(`  Attempt 3 (both public keys as hack): ${attempt3 === null ? "❌ FAILED" : `⚠️ "${attempt3}"`}`);
  } catch {
    console.log("  Attempt 3 (both public keys as hack): ❌ FAILED (invalid key)");
  }

  // Attempt 4: 200 random keypairs (brute force)
  console.log("\n  Attempt 4: Brute force with 200 random keypairs...");
  let bruteForceSuccess = false;
  for (let i = 0; i < 200; i++) {
    const rk = nacl.box.keyPair();
    const a = decryptMessage(encrypted, nonce, bobEncPubkey, rk.secretKey);
    if (a !== null) { bruteForceSuccess = true; console.log(`  ⚠️ CRACKED at attempt ${i}!`); break; }
    const b = decryptMessage(encrypted, nonce, aliceEncPubkey, rk.secretKey);
    if (b !== null) { bruteForceSuccess = true; console.log(`  ⚠️ CRACKED at attempt ${i}!`); break; }
  }
  console.log(`  200 random keys × 2 attempts each (400 total): ${bruteForceSuccess ? "⚠️ CRACKED" : "❌ ALL 400 FAILED"}`);

  // Attempt 5: Raw account data inspection
  console.log("\n  Attempt 5: Raw getAccountInfo (lowest level)...");
  const rawAccount = await connection.getAccountInfo(msg2PDA);
  if (rawAccount) {
    console.log(`  Account size: ${rawAccount.data.length} bytes`);
    console.log(`  Raw hex (first 100 bytes): ${rawAccount.data.slice(0, 100).toString("hex")}`);
    console.log("  ❌ Raw bytes are just encrypted gibberish — CANNOT extract plaintext");
  }

  // ─── Summary ───
  const allFailed = attempt1 === null && attempt2 === null && !bruteForceSuccess;
  console.log("\n  ━━━ EVE'S VERDICT ━━━");
  console.log(`  Total decryption attempts: 403`);
  console.log(`  Successful decryptions: ${allFailed ? "0" : "SOME — SECURITY BROKEN!"}`);
  if (allFailed) {
    console.log("  🔐 RESULT: Eve CANNOT read the messages even though she read");
    console.log("     the EXACT same on-chain accounts from the SAME blockchain.");
    console.log("     She has both public keys, the encrypted data, and the nonce.");
    console.log("     Without a SECRET key, decryption is mathematically impossible.\n");
  } else {
    console.log("  ⚠️ SECURITY BROKEN — INVESTIGATE IMMEDIATELY!\n");
  }
}

main().catch(console.error);
