/**
 * =====================================================
 *  ALICE'S SCRIPT — Runs as a SEPARATE process
 * =====================================================
 *
 * Alice:
 *   1. Generates her own Solana keypair + encryption keypair
 *   2. Creates a chat on-chain with Bob
 *   3. Sends an encrypted message (only Bob can read)
 *   4. Stores her encryption PUBLIC KEY on-chain in message #0 (key exchange)
 *   5. Saves chat info to a file so Bob's script can find it
 *
 * Alice NEVER has access to Bob's private keys.
 * Alice NEVER has access to Eve's private keys.
 */

import { Program, AnchorProvider, BN, Wallet } from "@coral-xyz/anchor";
import {
  Connection, Keypair, SystemProgram, LAMPORTS_PER_SOL,
  Transaction, sendAndConfirmTransaction,
} from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";
import {
  PROGRAM_ID, DEVNET_URL, toBase64,
  deriveEncryptionKeypair, encryptMessage,
  getChatPDA, getMessagePDA,
} from "./shared";

const idl = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "target/idl/shadowspace.json"), "utf-8")
);

async function main() {
  console.log("\n🅰️  ═══ ALICE'S PROCESS (pid: " + process.pid + ") ═══\n");

  const connection = new Connection(DEVNET_URL, "confirmed");

  // Load admin to fund Alice
  const adminSecret = JSON.parse(
    fs.readFileSync(path.join(process.env.HOME || "~", ".config/solana/mainnet.json"), "utf-8")
  );
  const admin = Keypair.fromSecretKey(new Uint8Array(adminSecret));

  // ─── Step 1: Alice generates her OWN keypair ───
  const alice = Keypair.generate();
  const aliceEnc = deriveEncryptionKeypair(alice);
  console.log("  Alice wallet:      ", alice.publicKey.toBase58());
  console.log("  Alice enc pubkey:  ", toBase64(aliceEnc.publicKey));
  console.log("  Alice enc SECRET:   [exists only in THIS process memory — never sent anywhere]\n");

  // ─── Step 2: Read Bob's wallet address from setup file ───
  // In the real app, Alice would search for Bob by username.
  // For this test, we need Bob to exist first. We'll create Bob's
  // wallet in setup and share ONLY his public wallet address.
  const setupPath = path.join(__dirname, "setup.json");
  if (!fs.existsSync(setupPath)) {
    console.log("  ⚠️  No setup.json found. Creating Bob's wallet for this test...");
    const bob = Keypair.generate();
    // We save Bob's SECRET KEY to a file that ONLY Bob's script reads.
    // This simulates Bob being on a different device with his own wallet.
    fs.writeFileSync(
      path.join(__dirname, "bob-wallet-SECRET.json"),
      JSON.stringify(Array.from(bob.secretKey))
    );
    // Setup file has ONLY public info
    fs.writeFileSync(setupPath, JSON.stringify({
      bobWalletAddress: bob.publicKey.toBase58(),
    }));
    console.log("  Bob wallet (public): ", bob.publicKey.toBase58());
    console.log("  Bob's secret key saved to bob-wallet-SECRET.json (only Bob reads this)\n");

    // Fund Bob too
    console.log("  Funding Bob with 0.05 SOL...");
    const fundBob = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: admin.publicKey,
        toPubkey: bob.publicKey,
        lamports: 0.05 * LAMPORTS_PER_SOL,
      })
    );
    fundBob.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    fundBob.feePayer = admin.publicKey;
    await sendAndConfirmTransaction(connection, fundBob, [admin]);
  }

  const setup = JSON.parse(fs.readFileSync(setupPath, "utf-8"));
  const bobWalletAddress = setup.bobWalletAddress;
  console.log("  Bob's wallet (public, from setup.json):", bobWalletAddress);

  // ─── Step 3: Fund Alice ───
  console.log("  Funding Alice with 0.1 SOL...");
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
  const bal = await connection.getBalance(alice.publicKey);
  console.log(`  Alice balance: ${bal / LAMPORTS_PER_SOL} SOL\n`);

  // ─── Step 4: Create chat on-chain ───
  const aliceProgram = new Program(
    idl as any,
    new AnchorProvider(connection, new Wallet(alice), { commitment: "confirmed" })
  );
  const chatId = new BN(Date.now());
  const [chatPDA] = getChatPDA(chatId);

  console.log("  Creating chat on-chain...");
  console.log("  Chat ID:", chatId.toString());

  const preBal = await connection.getBalance(alice.publicKey);

  await aliceProgram.methods
    .createChat(chatId)
    .accounts({
      chat: chatPDA,
      user1: alice.publicKey,
      user2: new (await import("@solana/web3.js")).PublicKey(bobWalletAddress),
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  const postBal = await connection.getBalance(alice.publicKey);
  console.log(`  ✅ Chat created! Cost: ${((preBal - postBal) / LAMPORTS_PER_SOL).toFixed(6)} SOL`);

  // ─── Step 5: Send key exchange message (message #0) ───
  // Alice publishes her encryption PUBLIC KEY on-chain so Bob can find it.
  // This is like putting your PGP public key on a keyserver.
  // NO secret keys are sent — only the PUBLIC encryption key.
  const keyExchangeContent = `PUBKEY:${toBase64(aliceEnc.publicKey)}`;
  const [keyMsgPDA] = getMessagePDA(chatId, new BN(0));

  console.log("\n  Sending key exchange (message #0)...");
  console.log(`  Content: "${keyExchangeContent}"`);
  console.log("  ⚠️  This is Alice's encryption PUBLIC KEY — NOT her secret key!");

  await aliceProgram.methods
    .sendMessage(chatId, new BN(0), keyExchangeContent, false, new BN(0))
    .accounts({
      message: keyMsgPDA,
      chat: chatPDA,
      sender: alice.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  console.log("  ✅ Key exchange sent on-chain!\n");

  // ─── Step 6: Now Alice needs Bob's encryption pubkey to encrypt ───
  // In the real app, Bob's pubkey would be on his Profile PDA.
  // For this test, Bob hasn't run yet, so Alice will:
  //   Option A: Wait for Bob to publish his pubkey (message #1)
  //   Option B: Derive Bob's pubkey if she knew his wallet secret (she DOESN'T)
  //
  // We'll do Option A: Alice saves the chat info and waits.
  // Bob's script will:
  //   1. Read Alice's pubkey from chain (message #0)
  //   2. Publish Bob's pubkey (message #1)
  //   3. Send encrypted message to Alice (message #2)
  // Then Alice's follow-up will:
  //   4. Read Bob's pubkey from chain (message #1)
  //   5. Send encrypted message to Bob (message #3)

  // Save chat info for Bob's script + Alice's follow-up
  const chatInfo = {
    chatId: chatId.toString(),
    chatPDA: chatPDA.toBase58(),
    aliceWallet: alice.publicKey.toBase58(),
    bobWallet: bobWalletAddress,
    aliceEncPubkey: toBase64(aliceEnc.publicKey),
  };
  fs.writeFileSync(path.join(__dirname, "chat-info.json"), JSON.stringify(chatInfo, null, 2));

  // Save Alice's secret key so her follow-up script can read Bob's reply
  fs.writeFileSync(
    path.join(__dirname, "alice-wallet-SECRET.json"),
    JSON.stringify(Array.from(alice.secretKey))
  );

  console.log("  📁 Saved chat-info.json (public info only)");
  console.log("  📁 Saved alice-wallet-SECRET.json (only Alice reads this)");
  console.log("\n  ⏳ Now run Bob's script: npx tsx test-p2p/bob-read.ts");
  console.log("  ⏳ Then run Eve's script: npx tsx test-p2p/eve-spy.ts");
  console.log("  ⏳ Then run Alice's follow-up: npx tsx test-p2p/alice-read.ts\n");
}

main().catch(console.error);
