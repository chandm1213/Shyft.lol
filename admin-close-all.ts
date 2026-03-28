/**
 * ADMIN FORCE CLOSE ALL — Wipe every program account and reclaim all rent
 * 
 * Uses the admin_force_close instruction which lets the upgrade authority
 * close ANY program-owned account regardless of who created it.
 */

import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL, TransactionInstruction, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { Program, AnchorProvider, Wallet, BN } from "@coral-xyz/anchor";
import * as fs from "fs";
import idl from "./src/lib/idl.json";

const PROGRAM_ID = new PublicKey("EEnouVLAoQGMEbrypEhP3Ct5RgCViCWG4n1nCZNwMxjQ");
const RPC = "https://devnet.helius-rpc.com/?api-key=2cf03460-f790-4350-a211-18086a3a3fd2";

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function main() {
  const connection = new Connection(RPC, "confirmed");

  // Load the deployer/upgrade authority wallet
  const walletKeyData = JSON.parse(fs.readFileSync(
    require("os").homedir() + "/.config/solana/mainnet.json", "utf-8"
  ));
  const authority = Keypair.fromSecretKey(Uint8Array.from(walletKeyData));
  console.log(`\n🔑 Authority: ${authority.publicKey.toBase58()}`);

  const provider = new AnchorProvider(
    connection,
    new Wallet(authority),
    { commitment: "confirmed" }
  );
  const program = new Program(idl as any, provider);

  // Check balance before
  const balanceBefore = await connection.getBalance(authority.publicKey);
  console.log(`💰 Balance BEFORE: ${(balanceBefore / LAMPORTS_PER_SOL).toFixed(6)} SOL\n`);

  console.log("═".repeat(70));
  console.log("  SHYFT.LOL — ADMIN FORCE CLOSE ALL ACCOUNTS");
  console.log("═".repeat(70));

  // Fetch all program accounts
  console.log("\n📡 Fetching all program accounts...");
  const allAccounts = await connection.getProgramAccounts(PROGRAM_ID);
  console.log(`   Found ${allAccounts.length} accounts`);

  const totalRentLocked = allAccounts.reduce((s, a) => s + a.account.lamports, 0);
  console.log(`   Total rent locked: ${(totalRentLocked / LAMPORTS_PER_SOL).toFixed(6)} SOL\n`);

  let closed = 0;
  let failed = 0;
  let rentReclaimed = 0;

  // Process in batches of 5 instructions per transaction for efficiency
  const BATCH_SIZE = 5;
  const batches: { pubkey: PublicKey; lamports: number }[][] = [];
  
  for (let i = 0; i < allAccounts.length; i += BATCH_SIZE) {
    batches.push(
      allAccounts.slice(i, i + BATCH_SIZE).map(a => ({
        pubkey: a.pubkey,
        lamports: a.account.lamports,
      }))
    );
  }

  console.log(`   Processing ${allAccounts.length} accounts in ${batches.length} batches...\n`);

  for (let bi = 0; bi < batches.length; bi++) {
    const batch = batches[bi];
    
    try {
      // Build all instructions for this batch
      const ixs: TransactionInstruction[] = [];
      for (const acct of batch) {
        const ix = await program.methods
          .adminForceClose()
          .accounts({
            targetAccount: acct.pubkey,
            authority: authority.publicKey,
          })
          .instruction();
        ixs.push(ix);
      }

      // Create and send versioned transaction
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
      const messageV0 = new TransactionMessage({
        payerKey: authority.publicKey,
        recentBlockhash: blockhash,
        instructions: ixs,
      }).compileToV0Message();
      
      const tx = new VersionedTransaction(messageV0);
      tx.sign([authority]);
      
      const sig = await connection.sendTransaction(tx, { skipPreflight: false });
      await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");

      const batchRent = batch.reduce((s, a) => s + a.lamports, 0);
      rentReclaimed += batchRent;
      closed += batch.length;
      
      const keys = batch.map(a => a.pubkey.toBase58().slice(0, 12) + "...").join(", ");
      console.log(`   ✅ Batch ${bi + 1}/${batches.length}: closed ${batch.length} accounts (${(batchRent / LAMPORTS_PER_SOL).toFixed(6)} SOL) — ${sig.slice(0, 20)}...`);
      
      await sleep(500);
    } catch (e: any) {
      const msg = e.message || String(e);
      console.log(`   ❌ Batch ${bi + 1}/${batches.length}: FAILED — ${msg.slice(0, 120)}`);
      
      // Fall back to individual transactions for this batch
      console.log(`      Retrying individually...`);
      for (const acct of batch) {
        try {
          const sig = await program.methods
            .adminForceClose()
            .accounts({
              targetAccount: acct.pubkey,
              authority: authority.publicKey,
            })
            .signers([authority])
            .rpc();
          
          closed++;
          rentReclaimed += acct.lamports;
          console.log(`      ✅ ${acct.pubkey.toBase58().slice(0, 16)}... (${(acct.lamports / LAMPORTS_PER_SOL).toFixed(6)} SOL) — ${sig.slice(0, 20)}...`);
          await sleep(500);
        } catch (e2: any) {
          failed++;
          console.log(`      ❌ ${acct.pubkey.toBase58().slice(0, 16)}... — ${(e2.message || String(e2)).slice(0, 100)}`);
          await sleep(500);
        }
      }
    }
  }

  // Final report
  await sleep(2000); // Wait for balance to update
  const balanceAfter = await connection.getBalance(authority.publicKey);
  const actualReclaimed = balanceAfter - balanceBefore;

  console.log("\n" + "═".repeat(70));
  console.log("  RESULTS");
  console.log("═".repeat(70));
  console.log(`  ✅ Closed:   ${closed} accounts`);
  console.log(`  ❌ Failed:   ${failed} accounts`);
  console.log(`  💰 Rent from closed accounts:  ${(rentReclaimed / LAMPORTS_PER_SOL).toFixed(6)} SOL`);
  console.log(`  💰 Actual balance change:      ${(actualReclaimed / LAMPORTS_PER_SOL).toFixed(6)} SOL`);
  console.log(`  💰 Tx fees paid:               ${((rentReclaimed - actualReclaimed) / LAMPORTS_PER_SOL).toFixed(6)} SOL`);
  console.log(`\n  Balance BEFORE: ${(balanceBefore / LAMPORTS_PER_SOL).toFixed(6)} SOL`);
  console.log(`  Balance AFTER:  ${(balanceAfter / LAMPORTS_PER_SOL).toFixed(6)} SOL`);

  // Check remaining accounts
  const remaining = await connection.getProgramAccounts(PROGRAM_ID, { dataSlice: { offset: 0, length: 0 } });
  console.log(`\n  📊 Remaining program accounts: ${remaining.length}`);

  const solPrice = 150;
  console.log(`\n  💵 Net SOL reclaimed: ${(actualReclaimed / LAMPORTS_PER_SOL).toFixed(6)} SOL (~$${((actualReclaimed / LAMPORTS_PER_SOL) * solPrice).toFixed(2)})`);
  console.log("\n✅ Done\n");
}

main().catch(console.error);
