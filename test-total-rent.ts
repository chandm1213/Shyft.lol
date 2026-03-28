/**
 * Check total rent locked across ALL on-chain accounts on the Shyft program
 */

import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";

const PROGRAM_ID = new PublicKey("EEnouVLAoQGMEbrypEhP3Ct5RgCViCWG4n1nCZNwMxjQ");
const RPC = "https://devnet.helius-rpc.com/?api-key=2cf03460-f790-4350-a211-18086a3a3fd2";

async function main() {
  const connection = new Connection(RPC, "confirmed");

  console.log("═".repeat(70));
  console.log("  SHYFT.LOL — TOTAL RENT LOCKED IN ALL ON-CHAIN ACCOUNTS");
  console.log("═".repeat(70));
  console.log(`\n📡 Fetching all program accounts...`);

  // Get ALL accounts owned by the program
  const allAccounts = await connection.getProgramAccounts(PROGRAM_ID, {
    dataSlice: { offset: 0, length: 0 }, // Don't fetch data, just metadata
  });

  console.log(`   Found ${allAccounts.length} total accounts\n`);

  // Now fetch with data to categorize them by discriminator/size
  const fullAccounts = await connection.getProgramAccounts(PROGRAM_ID);

  // Categorize by account size (each type has a distinct size)
  const categories: Record<string, { count: number; totalRent: number; sizes: number[] }> = {};
  
  // Known sizes (8 byte discriminator + struct)
  // Old schema sizes (pre-optimization accounts still on chain):
  // Profile: 429 or 853 or 315 (new)
  // Post: 577 or 269 (new)  
  // Comment: 232 or 192 (new)
  // Reaction: 81 or 73 (new)
  // Follow: 80 or 72 (new)
  // Chat: 96
  // Message: 589
  
  const sizeToType: Record<number, string> = {
    // New optimized sizes
    315: "Profile (optimized)",
    269: "Post (optimized)",
    192: "Comment (optimized)",
    73: "Reaction (optimized)",
    72: "Follow (optimized)",
    // Old sizes
    429: "Profile (old schema)",
    853: "Profile (old large)",
    577: "Post (old schema)",
    232: "Comment (old schema)",
    81: "Reaction (old schema)",
    80: "Follow (old schema)",
    96: "Chat",
    589: "Message",
  };

  let totalRent = 0;
  let totalAccounts = 0;

  for (const acct of fullAccounts) {
    const size = acct.account.data.length;
    const rent = acct.account.lamports;
    const type = sizeToType[size] || `Unknown (${size} bytes)`;

    if (!categories[type]) {
      categories[type] = { count: 0, totalRent: 0, sizes: [] };
    }
    categories[type].count++;
    categories[type].totalRent += rent;
    if (!categories[type].sizes.includes(size)) {
      categories[type].sizes.push(size);
    }
    totalRent += rent;
    totalAccounts++;
  }

  // Sort by total rent descending
  const sorted = Object.entries(categories).sort((a, b) => b[1].totalRent - a[1].totalRent);

  console.log("  Type                          Count    Total Rent (SOL)     Bytes");
  console.log("  " + "─".repeat(66));

  for (const [type, data] of sorted) {
    const rentSol = (data.totalRent / LAMPORTS_PER_SOL).toFixed(6);
    console.log(`  ${type.padEnd(32)} ${String(data.count).padStart(5)}    ${rentSol.padStart(14)} SOL    ${data.sizes.join(", ")} bytes`);
  }

  console.log("  " + "─".repeat(66));
  console.log(`  TOTAL                          ${String(totalAccounts).padStart(5)}    ${(totalRent / LAMPORTS_PER_SOL).toFixed(6).padStart(14)} SOL`);

  const solPrice = 150;
  console.log(`\n  💵 At $${solPrice}/SOL:`);
  console.log(`     Total rent locked:  $${((totalRent / LAMPORTS_PER_SOL) * solPrice).toFixed(2)}`);
  console.log(`     This rent is REFUNDABLE if accounts are closed.`);

  // Also check the IDL account
  console.log("\n  📋 Additional program accounts:");
  try {
    const programInfo = await connection.getAccountInfo(PROGRAM_ID);
    if (programInfo) {
      console.log(`     Program executable: ${(programInfo.lamports / LAMPORTS_PER_SOL).toFixed(6)} SOL (${programInfo.data.length} bytes)`);
    }
  } catch {}

  console.log("\n✅ Done\n");
}

main().catch(console.error);
