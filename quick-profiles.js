const { Connection, PublicKey, Keypair } = require("@solana/web3.js");
const { Program, AnchorProvider, Wallet } = require("@coral-xyz/anchor");
const idl = require("./src/lib/idl.json");

const PROGRAM_ID = new PublicKey("EEnouVLAoQGMEbrypEhP3Ct5RgCViCWG4n1nCZNwMxjQ");
const RPC = "https://devnet.helius-rpc.com/?api-key=2cf03460-f790-4350-a211-18086a3a3fd2";

async function main() {
  const conn = new Connection(RPC, "confirmed");
  const kp = Keypair.generate();
  const provider = new AnchorProvider(conn, new Wallet(kp), { commitment: "confirmed" });
  const program = new Program(idl, provider);
  
  const all = await program.account.profile.all();
  for (const p of all) {
    console.log(JSON.stringify({
      owner: p.account.owner.toBase58(),
      username: p.account.username,
      displayName: p.account.displayName,
      avatarUrl: p.account.avatarUrl,
      bannerUrl: p.account.bannerUrl,
    }, null, 2));
  }
}
main();
