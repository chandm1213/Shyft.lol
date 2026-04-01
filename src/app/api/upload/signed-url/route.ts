import { NextRequest, NextResponse } from "next/server";
import { PinataSDK } from "pinata";

/**
 * Returns a temporary signed upload URL from Pinata.
 * The client uploads directly to Pinata — bypasses Vercel's 4.5MB body limit.
 * GET /api/upload/signed-url
 */

const pinata = new PinataSDK({
  pinataJwt: process.env.PINATA_JWT!.trim(),
  pinataGateway: (process.env.PINATA_GATEWAY || "gateway.pinata.cloud").trim(),
});

const ALLOWED_ORIGINS = new Set([
  "https://www.shyft.lol",
  "https://shyft.lol",
  "http://localhost:3000",
  "http://localhost:3001",
]);

export async function GET(request: NextRequest) {
  try {
    const origin = request.headers.get("origin") || "";
    const referer = request.headers.get("referer") || "";
    const allowed =
      (origin && ALLOWED_ORIGINS.has(origin)) ||
      [...ALLOWED_ORIGINS].some((o) => referer.startsWith(o)) ||
      (!origin && !referer);
    if (!allowed) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Create a temporary upload URL valid for 120 seconds
    // createSignedURL returns the URL string directly
    const signedUrl = await pinata.upload.public.createSignedURL({
      expires: 120,
    });

    const gateway = (process.env.PINATA_GATEWAY || "gateway.pinata.cloud").trim();

    return NextResponse.json({ signedUrl, gateway });
  } catch (err: any) {
    console.error("Signed URL error:", err);
    return NextResponse.json({ error: err.message || "Failed to get upload URL" }, { status: 500 });
  }
}
