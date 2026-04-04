import { Connection, Transaction, PublicKey, Keypair, TransactionInstruction, ComputeBudgetProgram } from "@solana/web3.js";

// Simulate what the attacker did — craft a tx with insane priority fee
const SHADOWSPACE = new PublicKey("EEnouVLAoQGMEbrypEhP3Ct5RgCViCWG4n1nCZNwMxjQ");

async function main() {
  // 1. Get treasury pubkey from sponsor-tx
  const res = await fetch("https://www.shyft.lol/api/sponsor-tx");
  const { treasuryPubkey } = await res.json();
  console.log("Treasury (fee payer):", treasuryPubkey);

  // 2. Create a dummy wallet (attacker)
  const attacker = Keypair.generate();
  console.log("Attacker wallet:", attacker.publicKey.toBase58());

  // 3. Build the ATTACK transaction — same as hacker did
  const connection = new Connection("https://api.mainnet-beta.solana.com");
  const { blockhash } = await connection.getLatestBlockhash();

  const tx = new Transaction();
  tx.recentBlockhash = blockhash;
  tx.feePayer = new PublicKey(treasuryPubkey);

  // THE ATTACK: 730 billion microlamports priority fee
  tx.add(ComputeBudgetProgram.setComputeUnitPrice({ 
    microLamports: 730_000_000_000  // 730 billion — the exact attack
  }));

  // Need a valid Shadowspace instruction too (to pass check #9)
  // Just a dummy — doesn't matter, the priority fee check should block FIRST
  // We'll use a like_post with garbage data
  tx.add(new TransactionInstruction({
    programId: SHADOWSPACE,
    keys: [
      { pubkey: attacker.publicKey, isWritable: true, isSigner: true },
    ],
    data: Buffer.alloc(8), // garbage
  }));

  // Attacker signs
  tx.partialSign(attacker);

  // 4. Send to sponsor-tx — this should be BLOCKED
  console.log("\n🔴 Sending attack transaction to sponsor-tx...");
  console.log("   ComputeUnitPrice: 730,000,000,000 microlamports");
  console.log("   This would cost ~4 SOL in fees\n");

  const attackRes = await fetch("https://www.shyft.lol/api/sponsor-tx", {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "Origin": "https://www.shyft.lol"
    },
    body: JSON.stringify({
      transaction: tx.serialize({ requireAllSignatures: false }).toString("base64"),
      walletAddress: attacker.publicKey.toBase58(),
    }),
  });

  const result = await attackRes.json();
  console.log("Status:", attackRes.status);
  console.log("Response:", JSON.stringify(result));

  if (attackRes.status === 403 && result.error?.includes("Compute unit price too high")) {
    console.log("\n✅ ATTACK BLOCKED! Priority fee drain is patched.");
  } else if (attackRes.status === 200) {
    console.log("\n🚨 ATTACK SUCCEEDED — THIS IS BAD");
  } else {
    console.log("\n⚠️  Blocked for a different reason:", result.error);
  }
}

main().catch(console.error);
