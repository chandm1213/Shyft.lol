import { Connection, PublicKey } from "@solana/web3.js";

const PROGRAM_ID = new PublicKey("EEnouVLAoQGMEbrypEhP3Ct5RgCViCWG4n1nCZNwMxjQ");
const conn = new Connection("https://devnet.helius-rpc.com/?api-key=7d359733-8771-4d20-af8c-54f756c96bb1", "confirmed");

async function main() {
  const accounts = await conn.getProgramAccounts(PROGRAM_ID);
  console.log("Total program accounts:", accounts.length);

  const profiles: { username: string; owner: string; displayName: string }[] = [];
  for (const acc of accounts) {
    const data = acc.account.data;
    if (data.length > 50) {
      try {
        const usernameLen = data.readUInt32LE(40);
        if (usernameLen > 0 && usernameLen < 20) {
          const username = data.slice(44, 44 + usernameLen).toString("utf8");
          if (/^[a-z0-9_]+$/i.test(username)) {
            const owner = new PublicKey(data.slice(8, 40)).toBase58();
            // Try display name
            const dnOffset = 44 + usernameLen;
            const dnLen = data.readUInt32LE(dnOffset);
            let displayName = "";
            if (dnLen > 0 && dnLen < 30) {
              displayName = data.slice(dnOffset + 4, dnOffset + 4 + dnLen).toString("utf8");
            }
            profiles.push({ username, owner: owner.slice(0, 8) + "...", displayName });
          }
        }
      } catch {}
    }
  }

  console.log("\nRegistered profiles:", profiles.length);
  console.log("─".repeat(50));
  profiles.forEach((p, i) => {
    console.log(`${i + 1}. @${p.username} — ${p.displayName} (${p.owner})`);
  });
}

main().catch(console.error);
