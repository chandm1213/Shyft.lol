/**
 * FULL COST TEST — Tests every action on Shyft and tracks exact costs
 * 
 * Actions tested:
 * 1. Create Profile
 * 2. Create Post
 * 3. Like Post
 * 4. Create Comment
 * 5. React to Post
 * 6. Follow User
 * 7. Unfollow User (refund test)
 * 
 * For each: records balance before & after, calculates rent + fees
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
  balanceBefore: number;
  balanceAfter: number;
  cost: number;
  isRefund: boolean;
}

async function main() {
  const connection = new Connection(RPC, "confirmed");

  // Use the existing funded wallet
  const keypairPathMain = require("os").homedir() + "/.config/solana/mainnet.json";
  if (!fs.existsSync(keypairPathMain)) {
    console.log("❌ No keypair found at", keypairPathMain);
    return;
  }
  const mainSecret = JSON.parse(fs.readFileSync(keypairPathMain, "utf-8"));
  const testKeypair = Keypair.fromSecretKey(Uint8Array.from(mainSecret));
  const testWallet = new Wallet(testKeypair);
  const provider = new AnchorProvider(connection, testWallet, { commitment: "confirmed" });
  const program = new Program(idl as any, provider);
  const user = testKeypair.publicKey;

  console.log("=".repeat(70));
  console.log("  SHYFT.LOL — FULL ON-CHAIN COST TEST");
  console.log("=".repeat(70));
  console.log(`\n🔑 Test wallet: ${user.toBase58()}`);

  const costs: CostEntry[] = [];

  async function trackCost(action: string, fn: () => Promise<string>, isRefund = false): Promise<void> {
    const before = await connection.getBalance(user);
    console.log(`\n${"─".repeat(60)}`);
    console.log(`  ${action}`);
    console.log(`${"─".repeat(60)}`);
    console.log(`  Balance before: ${(before / LAMPORTS_PER_SOL).toFixed(9)} SOL`);

    try {
      const sig = await fn();
      await sleep(3000); // wait for confirmation to settle
      const after = await connection.getBalance(user);
      const cost = before - after;

      console.log(`  Balance after:  ${(after / LAMPORTS_PER_SOL).toFixed(9)} SOL`);
      if (isRefund) {
        console.log(`  💚 REFUNDED:    +${(Math.abs(cost) / LAMPORTS_PER_SOL).toFixed(9)} SOL (+${Math.abs(cost)} lamports)`);
      } else {
        console.log(`  💸 Cost:        ${(cost / LAMPORTS_PER_SOL).toFixed(9)} SOL (${cost} lamports)`);
      }
      console.log(`  TX: ${sig.slice(0, 20)}...`);

      costs.push({ action, balanceBefore: before, balanceAfter: after, cost, isRefund });
    } catch (err: any) {
      console.log(`  ❌ FAILED: ${err?.message?.slice(0, 100)}`);
      costs.push({ action: action + " (FAILED)", balanceBefore: before, balanceAfter: before, cost: 0, isRefund });
    }
  }

  // We need another user to follow. Let's find one from existing profiles.
  // Load the deployer wallet to find profiles
  const keypairPath = require("os").homedir() + "/.config/solana/mainnet.json";
  let targetOwner: PublicKey | null = null;
  
  try {
    const secretKey = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
    const deployerKeypair = Keypair.fromSecretKey(Uint8Array.from(secretKey));
    const deployerWallet = new Wallet(deployerKeypair);
    const deployerProvider = new AnchorProvider(connection, deployerWallet, { commitment: "confirmed" });
    const deployerProgram = new Program(idl as any, deployerProvider);
    
    const allProfiles = await (deployerProgram.account as any).profile.all();
    for (const p of allProfiles) {
      if (!p.account.owner.equals(user)) {
        targetOwner = p.account.owner;
        console.log(`\n🎯 Follow target: ${targetOwner!.toBase58()} (@${p.account.username})`);
        break;
      }
    }
  } catch {
    console.log("⚠️  Could not find other profiles for follow test");
  }

  const startBalance = await connection.getBalance(user);
  console.log(`\n🏦 Starting balance: ${(startBalance / LAMPORTS_PER_SOL).toFixed(9)} SOL`);

  // ═══════════════════════════════════════════
  // TEST 1: CREATE PROFILE (skip if exists)
  // ═══════════════════════════════════════════
  const [profilePda] = getProfilePda(user);
  let profileExists = false;
  try {
    const profileAcct = await connection.getAccountInfo(profilePda);
    if (profileAcct && profileAcct.data.length > 0) {
      profileExists = true;
      console.log("\n  ℹ️  Profile already exists — skipping creation, will show expected rent cost");
      const profileRent = await connection.getMinimumBalanceForRentExemption(profileAcct.data.length);
      costs.push({ action: "1. CREATE PROFILE (already exists)", balanceBefore: startBalance, balanceAfter: startBalance, cost: profileRent + 5000, isRefund: false });
      console.log(`     Profile size: ${profileAcct.data.length} bytes, rent would be: ${profileRent} lamports + 5000 fee`);
    }
  } catch {}
  
  if (!profileExists) {
    await trackCost("1. CREATE PROFILE", async () => {
      return await program.methods
        .createProfile("testcost", "Cost Test User", "Testing costs on Shyft")
        .accounts({
          profile: profilePda,
          user: user,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    });
  }

  // ═══════════════════════════════════════════
  // TEST 2: CREATE POST
  // ═══════════════════════════════════════════
  const postId = Date.now();
  const [postPda] = getPostPda(user, postId);
  await trackCost("2. CREATE POST", async () => {
    return await program.methods
      .createPost(new BN(postId), "This is a test post to measure on-chain costs! 🚀", false)
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

  // ═══════════════════════════════════════════
  // TEST 3: LIKE POST (no new account — just mutates)
  // ═══════════════════════════════════════════
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

  // ═══════════════════════════════════════════
  // TEST 4: CREATE COMMENT
  // ═══════════════════════════════════════════
  const commentIndex = 0;
  const [commentPda] = getCommentPda(postPda, commentIndex);
  await trackCost("4. CREATE COMMENT", async () => {
    return await program.methods
      .createComment(new BN(postId), new BN(commentIndex), "Great test post! 🔥")
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

  // ═══════════════════════════════════════════
  // TEST 5: REACT TO POST
  // ═══════════════════════════════════════════
  const [reactionPda] = getReactionPda(postPda, user);
  await trackCost("5. REACT TO POST (emoji reaction)", async () => {
    return await program.methods
      .reactToPost(new BN(postId), 1) // reaction_type = 1 (e.g. 🔥)
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

  // ═══════════════════════════════════════════
  // TEST 6: FOLLOW USER
  // ═══════════════════════════════════════════
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
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    });

    // ═══════════════════════════════════════════
    // TEST 7: UNFOLLOW USER (should refund rent)
    // ═══════════════════════════════════════════
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
    console.log("\n⚠️  Skipping follow/unfollow tests (no other profiles found)");
  }

  // ═══════════════════════════════════════════
  // FINAL SUMMARY
  // ═══════════════════════════════════════════
  const endBalance = await connection.getBalance(user);
  const totalSpent = startBalance - endBalance;

  console.log("\n\n" + "═".repeat(70));
  console.log("  COST SUMMARY — SHYFT.LOL ON-CHAIN ACTIONS");
  console.log("═".repeat(70));
  console.log("");
  console.log("  Action                         Cost (SOL)        Cost (lamports)");
  console.log("  " + "─".repeat(66));

  let totalRent = 0;
  let totalFees = 0;
  let totalRefunded = 0;

  for (const entry of costs) {
    if (entry.cost === 0 && entry.action.includes("FAILED")) {
      console.log(`  ${entry.action.padEnd(33)} FAILED`);
      continue;
    }
    if (entry.isRefund) {
      const refund = Math.abs(entry.cost);
      totalRefunded += refund;
      console.log(`  ${entry.action.padEnd(33)} +${(refund / LAMPORTS_PER_SOL).toFixed(9).padStart(14)} SOL  +${String(refund).padStart(12)} lamps  💚 REFUND`);
    } else {
      // Estimate: 5000 lamports = tx fee, rest = rent
      const txFee = 5000;
      const rent = Math.max(0, entry.cost - txFee);
      totalFees += txFee;
      totalRent += rent;
      console.log(`  ${entry.action.padEnd(33)} -${(entry.cost / LAMPORTS_PER_SOL).toFixed(9).padStart(14)} SOL  -${String(entry.cost).padStart(12)} lamps  (rent: ${rent}, fee: ${txFee})`);
    }
  }

  console.log("  " + "─".repeat(66));
  console.log(`  Total rent deposited:          -${(totalRent / LAMPORTS_PER_SOL).toFixed(9).padStart(14)} SOL`);
  console.log(`  Total tx fees (burned):        -${(totalFees / LAMPORTS_PER_SOL).toFixed(9).padStart(14)} SOL`);
  console.log(`  Total refunded:                +${(totalRefunded / LAMPORTS_PER_SOL).toFixed(9).padStart(14)} SOL`);
  console.log(`  ${"─".repeat(50)}`);
  console.log(`  NET TOTAL SPENT:               -${(totalSpent / LAMPORTS_PER_SOL).toFixed(9).padStart(14)} SOL`);
  console.log(`  Refundable (if all closed):    +${((totalRent - totalRefunded) / LAMPORTS_PER_SOL).toFixed(9).padStart(14)} SOL`);
  console.log(`  Permanent cost (fees only):    -${(totalFees / LAMPORTS_PER_SOL).toFixed(9).padStart(14)} SOL`);

  // SOL price estimate
  const solPrice = 150; // rough estimate
  console.log(`\n  💵 At $${solPrice}/SOL:`);
  console.log(`     Total spent:      $${((totalSpent / LAMPORTS_PER_SOL) * solPrice).toFixed(4)}`);
  console.log(`     Permanent cost:   $${((totalFees / LAMPORTS_PER_SOL) * solPrice).toFixed(4)} (tx fees only)`);
  console.log(`     Refundable:       $${(((totalRent - totalRefunded) / LAMPORTS_PER_SOL) * solPrice).toFixed(4)} (if accounts closed)`);

  console.log("\n" + "═".repeat(70));
  console.log("  ACCOUNT SIZES (rent is proportional to size):");
  console.log("═".repeat(70));
  
  // Fetch account sizes
  const profileInfo = await connection.getAccountInfo(profilePda);
  const postInfo = await connection.getAccountInfo(postPda);
  const commentInfo = await connection.getAccountInfo(commentPda);
  const reactionInfo = await connection.getAccountInfo(reactionPda);
  
  if (profileInfo) console.log(`  Profile:   ${profileInfo.data.length} bytes → rent ${await connection.getMinimumBalanceForRentExemption(profileInfo.data.length)} lamports`);
  if (postInfo) console.log(`  Post:      ${postInfo.data.length} bytes → rent ${await connection.getMinimumBalanceForRentExemption(postInfo.data.length)} lamports`);
  if (commentInfo) console.log(`  Comment:   ${commentInfo.data.length} bytes → rent ${await connection.getMinimumBalanceForRentExemption(commentInfo.data.length)} lamports`);
  if (reactionInfo) console.log(`  Reaction:  ${reactionInfo.data.length} bytes → rent ${await connection.getMinimumBalanceForRentExemption(reactionInfo.data.length)} lamports`);

  // Calculate follow account rent
  const followRent = await connection.getMinimumBalanceForRentExemption(8 + 72); // 8 discriminator + FollowAccount::LEN
  console.log(`  Follow:    ${8 + 72} bytes → rent ${followRent} lamports`);

  console.log("\n✅ Test complete!\n");
}

main().catch(console.error);
