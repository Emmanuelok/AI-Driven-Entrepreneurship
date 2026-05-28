import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ──────────────────────────────────────────────────────────────────────────────
// AI Proxy for student-built artifacts.
//
// Student builds inside Sankofa's Build Studio can POST to /api/build/proxy
// to call Claude without ever seeing the API key. We rate-limit per IP
// to stop a stuck loop from burning the team's budget overnight.
//
// Two modes:
//   - default: returns JSON { content: string }
//   - ?stream=1: returns text/plain streaming chunks
// ──────────────────────────────────────────────────────────────────────────────

type Msg = { role: "user" | "assistant"; content: string };
type Body = {
  model?: string; // ignored — we always use one safe model
  messages: Msg[];
  system?: string;
  max_tokens?: number;
};

// Simple in-memory rate limit (per-process). Good enough for v1 — replace
// with Upstash Redis when scaling.
const buckets = new Map<string, { count: number; resetAt: number }>();
const LIMIT = 30; // requests
const WINDOW_MS = 60_000; // per minute

function rateLimit(ip: string): { ok: boolean; remaining: number; resetIn: number } {
  const now = Date.now();
  const b = buckets.get(ip);
  if (!b || b.resetAt < now) {
    buckets.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return { ok: true, remaining: LIMIT - 1, resetIn: WINDOW_MS };
  }
  if (b.count >= LIMIT) {
    return { ok: false, remaining: 0, resetIn: b.resetAt - now };
  }
  b.count++;
  return { ok: true, remaining: LIMIT - b.count, resetIn: b.resetAt - now };
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  const wantStream = url.searchParams.get("stream") === "1";
  const ip = (req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "anon").split(",")[0].trim();

  const rl = rateLimit(ip);
  if (!rl.ok) {
    return Response.json(
      { error: "rate_limited", message: `Slow down — limit is ${LIMIT} requests/min. Try again in ${Math.ceil(rl.resetIn / 1000)}s.` },
      { status: 429, headers: { "X-RateLimit-Reset": String(Math.ceil(rl.resetIn / 1000)) } },
    );
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return Response.json({ error: "messages required" }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    const demo = "[demo proxy] Wire ANTHROPIC_API_KEY on the server to enable real AI replies. For now, your build is talking to a stub — you can see the message flow, but the response is canned. Last user message: " + body.messages[body.messages.length - 1].content.slice(0, 140);
    if (wantStream) {
      const encoder = new TextEncoder();
      return new Response(new ReadableStream({
        async start(controller) {
          for (const t of demo.split(/(\s+)/)) {
            controller.enqueue(encoder.encode(t));
            await new Promise((r) => setTimeout(r, 8));
          }
          controller.close();
        },
      }), { headers: { "Content-Type": "text/plain; charset=utf-8", "x-mode": "demo" } });
    }
    return Response.json({ content: demo, mode: "demo" });
  }

  const client = new Anthropic({ apiKey });
  const safeMax = Math.min(2000, body.max_tokens ?? 800);
  const messages = body.messages.slice(-12); // cap context for safety

  if (wantStream) {
    const stream = await client.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: safeMax,
      system: body.system ?? "You are a helpful AI inside a student-built application on Sankofa Studio.",
      messages,
    });
    const encoder = new TextEncoder();
    return new Response(new ReadableStream({
      async start(controller) {
        try {
          for await (const evt of stream) {
            if (evt.type === "content_block_delta" && evt.delta.type === "text_delta") {
              controller.enqueue(encoder.encode(evt.delta.text));
            }
          }
        } catch (e) {
          controller.enqueue(encoder.encode(`\n[error: ${(e as Error).message}]`));
        } finally {
          controller.close();
        }
      },
    }), { headers: { "Content-Type": "text/plain; charset=utf-8", "X-RateLimit-Remaining": String(rl.remaining) } });
  }

  try {
    const res = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: safeMax,
      system: body.system ?? "You are a helpful AI inside a student-built application on Sankofa Studio.",
      messages,
    });
    const text = res.content.filter((c) => c.type === "text").map((c) => (c.type === "text" ? c.text : "")).join("");
    return Response.json({ content: text }, { headers: { "X-RateLimit-Remaining": String(rl.remaining) } });
  } catch (e) {
    return Response.json({ error: "upstream_failed", message: (e as Error).message }, { status: 502 });
  }
}

export async function GET() {
  return Response.json({
    name: "Sankofa Build Proxy",
    description: "POST { messages: [{role,content}], system?, max_tokens? } to call Claude through the studio without exposing keys. Add ?stream=1 for streaming.",
    rateLimit: `${LIMIT}/min per IP`,
  });
}
