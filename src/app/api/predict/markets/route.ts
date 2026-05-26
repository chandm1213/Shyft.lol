import { NextRequest, NextResponse } from "next/server";
import { PNPClient } from "pnp-sdk";
import { PublicKey } from "@solana/web3.js";

export const maxDuration = 30;
export const revalidate = 60; // cache 60 seconds

const RPC = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

function isTrusted(req: NextRequest) {
  const client = (req.headers.get("x-shyft-client") || "").toLowerCase();
  const origin = req.headers.get("origin") || "";
  return (
    client === "ios" || client === "mobile" || client === "android" ||
    origin.includes("shyft.lol") || origin.includes("localhost")
  );
}

export async function GET(req: NextRequest) {
  if (!isTrusted(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const client = new PNPClient(RPC);

    // Fetch V2 AMM market addresses
    const addresses = await client.fetchMarketAddresses();

    const now = Math.floor(Date.now() / 1000);
    const markets: any[] = [];

    // Fetch up to 60 addresses, collect active ones with prices
    // We batch to avoid hammering RPC
    const BATCH = 60;
    const sample = addresses.slice(0, BATCH);

    const results = await Promise.allSettled(
      sample.map(async (addr: string) => {
        const { account } = await client.fetchMarket(new PublicKey(addr));
        const endTime = parseInt(account.end_time as string, 16);
        if (account.resolved || endTime <= now) return null;
        const price = await client.getMarketPriceV2(addr);
        return {
          address: addr,
          question: account.question as string,
          resolved: false,
          endTime,
          yesPrice: price.yesPrice,
          noPrice: price.noPrice,
          yesMultiplier: price.yesMultiplier,
          noMultiplier: price.noMultiplier,
          marketReserves: price.marketReserves,
        };
      })
    );

    for (const r of results) {
      if (r.status === "fulfilled" && r.value) {
        markets.push(r.value);
      }
    }

    // Sort by liquidity (marketReserves) descending
    markets.sort((a, b) => b.marketReserves - a.marketReserves);

    return NextResponse.json({ markets, count: markets.length });
  } catch (err: any) {
    console.error("PNP markets error:", err);
    return NextResponse.json({ error: err.message || "Failed" }, { status: 500 });
  }
}
