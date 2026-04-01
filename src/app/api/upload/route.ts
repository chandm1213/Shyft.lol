import { NextRequest, NextResponse } from "next/server";
import { PinataSDK } from "pinata";

// Allow 60s for large video uploads
export const maxDuration = 60;

/**
 * Media upload API route
 * Uploads images & videos to Pinata IPFS (decentralized, permanent storage)
 * POST /api/upload with FormData containing "image" or "file" field
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
    const file = (formData.get("file") || formData.get("image")) as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate file type
    const imageTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    const videoTypes = ["video/mp4", "video/webm", "video/quicktime"];
    const validTypes = [...imageTypes, ...videoTypes];
    const isVideo = videoTypes.includes(file.type);

    if (!validTypes.includes(file.type)) {
      return NextResponse.json({ error: "Invalid file type. Use JPG, PNG, GIF, WebP, MP4, WebM, or MOV" }, { status: 400 });
    }

    // Validate file size (images: 10MB, videos: 50MB)
    const maxSize = isVideo ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json({ error: `File too large. Max ${isVideo ? "50MB" : "10MB"}` }, { status: 400 });
    }

    // Upload to Pinata IPFS
    const upload = await pinata.upload.public.file(file);
    const gateway = (process.env.PINATA_GATEWAY || "gateway.pinata.cloud").trim();
    // Include original filename so the URL has a file extension (needed for video detection)
    const safeName = file.name?.replace(/[^a-zA-Z0-9._-]/g, "_") || (isVideo ? "video.mp4" : "image.png");
    const url = `https://${gateway}/ipfs/${upload.cid}/${safeName}`;

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
