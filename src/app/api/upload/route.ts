import { NextRequest, NextResponse } from "next/server";

/**
 * Image upload API route
 * Uploads images to freeimage.host (free image hosting)
 * POST /api/upload with FormData containing "image" file
 * Returns { url: string } with the hosted image URL
 */

const FREEIMAGE_API_KEY = process.env.FREEIMAGE_API_KEY || "6d207e02198a847aa98d0a2a901485a5";

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

    // Convert to base64
    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");

    // Upload to freeimage.host using URLSearchParams
    const body = new URLSearchParams();
    body.append("key", FREEIMAGE_API_KEY);
    body.append("source", base64);
    body.append("format", "json");

    const response = await fetch("https://freeimage.host/api/1/upload", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    const data = await response.json();

    if (data.status_code !== 200) {
      console.error("freeimage error:", JSON.stringify(data));
      return NextResponse.json({ error: "Upload failed", details: data }, { status: 500 });
    }

    return NextResponse.json({
      url: data.image.display_url || data.image.url,
      thumb: data.image.thumb?.url || data.image.display_url || data.image.url,
      delete_url: data.image.delete_url || "",
    });
  } catch (err: any) {
    console.error("Upload error:", err);
    return NextResponse.json({ error: err.message || "Upload failed" }, { status: 500 });
  }
}
