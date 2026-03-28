import { NextRequest, NextResponse } from "next/server";

/**
 * Image upload API route
 * Uploads images to imgbb (free image hosting)
 * POST /api/upload with FormData containing "image" file
 * Returns { url: string } with the hosted image URL
 */

const IMGBB_API_KEY = "f03fa38faabf60dbde37c64b4bc29dc3"; // free tier key

export async function POST(request: NextRequest) {
  try {
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

    // Upload to imgbb
    const imgbbForm = new FormData();
    imgbbForm.append("key", IMGBB_API_KEY);
    imgbbForm.append("image", base64);
    imgbbForm.append("name", `shyft_${Date.now()}`);

    const response = await fetch("https://api.imgbb.com/1/upload", {
      method: "POST",
      body: imgbbForm,
    });

    const data = await response.json();

    if (!data.success) {
      console.error("imgbb error:", data);
      return NextResponse.json({ error: "Upload failed" }, { status: 500 });
    }

    return NextResponse.json({
      url: data.data.display_url,
      thumb: data.data.thumb?.url || data.data.display_url,
      delete_url: data.data.delete_url,
    });
  } catch (err: any) {
    console.error("Upload error:", err);
    return NextResponse.json({ error: err.message || "Upload failed" }, { status: 500 });
  }
}
