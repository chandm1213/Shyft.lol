/**
 * =====================================================
 *  BOB'S SCRIPT — Runs as a SEPARATE process
 * =====================================================
 *
 * Bob:
 *   1. Loads HIS OWN wallet (from bob-wallet-SECRET.json)
 *   2. Reads chat info (public info only — chat PDA, Alice's wallet)
 *   3. Fetches Alice's encryption PUBLIC KEY from chain (message #0)
 *   4. Publishes HIS encryption PUBLIC KEY on-chain (message #1)
 *   5. Encrypts a message for Alice using her pubkey + his secret key
 *   6. Sends encrypted message on-chain (message #2)
 *
 * Bob NEVER has access to Alice's wallet secret key.
 * Bob NEVER has access to Alice's encryption secret key.
 * Bob NEVER has access to Eve's keys.
 * Bob ONLY has: Alice's encryption PUBLIC key (from chain).
 */

import { Program, AnchorProvider, BN, Wallet } from "@coral-xyz/anchor";
import { Connection, Keypair, SystemProgram } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";
import {
  DEVNET_URL, toBase64, fromBase64,
  deriveEncryptionKeypair, encryptMessage,
  getChatPDA, getMessagePDA,
} from "./shared";

const idl = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "target/idl/shadowspace.json"), "utf-8")
);

async function main() {
  console.log("\n🅱️  ═══ BOB'S PROCESS (pid: " + process.pid + ") ═══\n");

  const connection = new Connection(DEVNET_URL, "confirmed");

  // ─── Step 1: Bob loads HIS OWN wallet ───
  const bobSecret = JSON.parse(
    fs.readFileSync(path.join(__dirname, "bob-wallet-SECRET.json"), "utf-8")
  );
  const bob = Keypair.fromSecretKey(new Uint8Array(bobSecret));
  const bobEnc = deriveEncryptionKeypair(bob);

  console.log("  Bob wallet:        ", bob.publicKey.toBase58());
  console.log("  Bob enc pubkey:    ", toBase64(bobEnc.publicKey));
  console.log("  Bob enc SECRET:     [exists only in THIS process memory]\n");

  // Verify: does Bob have Alice's secret key? NO!
  console.log("  Does Bob have Alice's wallet secret key? NO ❌");
  console.log("  Does Bob have Alice's encryption secret key? NO ❌");
  const aliceSecretExists = fs.existsSync(path.join(__dirname, "alice-wallet-SECRET.json"));
  console.log(`  Can Bob read alice-wallet-SECRET.json? ${aliceSecretExists ? "File exists (but Bob DOESN'T use it)" : "N/A"}`);
  console.log("  Bob ONLY uses: chat-info.json (public) + bob-wallet-SECRET.json (his own)\n");

  // ─── Step 2: Read chat info (PUBLIC info only) ───
  const chatInfo = JSON.parse(
    fs.readFileSync(path.join(__dirname, "chat-info.json"), "utf-8")
  );
  const chatId = new BN(chatInfo.chatId);
  const [chatPDA] = getChatPDA(chatId);

  console.log("  Chat ID (from public chat-info.json):", chatInfo.chatId);
  console.log("  Alice wallet (public):", chatInfo.aliceWallet);

  // ─── Step 3: Fetch Alice's encryption PUBLIC KEY from chain ───
  const bobProgram = new Program(
    idl as any,
    new AnchorProvider(connection, new Wallet(bob), { commitment: "confirmed" })
  );

  console.log("\n  Reading message #0 from chain (Alice's key exchange)...");
  const [keyMsgPDA] = getMessagePDA(chatId, new BN(0));
  const keyMsg = await bobProgram.account.message.fetch(keyMsgPDA);
  const keyContent = keyMsg.content as string;

  console.log(`  On-chain content: "${keyContent}"`);

  // Parse Alice's encryption pubkey from chain
  if (!keyContent.startsWith("PUBKEY:")) {
    throw new Error("Expected PUBKEY: prefix in message #0");
  }
  const aliceEncPubkeyFromChain = fromBase64(keyContent.replace("PUBKEY:", ""));
  console.log(`  Alice's enc pubkey (FROM CHAIN): ${toBase64(aliceEncPubkeyFromChain)}`);
  console.log("  ✅ Bob got Alice's PUBLIC encryption key from the blockchain!\n");

  // ─── Step 4: Bob publishes HIS encryption PUBLIC KEY (message #1) ───
  const bobKeyExchange = `PUBKEY:${toBase64(bobEnc.publicKey)}`;
  const [bobKeyPDA] = getMessagePDA(chatId, new BN(1));

  console.log("  Publishing Bob's encryption pubkey on-chain (message #1)...");
  await bobProgram.methods
    .sendMessage(chatId, new BN(1), bobKeyExchange, false, new BN(0))
    .accounts({
      message: bobKeyPDA,
      chat: chatPDA,
      sender: bob.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  console.log("  ✅ Bob's pubkey published!\n");

  // ─── Step 5: Encrypt a message for Alice ───
  const bobPlaintext = "Hey Alice! This is Bob. I read your pubkey FROM THE CHAIN and encrypted this for you. Nobody else can read this! 🔐";
  console.log(`  Plaintext: "${bobPlaintext}"`);

  const { encrypted, nonce } = encryptMessage(
    bobPlaintext,
    bobEnc.secretKey,           // Bob's SECRET encryption key (only Bob has this)
    aliceEncPubkeyFromChain     // Alice's PUBLIC encryption key (from chain)
  );

  const onChainContent = `ENC:${toBase64(nonce)}:${toBase64(encrypted)}`;
  console.log(`  Encrypted: ${onChainContent.slice(0, 60)}...`);
  console.log(`  On-chain size: ${onChainContent.length} chars\n`);

  // ─── Step 6: Send encrypted message on-chain (message #2) ───
  const [msgPDA] = getMessagePDA(chatId, new BN(2));

  const preBal = await connection.getBalance(bob.publicKey);
  await bobProgram.methods
    .sendMessage(chatId, new BN(2), onChainContent, false, new BN(0))
    .accounts({
      message: msgPDA,
      chat: chatPDA,
      sender: bob.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  const postBal = await connection.getBalance(bob.publicKey);

  console.log("  ✅ Encrypted message sent on-chain!");
  console.log(`  💰 Cost: ${((preBal - postBal) / 1e9).toFixed(6)} SOL`);
  console.log(`  Message PDA: ${msgPDA.toBase58()}`);
  console.log("\n  ⏳ Now run Eve's script: npx tsx test-p2p/eve-spy.ts");
  console.log("  ⏳ Then run Alice's follow-up: npx tsx test-p2p/alice-read.ts\n");
}

main().catch(console.error);
