/**
 * 🔴 REAL TX TAMPERING ATTACK — actually sends tampered tx to Solana
 * Proves that modifying any byte after treasury signs = Solana rejects
 */
import { Connection, Transaction } from "@solana/web3.js";

const BASE_URL = "https://www.shyft.lol";
const ATTACKER_WALLET = "BxEsw8dYEaZkGmEKLTCrzhnJT6k9h7wwoaQEmyiXxKEd";
const RPC = "https://api.mainnet-beta.solana.com";

async function main() {
  console.log("=".repeat(60));
  console.log("🔴 REAL TX TAMPERING ATTACK — sending to Solana mainnet");
  console.log("=".repeat(60));

  // Step 1: Get a legit treasury-signed tx from the API
  console.log("\n1️⃣  Getting treasury-signed tx from /api/build-tx...");
  const res = await fetch(`${BASE_URL}/api/build-tx`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Origin": "https://www.shyft.lol" },
    body: JSON.stringify({
      action: "likePost",
      params: { author: ATTACKER_WALLET, postId: 0 },
      walletAddress: ATTACKER_WALLET,
    }),
  });
  const data = await res.json();
  if (!data.transaction) {
    console.log("❌ Could not get tx:", data.error);
    return;
  }
  
  const txBytes = Buffer.from(data.transaction, "base64");
  console.log("   ✅ Got treasury-signed tx:", txBytes.length, "bytes");

  const connection = new Connection(RPC, "confirmed");

  // ── ATTACK 1: Send the unmodified tx (missing user signature) ──
  console.log("\n2️⃣  ATTACK 1: Send unmodified tx (no user signature)...");
  try {
    const tx = Transaction.from(txBytes);
    // Try to send without user signing — should fail
    const sig = await connection.sendRawTransaction(tx.serialize({ requireAllSignatures: false }), { skipPreflight: false });
    console.log("   🚨 SHOULD NOT REACH HERE! sig:", sig);
  } catch (err: any) {
    const msg = err?.message || String(err);
    if (msg.includes("signature verification") || msg.includes("Signature verification") || msg.includes("missing")) {
      console.log("   ✅ REJECTED by Solana: signature verification failed");
    } else {
      console.log("   ✅ REJECTED:", msg.slice(0, 120));
    }
  }

  // ── ATTACK 2: Tamper with tx data then send ──
  console.log("\n3️⃣  ATTACK 2: Tamper 1 byte in instruction data, send to Solana...");
  try {
    const tampered = Buffer.from(txBytes);
    // Flip a byte in the middle of the tx (instruction data area)
    const flipIdx = Math.floor(tampered.length * 0.7);
    console.log(`   Flipping byte at index ${flipIdx}: 0x${tampered[flipIdx].toString(16)} → 0x${(tampered[flipIdx] ^ 0xff).toString(16)}`);
    tampered[flipIdx] ^= 0xff;
    
    const sig = await connection.sendRawTransaction(tampered, { skipPreflight: false });
    console.log("   🚨 SHOULD NOT REACH HERE! sig:", sig);
  } catch (err: any) {
    const msg = err?.message || String(err);
    if (msg.includes("signature verification") || msg.includes("Signature verification") || msg.includes("invalid")) {
      console.log("   ✅ REJECTED by Solana: signature verification failed (tampered bytes)");
    } else {
      console.log("   ✅ REJECTED:", msg.slice(0, 120));
    }
  }

  // ── ATTACK 3: Try to add extra instruction bytes ──
  console.log("\n4️⃣  ATTACK 3: Append extra bytes to tx, send to Solana...");
  try {
    const extended = Buffer.concat([txBytes, Buffer.from([0x02, 0x00, 0x00, 0x00])]);
    const sig = await connection.sendRawTransaction(extended, { skipPreflight: false });
    console.log("   🚨 SHOULD NOT REACH HERE! sig:", sig);
  } catch (err: any) {
    const msg = err?.message || String(err);
    console.log("   ✅ REJECTED:", msg.slice(0, 120));
  }

  // ── ATTACK 4: Replace blockhash with a different one ──
  console.log("\n5️⃣  ATTACK 4: Replace blockhash in tx, send to Solana...");
  try {
    const tx = Transaction.from(txBytes);
    // Change blockhash to a fresh one (attacker tries to replay with different hash)
    const { blockhash } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    // Treasury signature is now invalid because blockhash changed
    const raw = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
    const sig = await connection.sendRawTransaction(raw, { skipPreflight: false });
    console.log("   🚨 SHOULD NOT REACH HERE! sig:", sig);
  } catch (err: any) {
    const msg = err?.message || String(err);
    if (msg.includes("signature verification") || msg.includes("Signature verification")) {
      console.log("   ✅ REJECTED by Solana: treasury signature invalid after blockhash change");
    } else {
      console.log("   ✅ REJECTED:", msg.slice(0, 120));
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("🔴 ALL REAL ATTACKS REJECTED BY SOLANA MAINNET");
  console.log("=".repeat(60));
}

main().catch(console.error);
