const { Connection, PublicKey } = require("@solana/web3.js");
const { deriveBagsFeeShareV2PartnerConfigPda } = require("@bagsfm/bags-sdk/dist/utils/fee-share-v2/partner-config");

const HELIUS_KEY = "7d359733-8771-4d20-af8c-54f756c96bb1";
const conn = new Connection("https://mainnet.helius-rpc.com/?api-key=" + HELIUS_KEY, "confirmed");

const partnerConfigPda = new PublicKey("B94bGwVuX7tWX8VkkyBZLmQESJ537URMcJcVkF8tdi5T");

async function main() {
  try {
    const accInfo = await conn.getAccountInfo(partnerConfigPda);
    if (!accInfo) {
      console.log("Account does not exist on-chain!");
      return;
    }
    console.log("Account exists, owner:", accInfo.owner.toBase58());
    console.log("Data length:", accInfo.data.length);
    
    // The partner pubkey is at offset 8 (discriminator) + 40 = offset 48, 32 bytes
    const partnerBytes = accInfo.data.subarray(48, 80);
    const partnerWallet = new PublicKey(partnerBytes);
    console.log("Partner wallet stored in PDA:", partnerWallet.toBase58());

    // Verify derivation
    const derivedPda = deriveBagsFeeShareV2PartnerConfigPda(partnerWallet);
    console.log("Derived PDA from stored partner:", derivedPda.toBase58());
    console.log("Matches B94b PDA:", derivedPda.toBase58() === partnerConfigPda.toBase58());

    // Also check user wallet
    const userWallet = new PublicKey("G8iDMHSpKwBQ9pcmXsSceu3WU487ZJY6X4zYPQbhJ68H");
    const userDerived = deriveBagsFeeShareV2PartnerConfigPda(userWallet);
    console.log("\nUser wallet G8iDMH... partner PDA:", userDerived.toBase58());
    console.log("User PDA matches B94b:", userDerived.toBase58() === partnerConfigPda.toBase58());
  } catch (e) {
    console.error("Error:", e.message);
  }
}
main();
