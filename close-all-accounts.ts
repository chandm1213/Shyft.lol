/**
 * CLOSE ALL ACCOUNTS — Reclaim all rent from the Shyft program on devnet
 * 
 * This script:
 * 1. Scans all program accounts
 * 2. Categorizes them by type using discriminators
 * 3. Closes each account via the appropriate close instruction
 * 4. Reports total rent reclaimed
 * 
 * IMPORTANT: Only the account owner/author can close their own accounts.
 * Accounts not owned by the signing wallet will be skipped.
 */

import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL, Transaction, sendAndConfirmTransaction, SystemProgram } from "@solana/web3.js";
import { Program, AnchorProvider, Wallet, BN } from "@coral-xyz/anchor";
import * as fs from "fs";
import idl from "./src/lib/idl.json";

const PROGRAM_ID = new PublicKey("EEnouVLAoQGMEbrypEhP3Ct5RgCViCWG4n1nCZNwMxjQ");
const RPC = "https://devnet.helius-rpc.com/?api-key=2cf03460-f790-4350-a211-18086a3a3fd2";

const PROFILE_SEED = Buffer.from("profile");
const POST_SEED = Buffer.from("post");
const COMMENT_SEED = Buffer.from("comment");
const REACTION_SEED = Buffer.from("reaction");
const FOLLOW_SEED = Buffer.from("follow");
const CHAT_SEED = Buffer.from("chat");
const MESSAGE_SEED = Buffer.from("message");

// Discriminators from the IDL
const DISC = {
  Profile: Buffer.from([184, 101, 165, 188, 95, 63, 127, 188]),
  Post: Buffer.from([8, 147, 90, 186, 185, 56, 192, 150]),
  Comment: Buffer.from([150, 135, 96, 244, 55, 199, 50, 65]),
  Reaction: Buffer.from([226, 61, 100, 191, 223, 221, 142, 139]),
  FollowAccount: Buffer.from([174, 177, 136, 60, 138, 84, 148, 209]),
  Chat: Buffer.from([170, 4, 71, 128, 185, 103, 250, 177]),
  Message: Buffer.from([110, 151, 23, 110, 198, 6, 125, 181]),
  Conversation: Buffer.from([171, 46, 180, 58, 245, 221, 103, 174]),
  SessionToken: Buffer.from([233, 4, 115, 14, 46, 21, 1, 15]),
};

function getAccountType(data: Buffer): string {
  const disc = data.slice(0, 8);
  for (const [name, expected] of Object.entries(DISC)) {
    if (disc.equals(expected)) return name;
  }
  return "Unknown";
}

interface AccountInfo {
  pubkey: PublicKey;
  type: string;
  lamports: number;
  data: Buffer;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function main() {
  const connection = new Connection(RPC, "confirmed");

  // Load the deployer wallet
  const walletKeyData = JSON.parse(fs.readFileSync(
    require("os").homedir() + "/.config/solana/mainnet.json", "utf-8"
  ));
  const deployer = Keypair.fromSecretKey(Uint8Array.from(walletKeyData));
  console.log(`\n🔑 Signer: ${deployer.publicKey.toBase58()}`);

  const provider = new AnchorProvider(
    connection,
    new Wallet(deployer),
    { commitment: "confirmed" }
  );
  const program = new Program(idl as any, provider);

  // Check balance before
  const balanceBefore = await connection.getBalance(deployer.publicKey);
  console.log(`💰 Balance BEFORE: ${(balanceBefore / LAMPORTS_PER_SOL).toFixed(6)} SOL\n`);

  console.log("═".repeat(70));
  console.log("  SHYFT.LOL — CLOSE ALL ACCOUNTS & RECLAIM RENT");
  console.log("═".repeat(70));

  // Fetch all program accounts
  console.log("\n📡 Fetching all program accounts...");
  const allAccounts = await connection.getProgramAccounts(PROGRAM_ID);
  console.log(`   Found ${allAccounts.length} accounts\n`);

  // Categorize accounts
  const categorized: Record<string, AccountInfo[]> = {};
  let totalRentLocked = 0;

  for (const acct of allAccounts) {
    const data = Buffer.from(acct.account.data);
    const type = getAccountType(data);
    if (!categorized[type]) categorized[type] = [];
    categorized[type].push({
      pubkey: acct.pubkey,
      type,
      lamports: acct.account.lamports,
      data,
    });
    totalRentLocked += acct.account.lamports;
  }

  console.log("  Account summary:");
  for (const [type, accts] of Object.entries(categorized)) {
    const rent = accts.reduce((s, a) => s + a.lamports, 0);
    console.log(`    ${type.padEnd(20)} ${String(accts.length).padStart(5)} accounts   ${(rent / LAMPORTS_PER_SOL).toFixed(6)} SOL`);
  }
  console.log(`    ${"TOTAL".padEnd(20)} ${String(allAccounts.length).padStart(5)} accounts   ${(totalRentLocked / LAMPORTS_PER_SOL).toFixed(6)} SOL`);

  // =============================================
  // CLOSE ORDER:
  // 1. Reactions (depend on posts)
  // 2. Comments (depend on posts)
  // 3. Posts (depend on profiles)
  // 4. Follows (independent)
  // 5. Messages (depend on chats)
  // 6. Chats
  // 7. Conversations
  // 8. SessionTokens (skip — not ours to close)
  // 9. Profiles (last, since other instructions may need them)
  // =============================================

  let closed = 0;
  let skipped = 0;
  let failed = 0;
  let rentReclaimed = 0;

  // Helper to close with retry
  async function closeWithRetry(label: string, fn: () => Promise<string>): Promise<boolean> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const sig = await fn();
        console.log(`   ✅ ${label} — ${sig.slice(0, 20)}...`);
        return true;
      } catch (e: any) {
        const msg = e.message || String(e);
        if (msg.includes("Unauthorized") || msg.includes("ConstraintRaw") || msg.includes("ConstraintSeeds") || msg.includes("AccountNotFound") || msg.includes("AccountNotInitialized")) {
          console.log(`   ⏭️  ${label} — SKIPPED (not authorized or already closed)`);
          return false;
        }
        if (attempt < 2) {
          await sleep(2000);
          continue;
        }
        console.log(`   ❌ ${label} — FAILED: ${msg.slice(0, 100)}`);
        return false;
      }
    }
    return false;
  }

  // ===== 1. CLOSE REACTIONS =====
  if (categorized.Reaction?.length) {
    console.log(`\n🗑️  Closing ${categorized.Reaction.length} Reactions...`);
    for (const acct of categorized.Reaction) {
      // Reaction struct: disc(8) + post(32) + user(32) + reaction_type(1)
      const postPubkey = new PublicKey(acct.data.slice(8, 40));
      const userPubkey = new PublicKey(acct.data.slice(40, 72));

      // We need to find the post_id from the Post account
      // The post PDA needs post.author and post_id, both stored in the post
      try {
        const postData = await connection.getAccountInfo(postPubkey);
        if (!postData) {
          console.log(`   ⏭️  Reaction ${acct.pubkey.toBase58().slice(0, 12)}... — post account gone`);
          skipped++;
          continue;
        }
        // Post struct: disc(8) + author(32) + post_id(8)
        const postAuthor = new PublicKey(postData.data.slice(8, 40));
        const postId = Number(postData.data.readBigUInt64LE(40));

        // Only close if we are the reactor
        if (!userPubkey.equals(deployer.publicKey)) {
          console.log(`   ⏭️  Reaction ${acct.pubkey.toBase58().slice(0, 12)}... — not our reaction (owner: ${userPubkey.toBase58().slice(0, 12)}...)`);
          skipped++;
          continue;
        }

        const ok = await closeWithRetry(`Reaction on post ${postId}`, async () => {
          const sig = await program.methods
            .closeReaction(new BN(postId))
            .accounts({
              user: deployer.publicKey,
            })
            .signers([deployer])
            .rpc();
          return sig;
        });
        if (ok) { closed++; rentReclaimed += acct.lamports; }
        else { skipped++; }
        await sleep(500);
      } catch (e: any) {
        console.log(`   ❌ Reaction ${acct.pubkey.toBase58().slice(0, 12)}... — ${(e.message || String(e)).slice(0, 80)}`);
        failed++;
      }
    }
  }

  // ===== 2. CLOSE COMMENTS =====
  if (categorized.Comment?.length) {
    console.log(`\n🗑️  Closing ${categorized.Comment.length} Comments...`);
    for (const acct of categorized.Comment) {
      // Comment struct: disc(8) + post(32) + author(32) + comment_index(8) + content(4+n) + created_at(8)
      const postPubkey = new PublicKey(acct.data.slice(8, 40));
      const commentAuthor = new PublicKey(acct.data.slice(40, 72));
      const commentIndex = Number(acct.data.readBigUInt64LE(72));

      if (!commentAuthor.equals(deployer.publicKey)) {
        console.log(`   ⏭️  Comment ${acct.pubkey.toBase58().slice(0, 12)}... — not our comment`);
        skipped++;
        continue;
      }

      try {
        const postData = await connection.getAccountInfo(postPubkey);
        if (!postData) {
          console.log(`   ⏭️  Comment ${acct.pubkey.toBase58().slice(0, 12)}... — post account gone`);
          skipped++;
          continue;
        }
        const postId = Number(postData.data.readBigUInt64LE(40));

        const ok = await closeWithRetry(`Comment #${commentIndex} on post ${postId}`, async () => {
          const sig = await program.methods
            .closeComment(new BN(postId), new BN(commentIndex))
            .accounts({
              user: deployer.publicKey,
            })
            .signers([deployer])
            .rpc();
          return sig;
        });
        if (ok) { closed++; rentReclaimed += acct.lamports; }
        else { skipped++; }
        await sleep(500);
      } catch (e: any) {
        console.log(`   ❌ Comment ${acct.pubkey.toBase58().slice(0, 12)}... — ${(e.message || String(e)).slice(0, 80)}`);
        failed++;
      }
    }
  }

  // ===== 3. CLOSE POSTS =====
  if (categorized.Post?.length) {
    console.log(`\n🗑️  Closing ${categorized.Post.length} Posts...`);
    for (const acct of categorized.Post) {
      // Post struct: disc(8) + author(32) + post_id(8)
      const postAuthor = new PublicKey(acct.data.slice(8, 40));
      const postId = Number(acct.data.readBigUInt64LE(40));

      if (!postAuthor.equals(deployer.publicKey)) {
        console.log(`   ⏭️  Post ${postId} (${acct.pubkey.toBase58().slice(0, 12)}...) — not our post (author: ${postAuthor.toBase58().slice(0, 12)}...)`);
        skipped++;
        continue;
      }

      const ok = await closeWithRetry(`Post #${postId}`, async () => {
        const sig = await program.methods
          .closePost(new BN(postId))
          .accounts({
            user: deployer.publicKey,
          })
          .signers([deployer])
          .rpc();
        return sig;
      });
      if (ok) { closed++; rentReclaimed += acct.lamports; }
      else { skipped++; }
      await sleep(500);
    }
  }

  // ===== 4. CLOSE FOLLOWS =====
  if (categorized.FollowAccount?.length) {
    console.log(`\n🗑️  Closing ${categorized.FollowAccount.length} Follow accounts...`);
    for (const acct of categorized.FollowAccount) {
      // Follow struct: disc(8) + follower(32) + following(32)
      const follower = new PublicKey(acct.data.slice(8, 40));
      const following = new PublicKey(acct.data.slice(40, 72));

      if (!follower.equals(deployer.publicKey)) {
        console.log(`   ⏭️  Follow ${acct.pubkey.toBase58().slice(0, 12)}... — not our follow (follower: ${follower.toBase58().slice(0, 12)}...)`);
        skipped++;
        continue;
      }

      // Use unfollowUser which already exists and has close = user
      const ok = await closeWithRetry(`Unfollow ${following.toBase58().slice(0, 12)}...`, async () => {
        const sig = await program.methods
          .unfollowUser()
          .accounts({
            user: deployer.publicKey,
            following: following,
          })
          .signers([deployer])
          .rpc();
        return sig;
      });
      if (ok) { closed++; rentReclaimed += acct.lamports; }
      else { skipped++; }
      await sleep(500);
    }
  }

  // ===== 5. CLOSE MESSAGES =====
  if (categorized.Message?.length) {
    console.log(`\n🗑️  Closing ${categorized.Message.length} Messages...`);
    for (const acct of categorized.Message) {
      // Message struct: disc(8) + chat(32) + sender(32) + message_index(8) + content(4+n) + created_at(8)
      const chatPubkey = new PublicKey(acct.data.slice(8, 40));
      const sender = new PublicKey(acct.data.slice(40, 72));
      const messageIndex = Number(acct.data.readBigUInt64LE(72));

      if (!sender.equals(deployer.publicKey)) {
        console.log(`   ⏭️  Message ${acct.pubkey.toBase58().slice(0, 12)}... — not our message (sender: ${sender.toBase58().slice(0, 12)}...)`);
        skipped++;
        continue;
      }

      // Need to get chat_id from the chat account
      try {
        const chatData = await connection.getAccountInfo(chatPubkey);
        if (!chatData) {
          // If the chat is already closed, we can try deriving chat_id from the message PDA
          // But it's easier to just look at the chat account before it's gone
          console.log(`   ⏭️  Message ${acct.pubkey.toBase58().slice(0, 12)}... — chat account gone`);
          skipped++;
          continue;
        }
        // We need the chat_id. Chat doesn't store chat_id directly.
        // Chat struct: disc(8) + user1(32) + user2(32) + message_count(8) + created_at(8) + last_message_at(8)
        // chat_id is derived from the PDA seeds. We need to figure it out.
        // Let's try brute-forcing chat_id by checking PDA derivation
        let chatId = -1;
        for (let i = 0; i < 100; i++) {
          const buf = Buffer.alloc(8);
          buf.writeBigUInt64LE(BigInt(i));
          const [pda] = PublicKey.findProgramAddressSync([CHAT_SEED, buf], PROGRAM_ID);
          if (pda.equals(chatPubkey)) {
            chatId = i;
            break;
          }
        }
        if (chatId === -1) {
          console.log(`   ⏭️  Message ${acct.pubkey.toBase58().slice(0, 12)}... — couldn't determine chat_id`);
          skipped++;
          continue;
        }

        const ok = await closeWithRetry(`Message #${messageIndex} in chat ${chatId}`, async () => {
          const sig = await program.methods
            .closeMessage(new BN(chatId), new BN(messageIndex))
            .accounts({
              user: deployer.publicKey,
            })
            .signers([deployer])
            .rpc();
          return sig;
        });
        if (ok) { closed++; rentReclaimed += acct.lamports; }
        else { skipped++; }
        await sleep(500);
      } catch (e: any) {
        console.log(`   ❌ Message ${acct.pubkey.toBase58().slice(0, 12)}... — ${(e.message || String(e)).slice(0, 80)}`);
        failed++;
      }
    }
  }

  // ===== 6. CLOSE CHATS =====
  if (categorized.Chat?.length) {
    console.log(`\n🗑️  Closing ${categorized.Chat.length} Chats...`);
    for (const acct of categorized.Chat) {
      // Chat struct: disc(8) + user1(32) + user2(32) + message_count(8) + created_at(8) + last_message_at(8)
      const user1 = new PublicKey(acct.data.slice(8, 40));

      if (!user1.equals(deployer.publicKey)) {
        console.log(`   ⏭️  Chat ${acct.pubkey.toBase58().slice(0, 12)}... — not our chat (user1: ${user1.toBase58().slice(0, 12)}...)`);
        skipped++;
        continue;
      }

      // Find chat_id by brute force PDA derivation
      let chatId = -1;
      for (let i = 0; i < 100; i++) {
        const buf = Buffer.alloc(8);
        buf.writeBigUInt64LE(BigInt(i));
        const [pda] = PublicKey.findProgramAddressSync([CHAT_SEED, buf], PROGRAM_ID);
        if (pda.equals(acct.pubkey)) {
          chatId = i;
          break;
        }
      }
      if (chatId === -1) {
        console.log(`   ⏭️  Chat ${acct.pubkey.toBase58().slice(0, 12)}... — couldn't determine chat_id`);
        skipped++;
        continue;
      }

      const ok = await closeWithRetry(`Chat #${chatId}`, async () => {
        const sig = await program.methods
          .closeChat(new BN(chatId))
          .accounts({
            user: deployer.publicKey,
          })
          .signers([deployer])
          .rpc();
        return sig;
      });
      if (ok) { closed++; rentReclaimed += acct.lamports; }
      else { skipped++; }
      await sleep(500);
    }
  }

  // ===== 7. CLOSE CONVERSATIONS =====
  if (categorized.Conversation?.length) {
    console.log(`\n⏭️  Skipping ${categorized.Conversation.length} Conversations (delegated to MagicBlock, need special handling)`);
    skipped += categorized.Conversation.length;
  }

  // ===== 8. SESSION TOKENS =====
  if (categorized.SessionToken?.length) {
    console.log(`\n⏭️  Skipping ${categorized.SessionToken.length} SessionTokens (owned by session key program)`);
    skipped += categorized.SessionToken.length;
  }

  // ===== 9. CLOSE PROFILES (last) =====
  if (categorized.Profile?.length) {
    console.log(`\n🗑️  Closing ${categorized.Profile.length} Profiles...`);
    for (const acct of categorized.Profile) {
      // Profile struct: disc(8) + owner(32)
      const owner = new PublicKey(acct.data.slice(8, 40));

      if (!owner.equals(deployer.publicKey)) {
        console.log(`   ⏭️  Profile ${acct.pubkey.toBase58().slice(0, 12)}... — not our profile (owner: ${owner.toBase58().slice(0, 12)}...)`);
        skipped++;
        continue;
      }

      const ok = await closeWithRetry(`Profile (${owner.toBase58().slice(0, 12)}...)`, async () => {
        const sig = await program.methods
          .closeProfile()
          .accounts({
            user: deployer.publicKey,
          })
          .signers([deployer])
          .rpc();
        return sig;
      });
      if (ok) { closed++; rentReclaimed += acct.lamports; }
      else { skipped++; }
      await sleep(500);
    }
  }

  // ===== UNKNOWN =====
  if (categorized.Unknown?.length) {
    console.log(`\n⚠️  ${categorized.Unknown.length} Unknown account types (cannot close)`);
    skipped += categorized.Unknown.length;
  }

  // Final report
  const balanceAfter = await connection.getBalance(deployer.publicKey);
  const actualReclaimed = balanceAfter - balanceBefore;

  console.log("\n" + "═".repeat(70));
  console.log("  RESULTS");
  console.log("═".repeat(70));
  console.log(`  ✅ Closed:   ${closed} accounts`);
  console.log(`  ⏭️  Skipped:  ${skipped} accounts`);
  console.log(`  ❌ Failed:   ${failed} accounts`);
  console.log(`  💰 Rent from closed accounts:  ${(rentReclaimed / LAMPORTS_PER_SOL).toFixed(6)} SOL`);
  console.log(`  💰 Actual balance change:      ${(actualReclaimed / LAMPORTS_PER_SOL).toFixed(6)} SOL`);
  console.log(`  💰 Tx fees paid:               ${((rentReclaimed - actualReclaimed) / LAMPORTS_PER_SOL).toFixed(6)} SOL`);
  console.log(`\n  Balance BEFORE: ${(balanceBefore / LAMPORTS_PER_SOL).toFixed(6)} SOL`);
  console.log(`  Balance AFTER:  ${(balanceAfter / LAMPORTS_PER_SOL).toFixed(6)} SOL`);

  // Check remaining accounts
  const remaining = await connection.getProgramAccounts(PROGRAM_ID, { dataSlice: { offset: 0, length: 0 } });
  console.log(`\n  📊 Remaining program accounts: ${remaining.length}`);

  if (remaining.length > 0) {
    console.log("  (These belong to other wallets or are special account types)");
  }

  console.log("\n✅ Done\n");
}

main().catch(console.error);
