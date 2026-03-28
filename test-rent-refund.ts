/**
 * Test: Does Solana actually refund rent when you close an account?
 * 
 * We'll:
 * 1. Check balance BEFORE
 * 2. Follow someone (creates a FollowAccount, pays rent)
 * 3. Check balance AFTER follow (rent deducted)
 * 4. Unfollow (closes the FollowAccount, rent should come back)
 * 5. Check balance AFTER unfollow (should get rent back)
 */

import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { Program, AnchorProvider, Wallet, BN } from "@coral-xyz/anchor";
import * as fs from "fs";
import idl from "./src/lib/idl.json";

const PROGRAM_ID = new PublicKey("EEnouVLAoQGMEbrypEhP3Ct5RgCViCWG4n1nCZNwMxjQ");
const RPC = "https://devnet.helius-rpc.com/?api-key=2cf03460-f790-4350-a211-18086a3a3fd2";

const PROFILE_SEED = Buffer.from("profile");
const FOLLOW_SEED = Buffer.from("follow");

function getProfilePda(owner: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([PROFILE_SEED, owner.toBuffer()], PROGRAM_ID);
}

function getFollowPda(follower: PublicKey, following: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([FOLLOW_SEED, follower.toBuffer(), following.toBuffer()], PROGRAM_ID);
}

async function main() {
  const connection = new Connection(RPC, "confirmed");

  // Load wallet from default Solana config
  const keypairPath = require("os").homedir() + "/.config/solana/mainnet.json";
  if (!fs.existsSync(keypairPath)) {
    console.log("❌ No keypair found at", keypairPath);
    return;
  }
  const secretKey = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
  const keypair = Keypair.fromSecretKey(Uint8Array.from(secretKey));
  const wallet = new Wallet(keypair);
  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
  const program = new Program(idl as any, provider);

  const user = keypair.publicKey;
  console.log("🔑 Wallet:", user.toBase58());

  // First check if we have a profile
  const [profilePda] = getProfilePda(user);
  let profile;
  try {
    profile = await (program.account as any).profile.fetch(profilePda);
    console.log("✅ Profile found:", profile.username);
  } catch {
    console.log("❌ No profile found. You need a profile first to test follow/unfollow.");
    console.log("   Run the app and create a profile, then run this test again.");
    return;
  }

  // We need a second user to follow. Let's just use a known pubkey that has a profile.
  // Let's find any other profile on the program
  console.log("\n📡 Fetching all profiles to find someone to follow...");
  const allProfiles = await (program.account as any).profile.all();
  
  let targetOwner: PublicKey | null = null;
  for (const p of allProfiles) {
    if (!p.account.owner.equals(user)) {
      targetOwner = p.account.owner;
      console.log("   Found target:", targetOwner!.toBase58(), "(@" + p.account.username + ")");
      break;
    }
  }

  if (!targetOwner) {
    console.log("❌ No other profiles found to follow. Need at least 2 profiles on devnet.");
    return;
  }

  // Check if already following
  const [followPda] = getFollowPda(user, targetOwner);
  let alreadyFollowing = false;
  try {
    await (program.account as any).followAccount.fetch(followPda);
    alreadyFollowing = true;
    console.log("⚠️  Already following this user. Will unfollow first, then re-follow.");
  } catch {
    console.log("✅ Not following yet. Good.");
  }

  // If already following, unfollow first
  if (alreadyFollowing) {
    console.log("\n--- UNFOLLOWING FIRST ---");
    const [followerProfilePda] = getProfilePda(user);
    const [followingProfilePda] = getProfilePda(targetOwner);
    
    const sig = await program.methods
      .unfollowUser()
      .accounts({
        followAccount: followPda,
        followerProfile: followerProfilePda,
        followingProfile: followingProfilePda,
        user: user,
      })
      .rpc();
    console.log("   Unfollowed. TX:", sig);
    await new Promise(r => setTimeout(r, 2000));
  }

  // ========== THE ACTUAL TEST ==========
  
  console.log("\n" + "=".repeat(60));
  console.log("  RENT REFUND TEST");
  console.log("=".repeat(60));

  // Step 1: Balance BEFORE
  const balanceBefore = await connection.getBalance(user);
  console.log(`\n1️⃣  Balance BEFORE follow: ${(balanceBefore / LAMPORTS_PER_SOL).toFixed(9)} SOL`);
  console.log(`   (${balanceBefore} lamports)`);

  // Step 2: Follow (creates FollowAccount, pays rent)
  console.log("\n2️⃣  Following user...");
  const [followerProfilePda] = getProfilePda(user);
  const [followingProfilePda] = getProfilePda(targetOwner);

  const followSig = await program.methods
    .followUser()
    .accounts({
      followAccount: followPda,
      followerProfile: followerProfilePda,
      followingProfile: followingProfilePda,
      user: user,
      systemProgram: new PublicKey("11111111111111111111111111111111"),
    })
    .rpc();
  console.log("   Follow TX:", followSig);
  await new Promise(r => setTimeout(r, 3000));

  // Step 3: Balance AFTER follow
  const balanceAfterFollow = await connection.getBalance(user);
  const rentPaid = balanceBefore - balanceAfterFollow;
  console.log(`\n3️⃣  Balance AFTER follow:  ${(balanceAfterFollow / LAMPORTS_PER_SOL).toFixed(9)} SOL`);
  console.log(`   Rent + fees paid: ${(rentPaid / LAMPORTS_PER_SOL).toFixed(9)} SOL (${rentPaid} lamports)`);

  // Step 4: Unfollow (closes FollowAccount, should refund rent)
  console.log("\n4️⃣  Unfollowing user...");
  const unfollowSig = await program.methods
    .unfollowUser()
    .accounts({
      followAccount: followPda,
      followerProfile: followerProfilePda,
      followingProfile: followingProfilePda,
      user: user,
    })
    .rpc();
  console.log("   Unfollow TX:", unfollowSig);
  await new Promise(r => setTimeout(r, 3000));

  // Step 5: Balance AFTER unfollow
  const balanceAfterUnfollow = await connection.getBalance(user);
  const rentRefunded = balanceAfterUnfollow - balanceAfterFollow;
  const netCost = balanceBefore - balanceAfterUnfollow;

  console.log(`\n5️⃣  Balance AFTER unfollow: ${(balanceAfterUnfollow / LAMPORTS_PER_SOL).toFixed(9)} SOL`);
  console.log(`   Rent refunded: ${(rentRefunded / LAMPORTS_PER_SOL).toFixed(9)} SOL (${rentRefunded} lamports)`);

  console.log("\n" + "=".repeat(60));
  console.log("  RESULTS");
  console.log("=".repeat(60));
  console.log(`  Rent paid on follow:     ${rentPaid} lamports`);
  console.log(`  Rent refunded on unfollow: ${rentRefunded} lamports`);
  console.log(`  Net cost (tx fees only):  ${netCost} lamports (${(netCost / LAMPORTS_PER_SOL).toFixed(9)} SOL)`);
  console.log(`  TX fee per transaction:   ~${Math.round(netCost / 2)} lamports`);
  
  if (netCost <= 15000) {
    console.log("\n✅ CONFIRMED: Rent is fully refunded! Only tx fees remain (~0.000005 SOL each)");
  } else {
    console.log("\n⚠️  Net cost higher than expected. Rent may not be fully refunded.");
  }
}

main().catch(console.error);
