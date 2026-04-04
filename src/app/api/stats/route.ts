import { NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";

/**
 * /api/stats — Returns live on-chain stats for the landing page.
 * Counts program accounts by type using discriminator filters.
 * Cached for 60 seconds to avoid hammering RPC.
 */

const PROGRAM_ID = new PublicKey("EEnouVLAoQGMEbrypEhP3Ct5RgCViCWG4n1nCZNwMxjQ");
const RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY_PRIVATE}`;

// Anchor account discriminators as base58 (first 8 bytes of SHA256("account:<Name>"))
const DISCRIMINATORS: Record<string, string> = {
  Profile:  "XqtBdGS7oVD",
  Post:     "2SCFvsZq1W5",
  Follow:   "WDkFKLBZQjJ",   // account:FollowAccount
  Reaction: "eqoxdQG2hzA",
  Comment:  "SBKTEqMLuVa",
  Chat:     "VSNktsnZqf6",
  Message:  "KVs5m1Nqcgc",
};

interface StatsCache {
  data: Record<string, number>;
  fetchedAt: number;
}

let cache: StatsCache | null = null;
const CACHE_TTL = 60_000; // 60 seconds

async function fetchStats(): Promise<Record<string, number>> {
  // Return cache if fresh
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL) {
    return cache.data;
  }

  const connection = new Connection(RPC_URL, "confirmed");
  const stats: Record<string, number> = {};

  // Fetch counts in parallel using getProgramAccounts with dataSlice(0,0) for efficiency
  const entries = Object.entries(DISCRIMINATORS);
  const results = await Promise.allSettled(
    entries.map(([name, disc]) =>
      connection.getProgramAccounts(PROGRAM_ID, {
        filters: [{ memcmp: { offset: 0, bytes: disc } }],
        dataSlice: { offset: 0, length: 0 }, // Don't fetch data, just count
      }).then(accounts => ({ name, count: accounts.length }))
    )
  );

  for (const result of results) {
    if (result.status === "fulfilled") {
      stats[result.value.name] = result.value.count;
    } else {
      // Log the error so we can see what's going wrong
      const name = entries[results.indexOf(result)][0];
      console.error(`Stats fetch failed for ${name}:`, result.reason?.message || result.reason);
      stats[name] = cache?.data[name] || 0;
    }
  }

  // Transactions = sum of all on-chain account actions
  // (profiles + posts + follows + reactions + comments + messages)
  // More reliable than getSignaturesForAddress which caps at 1000 and often fails
  stats.Transactions =
    (stats.Profile || 0) +
    (stats.Post || 0) +
    (stats.Follow || 0) +
    (stats.Reaction || 0) +
    (stats.Comment || 0) +
    (stats.Chat || 0) +
    (stats.Message || 0);

  cache = { data: stats, fetchedAt: Date.now() };
  return stats;
}

export async function GET() {
  try {
    const stats = await fetchStats();

    return NextResponse.json({
      profiles: stats.Profile || 0,
      posts: stats.Post || 0,
      follows: stats.Follow || 0,
      reactions: stats.Reaction || 0,
      comments: stats.Comment || 0,
      chats: stats.Chat || 0,
      messages: stats.Message || 0,
      transactions: stats.Transactions || 0,
    }, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
      },
    });
  } catch (err: any) {
    console.error("Stats error:", err);
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
  }
}
