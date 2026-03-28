import { Connection, PublicKey } from "@solana/web3.js";
const PROGRAM_ID = new PublicKey("EEnouVLAoQGMEbrypEhP3Ct5RgCViCWG4n1nCZNwMxjQ");
const RPC = "https://devnet.helius-rpc.com/?api-key=2cf03460-f790-4350-a211-18086a3a3fd2";

const DISC: Record<string, string> = {
  "b865a5bc5f3f7fbc": "Profile",
  "08935abab938c096": "Post",
  "9687604437c73241": "Comment",
  "e23d64bfdfdd8e8b": "Reaction",
  "aeb1883c8a5494d1": "FollowAccount",
  "aa044780b967fab1": "Chat",
  "6e97176ec6067db5": "Message",
  "ab2eb43af5dd67ae": "Conversation",
  "e904730e2e150100": "SessionToken",
};

async function main() {
  const conn = new Connection(RPC, "confirmed");
  const accts = await conn.getProgramAccounts(PROGRAM_ID);

  const unknowns: any[] = [];
  for (const a of accts) {
    const disc = Buffer.from(a.account.data.slice(0, 8)).toString("hex");
    if (!DISC[disc]) {
      unknowns.push({
        pubkey: a.pubkey.toBase58().slice(0, 16),
        size: a.account.data.length,
        disc,
        lamports: a.account.lamports,
      });
    }
  }

  const bySz: Record<number, number> = {};
  unknowns.forEach((u) => {
    bySz[u.size] = (bySz[u.size] || 0) + 1;
  });
  console.log("Unknown accounts by size:", JSON.stringify(bySz));
  console.log("Sample unknowns:", JSON.stringify(unknowns.slice(0, 5), null, 2));

  // Also check all unique owners across all profiles
  const profileOwners: string[] = [];
  for (const a of accts) {
    const disc = Buffer.from(a.account.data.slice(0, 8)).toString("hex");
    if (disc === "b865a5bc5f3f7fbc") {
      const owner = new PublicKey(a.account.data.slice(8, 40));
      profileOwners.push(owner.toBase58());
    }
  }
  console.log("\nAll profile owners:", profileOwners);
}
main();
