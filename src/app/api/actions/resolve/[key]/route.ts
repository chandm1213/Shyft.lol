import { NextRequest, NextResponse } from "next/server";

/**
 * /api/actions/resolve/[key] — Resolves a post page key (author-postId) to
 * the main Actions endpoint. This allows wallet extensions (Phantom, Backpack)
 * to discover the Action when a user shares a shyft.lol/post/... URL, by
 * checking actions.json which maps /post/* → /api/actions/resolve/*.
 */

const ACTION_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Content-Encoding, Accept-Encoding",
  "Content-Type": "application/json",
};

function parseKey(key: string): { author: string; postId: string } | null {
  const dashIdx = key.lastIndexOf("-");
  if (dashIdx === -1) return null;
  const author = key.slice(0, dashIdx);
  const postId = key.slice(dashIdx + 1);
  if (!author || !postId || isNaN(Number(postId))) return null;
  return { author, postId };
}

export async function OPTIONS() {
  return new NextResponse(null, { headers: ACTION_HEADERS });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const { key } = await params;
  const parsed = parseKey(key);
  if (!parsed) {
    return NextResponse.json(
      { error: { message: "Invalid post key format. Expected: author-postId" } },
      { status: 400, headers: ACTION_HEADERS }
    );
  }

  // Proxy to the main actions endpoint
  const url = new URL(request.url);
  const targetUrl = `${url.origin}/api/actions/post?author=${parsed.author}&postId=${parsed.postId}`;
  
  const res = await fetch(targetUrl, {
    headers: { "Accept": "application/json" },
  });
  
  const data = await res.json();
  return NextResponse.json(data, { status: res.status, headers: ACTION_HEADERS });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const { key } = await params;
  const parsed = parseKey(key);
  if (!parsed) {
    return NextResponse.json(
      { error: { message: "Invalid post key format" } },
      { status: 400, headers: ACTION_HEADERS }
    );
  }

  // Forward query params (action, amount, etc.) from the original request
  const url = new URL(request.url);
  const action = url.searchParams.get("action") || "tip";
  const amount = url.searchParams.get("amount") || "";
  
  const targetUrl = `${url.origin}/api/actions/post?author=${parsed.author}&postId=${parsed.postId}&action=${action}${amount ? `&amount=${amount}` : ""}`;
  
  const body = await request.text();
  const res = await fetch(targetUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  
  const data = await res.json();
  return NextResponse.json(data, { status: res.status, headers: ACTION_HEADERS });
}
