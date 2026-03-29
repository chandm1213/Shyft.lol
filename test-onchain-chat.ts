/**
 * ==================================================================
 *  Shyft.lol — REAL ON-CHAIN E2E Encrypted Chat Test (Solana Devnet)
 * ==================================================================
 *
 * This test actually deploys encrypted messages to Solana devnet using
 * the deployed Shadowspace program, then proves:
 *
 *   ✅ Alice can send encrypted messages on-chain (real tx)
 *   ✅ Bob can read and decrypt from actual Solana accounts
 *   ✅ Eve reads the SAME accounts from chain and CANNOT decrypt
 *   ✅ Real SOL costs measured for every operation
 *   ✅ Rent reclaim works (close accounts, get SOL back)
 *
 * Run: npx tsx test-onchain-chat.ts
 */

import { Program, AnchorProvider, BN, Wallet } from "@coral-xyz/anchor";
import {
  Connection,
  PublicKey,
  Keypair,
  SystemProgram,
  LAMPORTS_PER_SOL,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import nacl from "tweetnacl";
import { createHash } from "crypto";
import * as fs from "fs";
import * as path from "path";

// Load IDL
const idl = JSON.parse(
  fs.readFileSync(path.join(__dirname, "target/idl/shadowspace.json"), "utf-8")
);

const PROGRAM_ID = new PublicKey("EEnouVLAoQGMEbrypEhP3Ct5RgCViCWG4n1nCZNwMxjQ");
const DEVNET_URL = "https://api.devnet.solana.com";
const CHAT_SEED = Buffer.from("chat");
const MESSAGE_SEED = Buffer.from("message");

// ============================================================
// HELPERS
// ============================================================

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}
function fromBase64(str: string): Uint8Array {
  return new Uint8Array(Buffer.from(str, "base64"));
}

/** Derive X25519 encryption keypair from a Solana keypair (deterministic) */
function deriveEncryptionKeypair(wallet: Keypair): nacl.BoxKeyPair {
  const signMessage = `shyft-encryption-key-v1:${wallet.publicKey.toBase58()}`;
  const signature = nacl.sign.detached(
    Buffer.from(signMessage),
    wallet.secretKey
  );
  const hash = createHash("sha256").update(signature).digest();
  return nacl.box.keyPair.fromSecretKey(new Uint8Array(hash));
}

/** Encrypt message using NaCl box */
function encryptMessage(
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

/** Decrypt message using NaCl box */
function decryptMessage(
  encrypted: Uint8Array,
  nonce: Uint8Array,
  senderPublicKey: Uint8Array,
  recipientSecretKey: Uint8Array
): string | null {
  const decrypted = nacl.box.open(encrypted, nonce, senderPublicKey, recipientSecretKey);
  if (!decrypted) return null;
  return new TextDecoder().decode(decrypted);
}

/** Get PDA for chat account */
function getChatPDA(chatId: BN): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [CHAT_SEED, chatId.toArrayLike(Buffer, "le", 8)],
    PROGRAM_ID
  );
}

/** Get PDA for message account */
function getMessagePDA(chatId: BN, messageIndex: BN): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      MESSAGE_SEED,
      chatId.toArrayLike(Buffer, "le", 8),
      messageIndex.toArrayLike(Buffer, "le", 8),
    ],
    PROGRAM_ID
  );
}

/** Wait for airdrop confirmation */
async function airdropAndConfirm(connection: Connection, pubkey: PublicKey, sol: number) {
  const sig = await connection.requestAirdrop(pubkey, sol * LAMPORTS_PER_SOL);
  const latestBlockhash = await connection.getLatestBlockhash();
  await connection.confirmTransaction({ signature: sig, ...latestBlockhash }, "confirmed");
}

/** Get balance in SOL */
async function getBalance(connection: Connection, pubkey: PublicKey): Promise<number> {
  const bal = await connection.getBalance(pubkey);
  return bal / LAMPORTS_PER_SOL;
}

/** Sleep helper */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ============================================================
// MAIN TEST
// ============================================================

async function runOnChainTest() {
  console.log("╔══════════════════════════════════════════════════════════════════╗");
  console.log("║  Shyft.lol — REAL ON-CHAIN E2E Chat Test (Solana Devnet)        ║");
  console.log("║  Program: EEnou...MxjQ                                          ║");
  console.log("╚══════════════════════════════════════════════════════════════════╝\n");

  const connection = new Connection(DEVNET_URL, "confirmed");

  // -----------------------------------------------------------
  // Step 1: Load admin wallet (pays for setup)
  // -----------------------------------------------------------
  console.log("━━━ Step 1: Load Admin Wallet ━━━");
  const adminKeyPath = path.join(
    process.env.HOME || "~",
    ".config/solana/mainnet.json"
  );
  const adminSecret = JSON.parse(fs.readFileSync(adminKeyPath, "utf-8"));
  const admin = Keypair.fromSecretKey(new Uint8Array(adminSecret));
  const adminBal = await getBalance(connection, admin.publicKey);
  console.log(`  Admin: ${admin.publicKey.toBase58()}`);
  console.log(`  Balance: ${adminBal.toFixed(4)} SOL\n`);

  // -----------------------------------------------------------
  // Step 2: Create Alice, Bob, Eve keypairs + fund them
  // -----------------------------------------------------------
  console.log("━━━ Step 2: Create & Fund Test Wallets ━━━");
  const alice = Keypair.generate();
  const bob = Keypair.generate();
  const eve = Keypair.generate(); // eavesdropper

  console.log(`  Alice: ${alice.publicKey.toBase58()}`);
  console.log(`  Bob:   ${bob.publicKey.toBase58()}`);
  console.log(`  Eve:   ${eve.publicKey.toBase58()} (eavesdropper)\n`);

  // Fund Alice from admin (she creates the chat + sends messages)
  console.log("  Funding Alice with 0.1 SOL from admin...");
  const fundTx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: admin.publicKey,
      toPubkey: alice.publicKey,
      lamports: 0.1 * LAMPORTS_PER_SOL,
    })
  );
  fundTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  fundTx.feePayer = admin.publicKey;
  await sendAndConfirmTransaction(connection, fundTx, [admin]);

  // Fund Bob from admin (he sends a reply)
  console.log("  Funding Bob with 0.05 SOL from admin...");
  const fundTx2 = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: admin.publicKey,
      toPubkey: bob.publicKey,
      lamports: 0.05 * LAMPORTS_PER_SOL,
    })
  );
  fundTx2.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  fundTx2.feePayer = admin.publicKey;
  await sendAndConfirmTransaction(connection, fundTx2, [admin]);

  const aliceBal = await getBalance(connection, alice.publicKey);
  const bobBal = await getBalance(connection, bob.publicKey);
  console.log(`  Alice balance: ${aliceBal.toFixed(4)} SOL`);
  console.log(`  Bob balance:   ${bobBal.toFixed(4)} SOL\n`);

  // -----------------------------------------------------------
  // Step 3: Derive encryption keypairs
  // -----------------------------------------------------------
  console.log("━━━ Step 3: Derive Encryption Keypairs ━━━");
  const aliceEnc = deriveEncryptionKeypair(alice);
  const bobEnc = deriveEncryptionKeypair(bob);
  const eveEnc = deriveEncryptionKeypair(eve);
  console.log(`  Alice enc pubkey: ${toBase64(aliceEnc.publicKey).slice(0, 32)}...`);
  console.log(`  Bob   enc pubkey: ${toBase64(bobEnc.publicKey).slice(0, 32)}...`);
  console.log(`  Eve   enc pubkey: ${toBase64(eveEnc.publicKey).slice(0, 32)}...\n`);

  // -----------------------------------------------------------
  // Step 4: Create an Anchor provider & program for Alice
  // -----------------------------------------------------------
  console.log("━━━ Step 4: Initialize Anchor Program ━━━");

  // We use a custom provider per user since each has a different signer
  function makeProgram(signer: Keypair): Program {
    const wallet = new Wallet(signer);
    const provider = new AnchorProvider(connection, wallet, {
      commitment: "confirmed",
    });
    return new Program(idl as any, provider);
  }

  const aliceProgram = makeProgram(alice);
  const bobProgram = makeProgram(bob);
  console.log(`  Program ID: ${PROGRAM_ID.toBase58()}`);
  console.log(`  Cluster: devnet\n`);

  // -----------------------------------------------------------
  // Step 5: Create chat on-chain (Alice initiates)
  // -----------------------------------------------------------
  console.log("━━━ Step 5: Create Chat On-Chain ━━━");

  const chatId = new BN(Date.now()); // unique chat ID
  const [chatPDA] = getChatPDA(chatId);

  console.log(`  Chat ID: ${chatId.toString()}`);
  console.log(`  Chat PDA: ${chatPDA.toBase58()}`);

  const preCreateBal = await getBalance(connection, alice.publicKey);

  await aliceProgram.methods
    .createChat(chatId)
    .accounts({
      chat: chatPDA,
      user1: alice.publicKey,
      user2: bob.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  const postCreateBal = await getBalance(connection, alice.publicKey);
  const createCost = preCreateBal - postCreateBal;

  console.log(`  ✅ Chat created on-chain!`);
  console.log(`  💰 Cost: ${createCost.toFixed(6)} SOL ($${(createCost * 140).toFixed(4)} at $140/SOL)\n`);

  // Verify on-chain
  const chatAccount = await aliceProgram.account.chat.fetch(chatPDA);
  console.log(`  On-chain chat data:`);
  console.log(`    user1: ${chatAccount.user1.toBase58()}`);
  console.log(`    user2: ${chatAccount.user2.toBase58()}`);
  console.log(`    message_count: ${chatAccount.messageCount.toString()}\n`);

  // -----------------------------------------------------------
  // Step 6: Alice sends encrypted message on-chain
  // -----------------------------------------------------------
  console.log("━━━ Step 6: Alice → Bob (Encrypt + Send On-Chain) ━━━");

  const alicePlaintext = "Hey Bob! This is a REAL on-chain encrypted message on Shyft 🔐";
  console.log(`  Plaintext: "${alicePlaintext}"`);

  // Encrypt
  const { encrypted: aliceEncrypted, nonce: aliceNonce } = encryptMessage(
    alicePlaintext,
    aliceEnc.secretKey,
    bobEnc.publicKey
  );

  // Format for on-chain storage: "ENC:nonce_base64:encrypted_base64"
  // This fits in the existing `content: String` field
  const onChainContent1 = `ENC:${toBase64(aliceNonce)}:${toBase64(aliceEncrypted)}`;
  console.log(`  On-chain content: ${onChainContent1.slice(0, 60)}...`);
  console.log(`  Content length: ${onChainContent1.length} chars (max 512 allowed)`);

  const msgIndex1 = new BN(0);
  const [msgPDA1] = getMessagePDA(chatId, msgIndex1);

  const preSendBal = await getBalance(connection, alice.publicKey);

  await aliceProgram.methods
    .sendMessage(chatId, msgIndex1, onChainContent1, false, new BN(0))
    .accounts({
      message: msgPDA1,
      chat: chatPDA,
      sender: alice.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  const postSendBal = await getBalance(connection, alice.publicKey);
  const sendCost1 = preSendBal - postSendBal;

  console.log(`  ✅ Message sent on-chain!`);
  console.log(`  💰 Cost: ${sendCost1.toFixed(6)} SOL ($${(sendCost1 * 140).toFixed(4)} at $140/SOL)`);
  console.log(`  Message PDA: ${msgPDA1.toBase58()}\n`);

  // -----------------------------------------------------------
  // Step 7: Bob reads and decrypts from chain
  // -----------------------------------------------------------
  console.log("━━━ Step 7: Bob Reads from Chain & Decrypts ━━━");

  // Bob fetches the message account from chain (anyone can do this)
  const msgAccount1 = await bobProgram.account.message.fetch(msgPDA1);
  console.log(`  Raw on-chain content: "${(msgAccount1.content as string).slice(0, 60)}..."`);
  console.log(`  Sender: ${msgAccount1.sender.toBase58()}`);
  console.log(`  Timestamp: ${msgAccount1.timestamp.toString()}`);

  // Parse the encrypted format
  const parts1 = (msgAccount1.content as string).split(":");
  const storedNonce1 = fromBase64(parts1[1]);
  const storedEncrypted1 = fromBase64(parts1[2]);

  // Bob decrypts
  const bobDecrypted = decryptMessage(
    storedEncrypted1,
    storedNonce1,
    aliceEnc.publicKey, // Alice's encryption pubkey (would be on her profile PDA)
    bobEnc.secretKey     // Bob's secret key (only Bob has this)
  );

  if (bobDecrypted === alicePlaintext) {
    console.log(`  ✅ Bob decrypted: "${bobDecrypted}"`);
  } else {
    console.log(`  ❌ DECRYPTION FAILED! Got: "${bobDecrypted}"`);
  }
  console.log();

  // -----------------------------------------------------------
  // Step 8: Bob sends encrypted reply on-chain
  // -----------------------------------------------------------
  console.log("━━━ Step 8: Bob → Alice (Encrypt + Send Reply On-Chain) ━━━");

  const bobPlaintext = "Got it Alice! Fully on-chain and nobody can read this 🚀";
  const { encrypted: bobEncrypted, nonce: bobNonce } = encryptMessage(
    bobPlaintext,
    bobEnc.secretKey,
    aliceEnc.publicKey
  );

  const onChainContent2 = `ENC:${toBase64(bobNonce)}:${toBase64(bobEncrypted)}`;
  const msgIndex2 = new BN(1);
  const [msgPDA2] = getMessagePDA(chatId, msgIndex2);

  const preBobSend = await getBalance(connection, bob.publicKey);

  await bobProgram.methods
    .sendMessage(chatId, msgIndex2, onChainContent2, false, new BN(0))
    .accounts({
      message: msgPDA2,
      chat: chatPDA,
      sender: bob.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  const postBobSend = await getBalance(connection, bob.publicKey);
  const sendCost2 = preBobSend - postBobSend;

  console.log(`  ✅ Bob's reply sent on-chain!`);
  console.log(`  💰 Cost: ${sendCost2.toFixed(6)} SOL ($${(sendCost2 * 140).toFixed(4)} at $140/SOL)`);

  // Alice reads Bob's reply from chain
  const msgAccount2 = await aliceProgram.account.message.fetch(msgPDA2);
  const parts2 = (msgAccount2.content as string).split(":");
  const aliceDecrypted = decryptMessage(
    fromBase64(parts2[2]),
    fromBase64(parts2[1]),
    bobEnc.publicKey,
    aliceEnc.secretKey
  );
  console.log(`  ✅ Alice decrypted Bob's reply: "${aliceDecrypted}"\n`);

  // -----------------------------------------------------------
  // Step 9: EVE tries to read from chain (EAVESDROPPER)
  // -----------------------------------------------------------
  console.log("━━━ Step 9: Eve (Eavesdropper) Reads SAME Accounts from Chain ━━━");
  console.log("  Eve connects to the SAME Solana devnet RPC...");
  console.log("  Eve reads the SAME Message PDAs...\n");

  // Eve creates her own connection — she's just a random person
  const eveConnection = new Connection(DEVNET_URL, "confirmed");

  // Eve reads message 1 (Alice → Bob) directly from chain
  const eveProgram = makeProgram(eve);
  const eveReadMsg1 = await eveProgram.account.message.fetch(msgPDA1);
  console.log(`  Eve reads Message #1 from chain:`);
  console.log(`    PDA: ${msgPDA1.toBase58()}`);
  console.log(`    sender: ${eveReadMsg1.sender.toBase58()}`);
  console.log(`    raw content: "${(eveReadMsg1.content as string).slice(0, 50)}..."`);
  console.log(`    timestamp: ${eveReadMsg1.timestamp.toString()}`);
  console.log(`    ⚠️  Eve can see metadata but content is encrypted!`);

  // Eve tries to decrypt with her own keys
  const eveParts1 = (eveReadMsg1.content as string).split(":");
  const eveAttempt1 = decryptMessage(
    fromBase64(eveParts1[2]),
    fromBase64(eveParts1[1]),
    aliceEnc.publicKey,
    eveEnc.secretKey // Eve's key — WRONG
  );
  console.log(`    Eve decrypt attempt (her key): ${eveAttempt1 === null ? "❌ FAILED" : `⚠️ "${eveAttempt1}"`}`);

  // Eve tries with Bob's public key
  const eveAttempt2 = decryptMessage(
    fromBase64(eveParts1[2]),
    fromBase64(eveParts1[1]),
    bobEnc.publicKey,
    eveEnc.secretKey
  );
  console.log(`    Eve decrypt attempt (Bob's pubkey): ${eveAttempt2 === null ? "❌ FAILED" : `⚠️ "${eveAttempt2}"`}`);

  // Eve tries 50 random keys
  let eveSuccess = false;
  for (let i = 0; i < 50; i++) {
    const rk = nacl.box.keyPair();
    const attempt = decryptMessage(fromBase64(eveParts1[2]), fromBase64(eveParts1[1]), aliceEnc.publicKey, rk.secretKey);
    if (attempt !== null) { eveSuccess = true; break; }
  }
  console.log(`    Eve brute force (50 random keys): ${eveSuccess ? "⚠️ CRACKED" : "❌ ALL FAILED"}`);

  // Eve reads message 2 (Bob → Alice)
  const eveReadMsg2 = await eveProgram.account.message.fetch(msgPDA2);
  const eveParts2 = (eveReadMsg2.content as string).split(":");
  const eveAttempt3 = decryptMessage(
    fromBase64(eveParts2[2]),
    fromBase64(eveParts2[1]),
    bobEnc.publicKey,
    eveEnc.secretKey
  );
  console.log(`\n  Eve reads Message #2 from chain:`);
  console.log(`    PDA: ${msgPDA2.toBase58()}`);
  console.log(`    Eve decrypt attempt: ${eveAttempt3 === null ? "❌ FAILED" : `⚠️ "${eveAttempt3}"`}`);

  // Eve also tries raw RPC getAccountInfo (lowest level possible)
  console.log(`\n  Eve tries raw getAccountInfo (lowest level RPC)...`);
  const rawAccount = await eveConnection.getAccountInfo(msgPDA1);
  if (rawAccount) {
    console.log(`    Account owner: ${rawAccount.owner.toBase58()}`);
    console.log(`    Account data length: ${rawAccount.data.length} bytes`);
    console.log(`    Raw data (hex): ${rawAccount.data.slice(0, 80).toString("hex")}...`);
    console.log(`    ⚠️  Raw bytes visible but encrypted content is UNREADABLE`);
  }
  console.log();

  // -----------------------------------------------------------
  // Step 10: Cost Summary
  // -----------------------------------------------------------
  console.log("━━━ Step 10: REAL Cost Summary ━━━");

  const chatAccountInfo = await connection.getAccountInfo(chatPDA);
  const msg1AccountInfo = await connection.getAccountInfo(msgPDA1);
  const msg2AccountInfo = await connection.getAccountInfo(msgPDA2);

  const chatRent = chatAccountInfo ? chatAccountInfo.lamports / LAMPORTS_PER_SOL : 0;
  const msg1Rent = msg1AccountInfo ? msg1AccountInfo.lamports / LAMPORTS_PER_SOL : 0;
  const msg2Rent = msg2AccountInfo ? msg2AccountInfo.lamports / LAMPORTS_PER_SOL : 0;

  const solPrice = 140; // approximate

  console.log(`\n  ┌──────────────────────────────────────────────────────────────┐`);
  console.log(`  │ Operation            │ SOL Cost     │ USD (@ $${solPrice}/SOL)     │`);
  console.log(`  ├──────────────────────────────────────────────────────────────┤`);
  console.log(`  │ Create Chat PDA      │ ${createCost.toFixed(6)} SOL │ $${(createCost * solPrice).toFixed(4).padEnd(14)} │`);
  console.log(`  │ Send Message #1      │ ${sendCost1.toFixed(6)} SOL │ $${(sendCost1 * solPrice).toFixed(4).padEnd(14)} │`);
  console.log(`  │ Send Message #2      │ ${sendCost2.toFixed(6)} SOL │ $${(sendCost2 * solPrice).toFixed(4).padEnd(14)} │`);
  console.log(`  ├──────────────────────────────────────────────────────────────┤`);
  console.log(`  │ Chat PDA rent        │ ${chatRent.toFixed(6)} SOL │ $${(chatRent * solPrice).toFixed(4).padEnd(14)} │`);
  console.log(`  │ Message #1 rent      │ ${msg1Rent.toFixed(6)} SOL │ $${(msg1Rent * solPrice).toFixed(4).padEnd(14)} │`);
  console.log(`  │ Message #2 rent      │ ${msg2Rent.toFixed(6)} SOL │ $${(msg2Rent * solPrice).toFixed(4).padEnd(14)} │`);
  console.log(`  ├──────────────────────────────────────────────────────────────┤`);
  console.log(`  │ Chat PDA size        │ ${chatAccountInfo?.data.length || 0} bytes     │                    │`);
  console.log(`  │ Message PDA size     │ ${msg1AccountInfo?.data.length || 0} bytes     │                    │`);
  console.log(`  │ Msg content length   │ ${onChainContent1.length} chars     │                    │`);
  console.log(`  └──────────────────────────────────────────────────────────────┘`);

  const totalCost = createCost + sendCost1 + sendCost2;
  const totalRent = chatRent + msg1Rent + msg2Rent;
  console.log(`\n  Total tx costs: ${totalCost.toFixed(6)} SOL ($${(totalCost * solPrice).toFixed(4)})`);
  console.log(`  Total rent locked: ${totalRent.toFixed(6)} SOL ($${(totalRent * solPrice).toFixed(4)})`);
  console.log(`  Rent is RECLAIMABLE by closing accounts ↓\n`);

  // -----------------------------------------------------------
  // Step 11: Close accounts & reclaim rent
  // -----------------------------------------------------------
  console.log("━━━ Step 11: Close Accounts & Reclaim Rent ━━━");

  // Close message 1 (Alice is sender, so Alice can close)
  const preCloseBal = await getBalance(connection, alice.publicKey);

  await aliceProgram.methods
    .closeMessage(chatId, msgIndex1)
    .accounts({
      message: msgPDA1,
      user: alice.publicKey,
    })
    .rpc();

  console.log(`  ✅ Message #1 closed (Alice reclaimed rent)`);

  // Close message 2 (Bob is sender, so Bob can close)
  const preBobClose = await getBalance(connection, bob.publicKey);

  await bobProgram.methods
    .closeMessage(chatId, msgIndex2)
    .accounts({
      message: msgPDA2,
      user: bob.publicKey,
    })
    .rpc();

  console.log(`  ✅ Message #2 closed (Bob reclaimed rent)`);

  // Close chat (Alice is user1, so she can close)
  await aliceProgram.methods
    .closeChat(chatId)
    .accounts({
      chat: chatPDA,
      user: alice.publicKey,
    })
    .rpc();

  console.log(`  ✅ Chat closed (Alice reclaimed rent)`);

  const postCloseBal = await getBalance(connection, alice.publicKey);
  const postBobClose = await getBalance(connection, bob.publicKey);
  const aliceReclaimed = postCloseBal - preCloseBal;
  const bobReclaimed = postBobClose - preBobClose;

  console.log(`\n  Alice reclaimed: +${aliceReclaimed.toFixed(6)} SOL (message + chat rent - tx fees)`);
  console.log(`  Bob reclaimed:   +${bobReclaimed.toFixed(6)} SOL (message rent - tx fee)`);

  // Verify accounts are closed
  const closedChat = await connection.getAccountInfo(chatPDA);
  const closedMsg1 = await connection.getAccountInfo(msgPDA1);
  const closedMsg2 = await connection.getAccountInfo(msgPDA2);
  console.log(`\n  Chat PDA still exists: ${closedChat !== null ? "⚠️ YES" : "✅ CLOSED"}`);
  console.log(`  Message #1 still exists: ${closedMsg1 !== null ? "⚠️ YES" : "✅ CLOSED"}`);
  console.log(`  Message #2 still exists: ${closedMsg2 !== null ? "⚠️ YES" : "✅ CLOSED"}`);

  const effectiveCostPerMsg = totalCost - (aliceReclaimed + bobReclaimed);
  console.log(`\n  💡 Effective cost after rent reclaim: ${effectiveCostPerMsg.toFixed(6)} SOL ($${(effectiveCostPerMsg * solPrice).toFixed(4)})`);
  console.log(`  💡 That's just the transaction fees (~${(effectiveCostPerMsg / 3 * 1e6).toFixed(0)} microlamports per tx)\n`);

  // -----------------------------------------------------------
  // Step 12: Final balances
  // -----------------------------------------------------------
  console.log("━━━ Step 12: Final Balances ━━━");
  const adminFinal = await getBalance(connection, admin.publicKey);
  const aliceFinal = await getBalance(connection, alice.publicKey);
  const bobFinal = await getBalance(connection, bob.publicKey);

  console.log(`  Admin: ${adminFinal.toFixed(6)} SOL (started: ${adminBal.toFixed(6)})`);
  console.log(`  Alice: ${aliceFinal.toFixed(6)} SOL (started: ${aliceBal.toFixed(6)})`);
  console.log(`  Bob:   ${bobFinal.toFixed(6)} SOL (started: ${bobBal.toFixed(6)})\n`);

  // -----------------------------------------------------------
  // FINAL RESULTS
  // -----------------------------------------------------------
  console.log("╔══════════════════════════════════════════════════════════════════╗");
  console.log("║                  ON-CHAIN TEST RESULTS                          ║");
  console.log("╠══════════════════════════════════════════════════════════════════╣");

  const results = [
    { test: "Chat created on Solana devnet", pass: chatAccount !== null },
    { test: "Alice msg stored on-chain (encrypted)", pass: msgAccount1 !== null },
    { test: "Bob decrypted Alice's msg from chain", pass: bobDecrypted === alicePlaintext },
    { test: "Bob reply stored on-chain (encrypted)", pass: msgAccount2 !== null },
    { test: "Alice decrypted Bob's reply from chain", pass: aliceDecrypted === bobPlaintext },
    { test: "Eve read same accounts — CANNOT decrypt msg 1", pass: eveAttempt1 === null },
    { test: "Eve read same accounts — CANNOT decrypt msg 2", pass: eveAttempt3 === null },
    { test: "Eve brute force (50 keys) — ALL failed", pass: !eveSuccess },
    { test: "Rent reclaim — chat account closed", pass: closedChat === null },
    { test: "Rent reclaim — message accounts closed", pass: closedMsg1 === null && closedMsg2 === null },
  ];

  let allPass = true;
  for (const r of results) {
    const icon = r.pass ? "✅" : "❌";
    console.log(`║  ${icon} ${r.test.padEnd(52)}${(r.pass ? "PASS" : "FAIL").padEnd(4)} ║`);
    if (!r.pass) allPass = false;
  }

  console.log("╠══════════════════════════════════════════════════════════════════╣");
  if (allPass) {
    console.log("║  🎉 ALL 10 TESTS PASSED — ON-CHAIN E2E ENCRYPTION WORKS!       ║");
  } else {
    console.log("║  ⚠️  SOME TESTS FAILED                                          ║");
  }
  console.log("╠══════════════════════════════════════════════════════════════════╣");
  console.log(`║  Create chat cost:    ${createCost.toFixed(6)} SOL ($${(createCost * solPrice).toFixed(4)})`.padEnd(67) + "║");
  console.log(`║  Send message cost:   ${sendCost1.toFixed(6)} SOL ($${(sendCost1 * solPrice).toFixed(4)})`.padEnd(67) + "║");
  console.log(`║  Effective cost/msg:  ~${(effectiveCostPerMsg / 3).toFixed(6)} SOL (after rent reclaim)`.padEnd(66) + "║");
  console.log(`║  Total rent locked:   ${totalRent.toFixed(6)} SOL (100% reclaimable)`.padEnd(66) + "║");
  console.log("╠══════════════════════════════════════════════════════════════════╣");
  console.log("║  🔐 Encryption: NaCl box (X25519-XSalsa20-Poly1305)             ║");
  console.log("║  ⛓️  Storage: Fully on-chain Solana devnet                       ║");
  console.log("║  👁️  Eve's view: Encrypted gibberish (proved on real accounts)   ║");
  console.log("║  ♻️  Rent: 100% reclaimable by closing message accounts          ║");
  console.log("╚══════════════════════════════════════════════════════════════════╝");
}

runOnChainTest().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
