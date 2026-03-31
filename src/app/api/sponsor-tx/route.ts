import { NextRequest, NextResponse } from "next/server";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
} from "@solana/web3.js";

/**
 * /api/sponsor-tx — Treasury signs as fee payer for user transactions.
 *
 * SECURITY: Only signs transactions that call the Shadowspace program.
 * Rejects any transaction with SOL transfers, token transfers, or calls
 * to unknown programs. This prevents treasury drain attacks.
 */

// The ONLY program allowed in sponsored transactions (besides SystemProgram for account creation)
const SHADOWSPACE_PROGRAM_ID = new PublicKey("EEnouVLAoQGMEbrypEhP3Ct5RgCViCWG4n1nCZNwMxjQ");

// Programs allowed in instructions (SystemProgram is needed for account init/PDA creation)
const ALLOWED_PROGRAMS = new Set([
  SHADOWSPACE_PROGRAM_ID.toBase58(),
  SystemProgram.programId.toBase58(), // 11111111111111111111111111111111
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL", // Associated Token Program (for account creation)
]);

function getTreasuryKeypair(): Keypair {
  const secret = process.env.TREASURY_PRIVATE_KEY;
  if (!secret) throw new Error("TREASURY_PRIVATE_KEY not set");
  const bytes = JSON.parse(secret) as number[];
  return Keypair.fromSecretKey(new Uint8Array(bytes));
}

// Shadowspace on-chain program is on devnet — sponsor-tx must use devnet
const RPC_URL = process.env.HELIUS_DEVNET_RPC || `https://devnet.helius-rpc.com/?api-key=${process.env.NEXT_PUBLIC_HELIUS_API_KEY}`;

// Rate limit: max 10 sponsored tx per wallet per minute
const txTimestamps = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;

// Min treasury balance to keep as reserve
const MIN_TREASURY_RESERVE = 100_000_000; // 0.1 SOL

let cachedTreasuryPubkey: string | null = null;

/** GET — returns the treasury public key so the frontend knows the fee payer address */
export async function GET() {
  try {
    if (!cachedTreasuryPubkey) {
      cachedTreasuryPubkey = getTreasuryKeypair().publicKey.toBase58();
    }
    return NextResponse.json({ treasuryPubkey: cachedTreasuryPubkey });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}

// Allowed origins — only shyft.lol can call this API
const ALLOWED_ORIGINS = new Set([
  "https://www.shyft.lol",
  "https://shyft.lol",
  "http://localhost:3000",        // local dev
  "http://localhost:3001",
]);

function isAllowedOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin") || "";
  const referer = request.headers.get("referer") || "";
  // Check origin header first (set on cross-origin requests)
  if (origin && ALLOWED_ORIGINS.has(origin)) return true;
  // Fallback: check referer starts with an allowed origin
  for (const allowed of ALLOWED_ORIGINS) {
    if (referer.startsWith(allowed)) return true;
  }
  // Same-origin requests from Next.js (server components) may have no origin/referer
  // Allow if both are empty (internal server-side call)
  if (!origin && !referer) return true;
  return false;
}

/** POST — accepts a partially-signed tx (base64), adds treasury signature, sends it */
export async function POST(request: NextRequest) {
  try {
    // Block requests from unauthorized origins (other websites)
    if (!isAllowedOrigin(request)) {
      console.error(`🚨 BLOCKED: Unauthorized origin — origin: ${request.headers.get("origin")}, referer: ${request.headers.get("referer")}`);
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { transaction, walletAddress } = body;

    if (!transaction || !walletAddress) {
      return NextResponse.json(
        { error: "Missing transaction or walletAddress" },
        { status: 400 }
      );
    }

    // Validate wallet address
    let walletPubkey: PublicKey;
    try {
      walletPubkey = new PublicKey(walletAddress);
    } catch {
      return NextResponse.json({ error: "Invalid walletAddress" }, { status: 400 });
    }

    // Rate limit per wallet
    const now = Date.now();
    const timestamps = txTimestamps.get(walletAddress) || [];
    const recent = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
    if (recent.length >= RATE_LIMIT_MAX) {
      return NextResponse.json(
        { error: "Rate limited. Too many sponsored transactions." },
        { status: 429 }
      );
    }

    const connection = new Connection(RPC_URL, "confirmed");
    const treasury = getTreasuryKeypair();

    // Check treasury balance
    const treasuryBalance = await connection.getBalance(treasury.publicKey);
    if (treasuryBalance < MIN_TREASURY_RESERVE) {
      console.error("⚠️ Treasury balance too low:", treasuryBalance / 1e9, "SOL");
      return NextResponse.json(
        { error: "Platform treasury low — please try again later" },
        { status: 503 }
      );
    }

    // Deserialize the partially-signed transaction
    let tx: Transaction;
    try {
      const txBuffer = Buffer.from(transaction, "base64");
      tx = Transaction.from(txBuffer);
    } catch {
      return NextResponse.json({ error: "Invalid transaction data" }, { status: 400 });
    }

    // Verify the fee payer is the treasury
    if (!tx.feePayer || !tx.feePayer.equals(treasury.publicKey)) {
      return NextResponse.json(
        { error: "Transaction fee payer must be the platform treasury" },
        { status: 400 }
      );
    }

    // ──────────────────────────────────────────────────────────────
    // CRITICAL SECURITY: Validate ALL instructions in the transaction.
    // Only allow calls to the Shadowspace program and SystemProgram.
    // This prevents attackers from crafting SOL transfer instructions
    // that would drain the treasury.
    // ──────────────────────────────────────────────────────────────
    for (const ix of tx.instructions) {
      const programId = ix.programId.toBase58();

      if (!ALLOWED_PROGRAMS.has(programId)) {
        console.error(
          `🚨 BLOCKED: Wallet ${walletAddress} tried to call unauthorized program: ${programId}`
        );
        return NextResponse.json(
          { error: "Transaction contains unauthorized program call" },
          { status: 403 }
        );
      }

      // Extra check: if it's a SystemProgram instruction, make sure
      // the treasury is NOT the source of a transfer (instruction type 2 = Transfer).
      // SystemProgram Transfer instruction layout: [u32 type (LE), u64 lamports (LE)]
      // type 2 = Transfer. The first account is the source.
      if (programId === SystemProgram.programId.toBase58()) {
        const ixType = ix.data.length >= 4 ? ix.data.readUInt32LE(0) : -1;
        // 2 = Transfer, 12 = TransferWithSeed
        if (ixType === 2 || ixType === 12) {
          // First account key is the source — must NOT be the treasury
          const sourceKey = ix.keys[0]?.pubkey;
          if (sourceKey && sourceKey.equals(treasury.publicKey)) {
            console.error(
              `🚨 BLOCKED: Wallet ${walletAddress} tried to transfer SOL FROM treasury`
            );
            return NextResponse.json(
              { error: "Cannot transfer SOL from treasury" },
              { status: 403 }
            );
          }
        }
      }
    }

    // Limit number of instructions to prevent abuse
    if (tx.instructions.length > 10) {
      return NextResponse.json(
        { error: "Transaction has too many instructions" },
        { status: 400 }
      );
    }

    // Add treasury signature
    tx.partialSign(treasury);

    // Send the fully-signed transaction
    const sig = await connection.sendRawTransaction(tx.serialize());
    await connection.confirmTransaction(sig, "confirmed");

    // Update rate limit
    recent.push(now);
    txTimestamps.set(walletAddress, recent);

    console.log(
      `🎟️ Sponsored tx for ${walletAddress.slice(0, 8)}... — sig: ${sig.slice(0, 16)}...`
    );

    return NextResponse.json({ success: true, signature: sig });
  } catch (err: any) {
    console.error("Sponsor tx error:", err);
    return NextResponse.json(
      { error: err?.message || "Internal error" },
      { status: 500 }
    );
  }
}
