import Anthropic from "@anthropic-ai/sdk";
import { aiUsageHeaders } from "@/lib/ai-headers";
import { rateLimit, rateLimited, clientIp } from "@/lib/rate-limit";
import { resolveAnthropicKey } from "@/lib/anthropic-key";
import { enforceQuotaForPlatform } from "@/lib/quota";
import { moderateOrBlock } from "@/lib/moderation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  ventureName: string;
  tagline: string;
  transcript: string;
  slides?: { title: string; body: string }[];
  targetSeconds: number;
  actualSeconds: number;
};

const SYSTEM = `You are an elite pitch coach who has prepped founders for YC Demo Day, TechCrunch Disrupt, and 500 Global.

You critique recorded pitch rehearsals across SIX dimensions, on a 0-10 scale:
  1. Hook        — does the opening grab? Does it state who/what/why-now in 20 seconds?
  2. Narrative   — does the arc flow problem → solution → traction → ask, without backtracking?
  3. Specificity — concrete numbers, named customers, real moments. Or hand-waving?
  4. Conviction  — do they sound like they know they're right, without arrogance?
  5. Clarity     — could a non-expert follow it? Jargon-density check.
  6. Ask         — is the ask specific (amount, terms, what it buys)?

For each dimension, return a score AND one specific note tied to evidence in the transcript.

Pacing: target 130-160 wpm for a clear pitch. Faster = swallowing words; slower = losing energy.

Rewrites: pick 2-3 of the WEAKEST verbatim lines from the transcript and offer a sharper version. Use real lines from the transcript — don't fabricate.

Top fix: ONE specific thing they should change before the next take. Surgical.

Output STRICT JSON only. No markdown fences. Shape:
{
  "overall": number,            // 0-10
  "oneLine": string,            // single-sentence verdict (max 25 words)
  "dimensions": [{ "id": string, "label": string, "score": number, "note": string }],
  "fillerCounts": [{ "word": string, "count": number }], // top fillers you noticed
  "pacing": { "wordsPerMin": number, "verdict": string },
  "rewrites": [{ "original": string, "better": string }],
  "topFix": string
}`;

export async function POST(req: Request) {
  // Heavy route (2200 max tokens) — strictest cap.
  const rl = rateLimit({ scope: "rehearse-critique", ipKey: clientIp(req), maxCalls: 4 });
  if (!rl.ok) return rateLimited(rl);

  const body = (await req.json()) as Body;
  const blocked = await moderateOrBlock(body.transcript, { skipLLM: true });
  if (blocked) return blocked;
  const { key: apiKey, source: keySource } = resolveAnthropicKey(req);
  const quotaBlocked = await enforceQuotaForPlatform(req, keySource);
  if (quotaBlocked) return quotaBlocked;
  if (!apiKey) return Response.json(fallback(body));

  const wordCount = body.transcript.trim().split(/\s+/).filter(Boolean).length;
  const wpm = body.actualSeconds > 0 ? Math.round((wordCount / body.actualSeconds) * 60) : 0;

  const deckCtx = body.slides && body.slides.length > 0
    ? `\nThe pitch deck has ${body.slides.length} slides:\n${body.slides.map((s, i) => `${i + 1}. ${s.title} — ${s.body.slice(0, 120)}`).join("\n")}`
    : "";

  const ctx = `Venture: ${body.ventureName} — ${body.tagline}
Target length: ${body.targetSeconds}s (${(body.targetSeconds / 60).toFixed(1)} min)
Actual length: ${body.actualSeconds}s (${(body.actualSeconds / 60).toFixed(1)} min)
Word count: ${wordCount} · ${wpm} wpm${deckCtx}

TRANSCRIPT:
${body.transcript}`;

  const client = new Anthropic({ apiKey });
  try {
    const res = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2200,
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: ctx + "\n\nCritique this rehearsal." }],
    });
    const text = res.content.filter((c) => c.type === "text").map((c) => (c.type === "text" ? c.text : "")).join("").trim();
    const cleaned = text.replace(/^```json\n?|\n?```$/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return Response.json(parsed, { headers: aiUsageHeaders(res) });
  } catch (e) {
    return Response.json({ error: (e as Error).message, ...fallback(body) }, { status: 502 });
  }
}

function fallback(b: Body) {
  const wc = b.transcript.trim().split(/\s+/).filter(Boolean).length;
  const wpm = b.actualSeconds > 0 ? Math.round((wc / b.actualSeconds) * 60) : 0;
  return {
    overall: 5,
    oneLine: "[demo] Set ANTHROPIC_API_KEY on the server for a real Claude critique.",
    dimensions: [
      { id: "hook", label: "Hook", score: 5, note: "Demo mode — no real grading." },
      { id: "narrative", label: "Narrative", score: 5, note: "Demo mode." },
      { id: "specificity", label: "Specificity", score: 5, note: "Demo mode." },
      { id: "conviction", label: "Conviction", score: 5, note: "Demo mode." },
      { id: "clarity", label: "Clarity", score: 5, note: "Demo mode." },
      { id: "ask", label: "Ask", score: 5, note: "Demo mode." },
    ],
    fillerCounts: [],
    pacing: { wordsPerMin: wpm, verdict: wpm > 160 ? "Slow down" : wpm < 110 ? "Pick up the pace" : "On target" },
    rewrites: [],
    topFix: "Wire ANTHROPIC_API_KEY then re-record to get real feedback.",
  };
}
