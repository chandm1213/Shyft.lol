import { ImageResponse } from "@vercel/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const user = searchParams.get("user") || "someone";
  const amount = searchParams.get("amount") || "0";
  const tips = searchParams.get("tips") || "1";

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200",
          height: "630",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#ffffff",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {/* Top accent bar */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "6px",
            background: "linear-gradient(90deg, #10B981, #059669, #047857)",
            display: "flex",
          }}
        />

        {/* Emoji */}
        <div style={{ fontSize: "72px", marginBottom: "16px", display: "flex" }}>💸</div>

        {/* Username */}
        <div
          style={{
            fontSize: "28px",
            color: "#64748B",
            marginBottom: "12px",
            display: "flex",
          }}
        >
          @{user} earned
        </div>

        {/* SOL amount — big and bold */}
        <div
          style={{
            fontSize: "96px",
            fontWeight: 800,
            color: "#0F172A",
            lineHeight: 1,
            marginBottom: "12px",
            display: "flex",
            alignItems: "baseline",
            gap: "12px",
          }}
        >
          {amount}
          <span style={{ fontSize: "48px", color: "#10B981", fontWeight: 700 }}>
            SOL
          </span>
        </div>

        {/* Tip count */}
        <div
          style={{
            fontSize: "24px",
            color: "#94A3B8",
            marginBottom: "40px",
            display: "flex",
          }}
        >
          from {tips} {Number(tips) === 1 ? "tip" : "tips"} on a post
        </div>

        {/* Branding */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
          }}
        >
          <div
            style={{
              fontSize: "22px",
              fontWeight: 700,
              color: "#2563EB",
              display: "flex",
            }}
          >
            shyft.lol
          </div>
          <div
            style={{
              fontSize: "18px",
              color: "#CBD5E1",
              display: "flex",
            }}
          >
            •
          </div>
          <div
            style={{
              fontSize: "18px",
              color: "#94A3B8",
              display: "flex",
            }}
          >
            On-Chain Social on Solana
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
