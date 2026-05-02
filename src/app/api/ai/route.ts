import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const { messages } = await req.json();

  const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
  const MODEL = process.env.OLLAMA_MODEL || "qwen2.5:7b";

  const systemPrompt = `You are Shyft AI — a helpful assistant built into Shyft, an on-chain social network on the Solana blockchain.

Key facts about Shyft:
- Posts, profiles, reactions, follows, and communities are stored on Solana mainnet via an Anchor smart contract
- All transactions are gasless — Shyft sponsors all SOL fees for users
- Direct messages are end-to-end encrypted using NaCl (X25519 + XSalsa20-Poly1305)
- Users can launch creator tokens via the Bags.fm protocol
- The Shyft program ID is EEnouVLAoQGMEbrypEhP3Ct5RgCViCWG4n1nCZNwMxjQ
- Website: shyft.lol

You are knowledgeable about Solana, crypto, DeFi, NFTs, and web3 in general.
Be concise, helpful, and friendly. Keep responses focused and not too long.`;

  const ollamaMessages = [
    { role: "system", content: systemPrompt },
    ...messages,
  ];

  const ollamaRes = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: ollamaMessages,
      stream: true,
    }),
  });

  if (!ollamaRes.ok || !ollamaRes.body) {
    return new Response(JSON.stringify({ error: "Ollama unavailable" }), { status: 502 });
  }

  // Stream the response back as text/event-stream
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const reader = ollamaRes.body!.getReader();
      const decoder = new TextDecoder();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n").filter(Boolean);
          for (const line of lines) {
            try {
              const json = JSON.parse(line);
              if (json.message?.content) {
                controller.enqueue(encoder.encode(json.message.content));
              }
              if (json.done) {
                controller.close();
                return;
              }
            } catch {}
          }
        }
      } catch (e) {
        controller.error(e);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}
