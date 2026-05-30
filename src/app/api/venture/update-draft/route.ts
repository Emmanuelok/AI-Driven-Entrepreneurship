import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { aiGuard } from "@/lib/ai-guard";
import { aiUsageHeaders } from "@/lib/ai-headers";
import { readSiteContext, siteSystemBlock } from "@/lib/site-brain";
import { parseBodyWithRaw } from "@/lib/parse-body";

export const runtime = "nodejs";

const Body = z.object({
  ventureName: z.string().min(1).max(200),
  month: z.string().max(40),
  metrics: z.object({
    mrr: z.number().finite().min(0).max(1e12),
    customers: z.number().int().min(0).max(1e9),
    revenue: z.number().finite().min(0).max(1e12),
  }),
  fundingRaised: z.number().finite().min(0).max(1e12),
  interviews: z.number().int().min(0).max(1e6),
  mvpDone: z.number().int().min(0).max(1e6),
  mvpTotal: z.number().int().min(0).max(1e6),
  economics: z.object({
    burnMonthlyUsd: z.number().finite().min(0).max(1e10).optional(),
    cashOnHandUsd: z.number().finite().min(0).max(1e12).optional(),
    churnMonthlyPct: z.number().finite().min(0).max(100).optional(),
  }).optional(),
}).loose();
type Body = z.infer<typeof Body>;

const SYSTEM = `You draft monthly investor updates in the Aaron Harris / YC Partner cadence.

Output STRICT JSON. No prose around it. Shape:
{ "highlights": string, "lowlights": string, "asks": string, "metrics": string }

Rules:
- Highlights: 2-4 bullet points (use "- " prefix). Real progress, not vanity.
- Lowlights: 1-3 bullets. Be honest. Investors fund founders who tell the truth.
- Asks: 1-3 specific asks. "Intros to logistics ops in West Africa" beats "advice".
- Metrics: one line per metric (MRR, customers, runway). Show MoM change in parens if computable.
- Tone: direct, founder-voice. NO buzzwords. NO "we're crushing it". NO emojis (the UI adds them).`;

export async function POST(req: Request) {
  const guard = await aiGuard({ req, scope: "update-draft", maxCalls: 10 });
  if (!guard.ok) return guard.response;
  const parsed = await parseBodyWithRaw(req, Body);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const raw = parsed.raw;
  if (!guard.apiKey) return Response.json(fallback(body));

  const brain = siteSystemBlock(readSiteContext(raw));
  const runway = (body.economics?.burnMonthlyUsd ?? 0) > 0 && (body.economics?.cashOnHandUsd ?? 0) > 0
    ? `${((body.economics!.cashOnHandUsd ?? 0) / (body.economics!.burnMonthlyUsd ?? 1)).toFixed(1)} months`
    : "not modeled";

  const ctx = `Venture: ${body.ventureName}
Month: ${body.month}
MRR: $${body.metrics.mrr.toLocaleString()}
Paying customers: ${body.metrics.customers}
Lifetime revenue: $${body.metrics.revenue.toLocaleString()}
Funding raised/pipelined: $${body.fundingRaised.toLocaleString()}
Discovery interviews: ${body.interviews}
MVP tasks shipped: ${body.mvpDone}/${body.mvpTotal}
Monthly burn: $${(body.economics?.burnMonthlyUsd ?? 0).toLocaleString()}
Cash on hand: $${(body.economics?.cashOnHandUsd ?? 0).toLocaleString()}
Runway: ${runway}
Monthly churn: ${body.economics?.churnMonthlyPct ?? "?"}%`;

  const client = new Anthropic({ apiKey: guard.apiKey });
  const res = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1100,
    system: [{ type: "text", text: brain + SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: ctx + "\n\nDraft the monthly investor update." }],
  });
  const text = res.content.filter((c) => c.type === "text").map((c) => (c.type === "text" ? c.text : "")).join("").trim();
  const cleaned = text.replace(/^```json\n?|\n?```$/g, "").trim();
  try { return Response.json(JSON.parse(cleaned), { headers: aiUsageHeaders(res) }); } catch { return Response.json(fallback(body)); }
}

function fallback(b: Body) {
  return {
    highlights: `- ${b.mvpDone}/${b.mvpTotal} MVP tasks shipped\n- ${b.interviews} customer interviews logged`,
    lowlights: "- Set ANTHROPIC_API_KEY on the server for real AI-drafted updates",
    asks: "- Intros to early adopters in our target segment",
    metrics: `MRR: $${b.metrics.mrr.toLocaleString()} · Customers: ${b.metrics.customers} · Raised: $${b.fundingRaised.toLocaleString()}`,
  };
}
