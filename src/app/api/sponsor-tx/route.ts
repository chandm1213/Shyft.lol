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
 * SECURITY LAYERS:
 * 1. Origin check — only shyft.lol (no empty origin fallback)
 * 2. IP-based rate limiting — 5 tx per IP per minute
 * 3. Wallet-based rate limiting — 5 tx per wallet per minute
 * 4. walletAddress MUST be a signer on the tx
 * 5. ONLY Shadowspace + SystemProgram + ComputeBudget allowed
 * 6. Every tx MUST include at least one Shadowspace instruction
 * 7. Treasury must NOT be source on ANY SystemProgram instruction
 * 8. Max 6 instructions per tx
 * 9. Treasury balance reserve check
 */

const SHADOWSPACE_PROGRAM_ID = new PublicKey("EEnouVLAoQGMEbrypEhP3Ct5RgCViCWG4n1nCZNwMxjQ");

// MINIMAL allowed programs — only what Shadowspace needs
const ALLOWED_PROGRAMS = new Set([
  SHADOWSPACE_PROGRAM_ID.toBase58(),
  SystemProgram.programId.toBase58(),
  "ComputeBudget111111111111111111111111111111",
]);

function getTreasuryKeypair(): Keypair {
  const secret = process.env.TREASURY_PRIVATE_KEY;
  if (!secret) throw new Error("TREASURY_PRIVATE_KEY not set");
  // Support both formats: JSON byte array [12,45,...] or base58 string (Phantom export)
  if (secret.trimStart().startsWith("[")) {
    const bytes = JSON.parse(secret) as number[];
    return Keypair.fromSecretKey(new Uint8Array(bytes));
  }
  // base58 string — decode manually
  const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const str = secret.trim();
  const bytes: number[] = [0];
  for (const char of str) {
    let carry = ALPHABET.indexOf(char);
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) { bytes.push(carry & 0xff); carry >>= 8; }
  }
  for (let i = 0; i < str.length && str[i] === "1"; i++) bytes.push(0);
  return Keypair.fromSecretKey(new Uint8Array(bytes.reverse()));
}

// Shadowspace on-chain program is on mainnet
const RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY_PRIVATE}`;

// Rate limiting — per IP AND per wallet, 5 per minute each
const ipTimestamps = new Map<string, number[]>();
const walletTimestamps = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 5;

// Min treasury balance to keep as reserve
const MIN_TREASURY_RESERVE = 100_000_000; // 0.1 SOL

let cachedTreasuryPubkey: string | null = null;

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

function isRateLimited(key: string, store: Map<string, number[]>): boolean {
  const now = Date.now();
  const timestamps = (store.get(key) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  store.set(key, timestamps);
  if (timestamps.length >= RATE_LIMIT_MAX) return true;
  timestamps.push(now);
  store.set(key, timestamps);
  return false;
}

/** GET — returns the treasury public key */
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

// Allowed origins — STRICT. No empty origin fallback.
const ALLOWED_ORIGINS = new Set([
  "https://www.shyft.lol",
  "https://shyft.lol",
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:3099",
]);

function isAllowedOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin") || "";
  const referer = request.headers.get("referer") || "";
  if (origin && ALLOWED_ORIGINS.has(origin)) return true;
  for (const allowed of ALLOWED_ORIGINS) {
    if (referer.startsWith(allowed)) return true;
  }
  // NO FALLBACK — if both origin and referer are missing/invalid, DENY.
  return false;
}

/** POST — DEPRECATED. This route is dead. Use /api/build-tx instead.
 *  Killed 2026-04-04 after security audit found it still accepts client-built transactions. */
export async function POST(request: NextRequest) {
  console.error(`🚨 DEAD ROUTE HIT: /api/sponsor-tx POST from ${request.headers.get("origin")}`);
  return NextResponse.json({ error: "This endpoint is deprecated. Use /api/build-tx" }, { status: 410 });
  /* DEAD CODE BELOW — kept for reference only

    const body = await request.json();
    const { transaction, walletAddress } = body;
    if (!transaction || !walletAddress) {
      return NextResponse.json({ error: "Missing transaction or walletAddress" }, { status: 400 });
    }

    let walletPubkey: PublicKey;
    try {
      walletPubkey = new PublicKey(walletAddress);
    } catch {
      return NextResponse.json({ error: "Invalid walletAddress" }, { status: 400 });
    }

    // ── 2. RATE LIMIT — by IP AND wallet ──
    const clientIp = getClientIp(request);
    if (isRateLimited(clientIp, ipTimestamps)) {
      console.error(`🚨 IP rate limited: ${clientIp}`);
      return NextResponse.json({ error: "Rate limited" }, { status: 429 });
    }
    if (isRateLimited(walletAddress, walletTimestamps)) {
      console.error(`🚨 Wallet rate limited: ${walletAddress}`);
      return NextResponse.json({ error: "Rate limited" }, { status: 429 });
    }

    const connection = new Connection(RPC_URL, "confirmed");
    const treasury = getTreasuryKeypair();

    // ── 3. TREASURY BALANCE CHECK ──
    const treasuryBalance = await connection.getBalance(treasury.publicKey);
    if (treasuryBalance < MIN_TREASURY_RESERVE) {
      console.error("⚠️ Treasury low:", treasuryBalance / 1e9, "SOL");
      return NextResponse.json({ error: "Platform treasury low" }, { status: 503 });
    }

    // ── 4. DESERIALIZE TX ──
    let tx: Transaction;
    try {
      tx = Transaction.from(Buffer.from(transaction, "base64"));
    } catch {
      return NextResponse.json({ error: "Invalid transaction data" }, { status: 400 });
    }

    // ── 5. VERIFY FEE PAYER IS TREASURY ──
    if (!tx.feePayer || !tx.feePayer.equals(treasury.publicKey)) {
      return NextResponse.json({ error: "Fee payer must be treasury" }, { status: 400 });
    }

    // ── 6. INSTRUCTION LIMIT ──
    if (tx.instructions.length > 6) {
      return NextResponse.json({ error: "Too many instructions" }, { status: 400 });
    }

    // ── 7. VALIDATE ALL PROGRAMS — defense in depth ──
    for (const ix of tx.instructions) {
      const programId = ix.programId.toBase58();
      if (!ALLOWED_PROGRAMS.has(programId)) {
        console.error(`🚨 BLOCKED program: ${programId} from ${walletAddress}`);
        return NextResponse.json({ error: "Unauthorized program" }, { status: 403 });
      }
    }

    // ── 8. MUST HAVE AT LEAST ONE SHADOWSPACE INSTRUCTION ──
    const hasShadowspace = tx.instructions.some(
      (ix: any) => ix.programId.toBase58() === SHADOWSPACE_PROGRAM_ID.toBase58()
    );
    if (!hasShadowspace) {
      console.error(`🚨 BLOCKED: No Shadowspace instruction from ${walletAddress}`);
      return NextResponse.json({ error: "Must include Shadowspace instruction" }, { status: 403 });
    }

    // ── 9. BLOCK COMPUTEBUDGET — server controls fees, not the client ──
    const COMPUTE_BUDGET_ID = "ComputeBudget111111111111111111111111111111";
    for (const ix of tx.instructions) {
      if (ix.programId.toBase58() === COMPUTE_BUDGET_ID) {
        console.error(`🚨 BLOCKED: ComputeBudget instruction from ${walletAddress}`);
        return NextResponse.json({ error: "ComputeBudget not allowed" }, { status: 403 });
      }
    }

    // ── 10. BLOCK SYSTEMPROG WHERE TREASURY IS SOURCE ──
    for (const ix of tx.instructions) {
      if (ix.programId.equals(SystemProgram.programId)) {
        const firstKey = ix.keys[0];
        if (firstKey && firstKey.pubkey.equals(treasury.publicKey) && firstKey.isWritable) {
          const ixType = ix.data.length >= 4 ? ix.data.readUInt32LE(0) : -1;
          console.error(`🚨 BLOCKED: SystemProgram type ${ixType} with treasury as source from ${walletAddress}`);
          return NextResponse.json({ error: "Treasury cannot be source on SystemProgram" }, { status: 403 });
        }
      }
    }

    // ── 11. FRESH BLOCKHASH — server sets this so client can't replay stale txs ──
    const { blockhash } = await connection.getLatestBlockhash("confirmed");
    tx.recentBlockhash = blockhash;

    // ── 12. TREASURY SIGNS — this locks the tx contents cryptographically ──
    // Any byte change by the client after this invalidates the signature.
    tx.partialSign(treasury);

    // ── 13. RETURN the treasury-signed tx for the client to co-sign + submit ──
    const signedTx = tx.serialize({ requireAllSignatures: false, verifySignatures: false });

    console.log(`🎟️ Signed for: ${walletAddress.slice(0, 8)}.. | IP: ${clientIp}`);
    return NextResponse.json({
      success: true,
      transaction: signedTx.toString("base64"),
    });
  } catch (err: any) {
    console.error("Sponsor tx error:", err);
    return NextResponse.json({ error: err?.message || "Internal error" }, { status: 500 });
  }
  END OF DEAD CODE */
}
