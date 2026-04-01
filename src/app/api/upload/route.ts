import { NextRequest, NextResponse } from "next/server";
import { PinataSDK } from "pinata";

/**
 * Image upload API route
 * Uploads images to Pinata IPFS (decentralized, permanent storage)
 * POST /api/upload with FormData containing "image" file
 * Returns { url: string } with the IPFS gateway URL
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

export async function POST(request: NextRequest) {
  try {
    const origin = request.headers.get("origin") || "";
    const referer = request.headers.get("referer") || "";
    const allowed = (origin && ALLOWED_ORIGINS.has(origin))
      || [...ALLOWED_ORIGINS].some(o => referer.startsWith(o))
      || (!origin && !referer);
    if (!allowed) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get("image") as File;

    if (!file) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    // Validate file type
    const validTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!validTypes.includes(file.type)) {
      return NextResponse.json({ error: "Invalid file type. Use JPG, PNG, GIF, or WebP" }, { status: 400 });
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large. Max 10MB" }, { status: 400 });
    }

    // Upload to Pinata IPFS
    const upload = await pinata.upload.public.file(file);
    const gateway = (process.env.PINATA_GATEWAY || "gateway.pinata.cloud").trim();
    const url = `https://${gateway}/ipfs/${upload.cid}`;

    return NextResponse.json({
      url,
      thumb: url,
      cid: upload.cid,
    });
  } catch (err: any) {
    console.error("Upload error:", err);
    return NextResponse.json({ error: err.message || "Upload failed" }, { status: 500 });
  }
}
