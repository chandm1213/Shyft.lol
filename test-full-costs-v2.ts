/**
 * FULL COST TEST v2 — After aggressive optimization
 * Uses a FRESH keypair to test create profile with new smaller schema
 */

import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL, SystemProgram } from "@solana/web3.js";
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

function getProfilePda(owner: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([PROFILE_SEED, owner.toBuffer()], PROGRAM_ID);
}
function getPostPda(author: PublicKey, postId: number): [PublicKey, number] {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(postId));
  return PublicKey.findProgramAddressSync([POST_SEED, author.toBuffer(), buf], PROGRAM_ID);
}
function getCommentPda(postKey: PublicKey, commentIndex: number): [PublicKey, number] {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(commentIndex));
  return PublicKey.findProgramAddressSync([COMMENT_SEED, postKey.toBuffer(), buf], PROGRAM_ID);
}
function getReactionPda(postKey: PublicKey, user: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([REACTION_SEED, postKey.toBuffer(), user.toBuffer()], PROGRAM_ID);
}
function getFollowPda(follower: PublicKey, following: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([FOLLOW_SEED, follower.toBuffer(), following.toBuffer()], PROGRAM_ID);
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

interface CostEntry {
  action: string;
  cost: number;
  isRefund: boolean;
  accountSize?: number;
}

async function main() {
  const connection = new Connection(RPC, "confirmed");

  // Use the existing funded wallet to FUND a fresh test wallet
  const keypairPath = require("os").homedir() + "/.config/solana/mainnet.json";
  if (!fs.existsSync(keypairPath)) {
    console.log("❌ No keypair found at", keypairPath);
    return;
  }
  const funderSecret = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
  const funderKeypair = Keypair.fromSecretKey(Uint8Array.from(funderSecret));
  const funderWallet = new Wallet(funderKeypair);
  const funderProvider = new AnchorProvider(connection, funderWallet, { commitment: "confirmed" });

  // Create a fresh test keypair
  const testKeypair = Keypair.generate();
  const testWallet = new Wallet(testKeypair);
  const provider = new AnchorProvider(connection, testWallet, { commitment: "confirmed" });
  const program = new Program(idl as any, provider);
  const user = testKeypair.publicKey;

  console.log("═".repeat(70));
  console.log("  SHYFT.LOL — FULL COST TEST v2 (OPTIMIZED PROGRAM)");
  console.log("═".repeat(70));
  console.log(`\n🔑 Fresh test wallet: ${user.toBase58()}`);

  // Transfer SOL from funder to test wallet
  console.log("💰 Funding test wallet with 0.5 SOL from main wallet...");
  const { Transaction: Tx } = require("@solana/web3.js");
  const fundTx = new Tx().add(
    SystemProgram.transfer({
      fromPubkey: funderKeypair.publicKey,
      toPubkey: user,
      lamports: 0.5 * LAMPORTS_PER_SOL,
    })
  );
  fundTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  fundTx.feePayer = funderKeypair.publicKey;
  fundTx.sign(funderKeypair);
  const fundSig = await connection.sendRawTransaction(fundTx.serialize());
  await connection.confirmTransaction(fundSig, "confirmed");
  console.log("   ✅ Funded!");
  await sleep(2000);

  // Also need another user with a profile to follow — use the funder
  const funderProgram = new Program(idl as any, funderProvider);
  const [funderProfilePda] = getProfilePda(funderKeypair.publicKey);
  let targetOwner: PublicKey | null = null;
  try {
    const allProfiles = await (funderProgram.account as any).profile.all();
    for (const p of allProfiles) {
      if (!p.account.owner.equals(user)) {
        targetOwner = p.account.owner;
        console.log(`🎯 Follow target: ${targetOwner!.toBase58()} (@${p.account.username})`);
        break;
      }
    }
  } catch (e: any) {
    console.log("⚠️ Could not find profiles:", e?.message?.slice(0, 60));
  }

  const costs: CostEntry[] = [];

  async function trackCost(action: string, fn: () => Promise<string>, isRefund = false): Promise<void> {
    const before = await connection.getBalance(user);
    console.log(`\n${"─".repeat(60)}`);
    console.log(`  ${action}`);
    console.log(`${"─".repeat(60)}`);
    console.log(`  Balance before: ${(before / LAMPORTS_PER_SOL).toFixed(9)} SOL`);

    try {
      const sig = await fn();
      await sleep(3000);
      const after = await connection.getBalance(user);
      const cost = before - after;

      console.log(`  Balance after:  ${(after / LAMPORTS_PER_SOL).toFixed(9)} SOL`);
      if (isRefund) {
        console.log(`  💚 REFUNDED:    +${(Math.abs(cost) / LAMPORTS_PER_SOL).toFixed(9)} SOL (+${Math.abs(cost)} lamports)`);
      } else {
        console.log(`  💸 Cost:        ${(cost / LAMPORTS_PER_SOL).toFixed(9)} SOL (${cost} lamports)`);
      }
      console.log(`  TX: ${sig.slice(0, 30)}...`);
      costs.push({ action, cost, isRefund });
    } catch (err: any) {
      console.log(`  ❌ FAILED: ${err?.message?.slice(0, 120)}`);
      costs.push({ action: action + " (FAILED)", cost: 0, isRefund });
    }
  }

  const startBalance = await connection.getBalance(user);
  console.log(`\n🏦 Starting balance: ${(startBalance / LAMPORTS_PER_SOL).toFixed(9)} SOL`);

  // 1. CREATE PROFILE
  const [profilePda] = getProfilePda(user);
  await trackCost("1. CREATE PROFILE", async () => {
    return await program.methods
      .createProfile("costtest2", "Cost Tester", "Testing v2")
      .accounts({
        profile: profilePda,
        user: user,
        payer: user,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  });

  // 2. CREATE POST
  const postId = 999001;
  const [postPda] = getPostPda(user, postId);
  await trackCost("2. CREATE POST", async () => {
    return await program.methods
      .createPost(new BN(postId), "Testing on-chain cost after optimization! 🚀", false)
      .accountsPartial({
        post: postPda,
        profile: profilePda,
        author: user,
        payer: user,
        systemProgram: SystemProgram.programId,
        sessionToken: null as any,
      })
      .rpc();
  });

  // 3. LIKE POST (no new account)
  await trackCost("3. LIKE POST (no new account)", async () => {
    return await program.methods
      .likePost(new BN(postId))
      .accountsPartial({
        post: postPda,
        profile: profilePda,
        user: user,
        sessionToken: null as any,
      })
      .rpc();
  });

  // 4. CREATE COMMENT
  const commentIndex = 0;
  const [commentPda] = getCommentPda(postPda, commentIndex);
  await trackCost("4. CREATE COMMENT", async () => {
    return await program.methods
      .createComment(new BN(postId), new BN(commentIndex), "Nice post! 🔥")
      .accountsPartial({
        comment: commentPda,
        post: postPda,
        commenterProfile: profilePda,
        author: user,
        payer: user,
        systemProgram: SystemProgram.programId,
        sessionToken: null as any,
      })
      .rpc();
  });

  // 5. REACT TO POST
  const [reactionPda] = getReactionPda(postPda, user);
  await trackCost("5. REACT TO POST", async () => {
    return await program.methods
      .reactToPost(new BN(postId), 1)
      .accountsPartial({
        reaction: reactionPda,
        post: postPda,
        reactorProfile: profilePda,
        user: user,
        payer: user,
        systemProgram: SystemProgram.programId,
        sessionToken: null as any,
      })
      .rpc();
  });

  // 6. FOLLOW USER
  if (targetOwner) {
    const [followPda] = getFollowPda(user, targetOwner);
    const [followerProfilePda] = getProfilePda(user);
    const [followingProfilePda] = getProfilePda(targetOwner);

    await trackCost("6. FOLLOW USER", async () => {
      return await program.methods
        .followUser()
        .accounts({
          followAccount: followPda,
          followerProfile: followerProfilePda,
          followingProfile: followingProfilePda,
          user: user,
          payer: user,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    });

    // 7. UNFOLLOW (refund)
    await trackCost("7. UNFOLLOW USER (rent refund)", async () => {
      return await program.methods
        .unfollowUser()
        .accounts({
          followAccount: followPda,
          followerProfile: followerProfilePda,
          followingProfile: followingProfilePda,
          user: user,
        })
        .rpc();
    }, true);
  } else {
    console.log("\n⚠️  Skipping follow/unfollow (no target found)");
  }

  // ═══════════════════════════════════════════
  // FINAL SUMMARY
  // ═══════════════════════════════════════════
  const endBalance = await connection.getBalance(user);
  const totalSpent = startBalance - endBalance;

  console.log("\n\n" + "═".repeat(70));
  console.log("  COST SUMMARY — OPTIMIZED PROGRAM");
  console.log("═".repeat(70));
  console.log("");
  console.log("  Action                           Cost (SOL)        Lamports");
  console.log("  " + "─".repeat(66));

  let totalRent = 0;
  let totalFees = 0;
  let totalRefunded = 0;

  for (const entry of costs) {
    if (entry.cost === 0 && entry.action.includes("FAILED")) {
      console.log(`  ${entry.action.padEnd(35)} FAILED`);
      continue;
    }
    if (entry.isRefund) {
      const refund = Math.abs(entry.cost);
      totalRefunded += refund;
      console.log(`  ${entry.action.padEnd(35)} +${(refund / LAMPORTS_PER_SOL).toFixed(9).padStart(14)} SOL  +${String(refund).padStart(10)} 💚`);
    } else {
      const txFee = 5000;
      const rent = Math.max(0, entry.cost - txFee);
      totalFees += txFee;
      totalRent += rent;
      console.log(`  ${entry.action.padEnd(35)} -${(entry.cost / LAMPORTS_PER_SOL).toFixed(9).padStart(14)} SOL  -${String(entry.cost).padStart(10)}`);
    }
  }

  console.log("  " + "─".repeat(66));
  console.log(`  Total rent deposited:            -${(totalRent / LAMPORTS_PER_SOL).toFixed(9).padStart(14)} SOL`);
  console.log(`  Total tx fees (burned):          -${(totalFees / LAMPORTS_PER_SOL).toFixed(9).padStart(14)} SOL`);
  console.log(`  Total refunded:                  +${(totalRefunded / LAMPORTS_PER_SOL).toFixed(9).padStart(14)} SOL`);
  console.log(`  ${"─".repeat(50)}`);
  console.log(`  NET TOTAL SPENT:                 -${(totalSpent / LAMPORTS_PER_SOL).toFixed(9).padStart(14)} SOL`);

  const solPrice = 150;
  console.log(`\n  💵 At $${solPrice}/SOL:`);
  console.log(`     Total spent:      $${((totalSpent / LAMPORTS_PER_SOL) * solPrice).toFixed(4)}`);
  console.log(`     Permanent cost:   $${((totalFees / LAMPORTS_PER_SOL) * solPrice).toFixed(4)} (tx fees only)`);
  console.log(`     Refundable:       $${(((totalRent - totalRefunded) / LAMPORTS_PER_SOL) * solPrice).toFixed(4)}`);

  // Account sizes
  console.log("\n" + "═".repeat(70));
  console.log("  NEW ACCOUNT SIZES:");
  console.log("═".repeat(70));

  const profileInfo = await connection.getAccountInfo(profilePda);
  const postInfo = await connection.getAccountInfo(postPda);
  const commentInfo = await connection.getAccountInfo(commentPda);
  const reactionInfo = await connection.getAccountInfo(reactionPda);

  if (profileInfo) console.log(`  Profile:   ${profileInfo.data.length} bytes  (was 429)  → rent ${await connection.getMinimumBalanceForRentExemption(profileInfo.data.length)} lamports`);
  if (postInfo) console.log(`  Post:      ${postInfo.data.length} bytes  (was 577)  → rent ${await connection.getMinimumBalanceForRentExemption(postInfo.data.length)} lamports`);
  if (commentInfo) console.log(`  Comment:   ${commentInfo.data.length} bytes  (was 232)  → rent ${await connection.getMinimumBalanceForRentExemption(commentInfo.data.length)} lamports`);
  if (reactionInfo) console.log(`  Reaction:  ${reactionInfo.data.length} bytes  (was 81)   → rent ${await connection.getMinimumBalanceForRentExemption(reactionInfo.data.length)} lamports`);
  
  const followSize = 8 + 64; // discriminator + FollowAccount::LEN (32+32)
  console.log(`  Follow:    ${followSize} bytes  (was 80)   → rent ${await connection.getMinimumBalanceForRentExemption(followSize)} lamports`);

  console.log("\n✅ Test complete!\n");
}

main().catch(console.error);
