import Anthropic from "@anthropic-ai/sdk";
import { aiUsageHeaders } from "@/lib/ai-headers";
import { aiGuard } from "@/lib/ai-guard";
import { readSiteContext, siteSystemBlock } from "@/lib/site-brain";

export const runtime = "nodejs";

type Interview = { name: string; role: string; notes: string; verdict: string; willingnessToPay?: number };
type Body = { ventureName: string; tagline: string; interviews: Interview[]; canvas?: Record<string, string> };

const SYSTEM = `You synthesize raw customer-discovery interviews into a strategic picture.

You output STRICT JSON. No prose around it. No markdown fences. The shape is:
{
  "clusters": [{ "theme": string, "count": number, "evidence": string[] }],
  "personas": [{ "name": string, "role": string, "goals": string, "pains": string, "quote": string }],
  "willingness": { "median": number, "p25": number, "p75": number, "note": string },
  "verdict": "go" | "pivot" | "kill",
  "verdictReason": string,
  "nextThreeMoves": string[]
}

Rules:
- Clusters: pull verbatim phrases from interview notes as evidence. Max 4 clusters, ordered by count.
- Personas: 1-3, based on roles/contexts that recur. Goals and pains in customer voice. Quote = a real-sounding line distilled from notes.
- Willingness: USD figures only. If none provided, say { median: 0, p25: 0, p75: 0, note: "no WTP data captured yet" }.
- Verdict:
   "go" if ≥60% validated AND a clear primary cluster emerged AND median WTP ≥ a credible price.
   "pivot" if validated rate is mixed but a clear adjacent pain emerges from clusters.
   "kill" if rejections dominate or no pattern at all.
- Next three moves: surgical, dated by week. Tie each to evidence from the interviews.`;

export async function POST(req: Request) {
  // 8 syntheses/min/IP — protects against accidental loop-clicks burning
  // 2k+ output tokens each.
  const guard = await aiGuard({ req, scope: "synthesize", maxCalls: 8 });
  if (!guard.ok) return guard.response;

  const raw = await req.json();
  const body = raw as Body;
  if (!guard.apiKey) {
    return Response.json(fallback(body));
  }
  if (body.interviews.length < 3) {
    return Response.json({ error: "need_more_interviews", message: "Log at least 3 interviews before synthesizing." }, { status: 400 });
  }
  const brain = siteSystemBlock(readSiteContext(raw));
  const client = new Anthropic({ apiKey: guard.apiKey });
  const payload = body.interviews.map((iv, i) => `[#${i + 1}] ${iv.name} · ${iv.role} · verdict=${iv.verdict}${iv.willingnessToPay ? ` · WTP=$${iv.willingnessToPay}` : ""}\n${iv.notes}`).join("\n\n");
  const res = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2500,
    system: [{ type: "text", text: brain + SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: `Venture: ${body.ventureName} — ${body.tagline}\n\nInterview log (${body.interviews.length}):\n\n${payload}\n\nSynthesize.` }],
  });
  const text = res.content.filter((c) => c.type === "text").map((c) => (c.type === "text" ? c.text : "")).join("").trim();
  const cleaned = text.replace(/^```json\n?|\n?```$/g, "").trim();
  try {
    return Response.json(JSON.parse(cleaned), { headers: aiUsageHeaders(res) });
  } catch {
    return Response.json(fallback(body));
  }
}

function fallback(b: Body): unknown {
  const wtps = b.interviews.map((i) => i.willingnessToPay).filter((n): n is number => typeof n === "number").sort((a, b) => a - b);
  const median = wtps[Math.floor(wtps.length / 2)] ?? 0;
  return {
    clusters: [
      { theme: "[demo] AI unavailable — clusters require ANTHROPIC_API_KEY.", count: b.interviews.length, evidence: b.interviews.slice(0, 3).map((i) => i.notes.slice(0, 80)) },
    ],
    personas: [{ name: "Primary user", role: b.interviews[0]?.role ?? "TBD", goals: "Set ANTHROPIC_API_KEY for real synthesis.", pains: "—", quote: "—" }],
    willingness: { median, p25: wtps[0] ?? 0, p75: wtps[wtps.length - 1] ?? 0, note: "Demo data" },
    verdict: "pivot",
    verdictReason: "Insufficient signal in demo mode.",
    nextThreeMoves: ["Set ANTHROPIC_API_KEY on the server.", "Log 5 more interviews.", "Re-synthesize."],
  };
}
