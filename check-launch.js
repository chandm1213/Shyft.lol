const { Connection, PublicKey } = require("@solana/web3.js");

const HELIUS_KEY = process.env.NEXT_PUBLIC_HELIUS_API_KEY;
if (!HELIUS_KEY) { console.error("Set NEXT_PUBLIC_HELIUS_API_KEY env var"); process.exit(1); }
const conn = new Connection("https://mainnet.helius-rpc.com/?api-key=" + HELIUS_KEY, "confirmed");
const wallet = "G8iDMHSpKwBQ9pcmXsSceu3WU487ZJY6X4zYPQbhJ68H";
const partnerPda = process.env.BAGS_PARTNER_CONFIG_PDA || "";
if (!partnerPda) { console.error("Set BAGS_PARTNER_CONFIG_PDA env var"); process.exit(1); }

async function main() {
  // Get recent transactions for the wallet
  const sigs = await conn.getSignaturesForAddress(new PublicKey(wallet), { limit: 10 });
  console.log("Recent transactions:");
  for (const sig of sigs) {
    const tx = await conn.getTransaction(sig.signature, { maxSupportedTransactionVersion: 0 });
    if (!tx) continue;
    
    // Get all account keys from the transaction
    const keys = tx.transaction.message.getAccountKeys({ accountKeysFromLookups: tx.meta?.loadedAddresses });
    const allKeys = [];
    for (let i = 0; i < keys.length; i++) {
      allKeys.push(keys.get(i).toBase58());
    }
    
    const hasPartner = allKeys.includes(partnerPda);
    const hasDbcProgram = allKeys.includes("dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN");
    const err = sig.err ? "FAILED" : "OK";
    
    console.log(`\n${sig.signature.slice(0, 20)}... [${err}]`);
    console.log(`  Time: ${new Date(sig.blockTime * 1000).toISOString()}`);
    console.log(`  Has B94b partner PDA: ${hasPartner}`);
    console.log(`  Has DBC program: ${hasDbcProgram}`);
    if (hasPartner) {
      console.log("  ✅ PARTNER KEY FOUND!");
    }
  }
}
main().catch(console.error);
