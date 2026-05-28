import Anthropic from "@anthropic-ai/sdk";
import { aiUsageHeaders } from "@/lib/ai-headers";
import { rateLimit, rateLimited, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

type Body = {
  ventureName: string;
  month: string;
  metrics: { mrr: number; customers: number; revenue: number };
  fundingRaised: number;
  interviews: number;
  mvpDone: number;
  mvpTotal: number;
  economics?: { burnMonthlyUsd?: number; cashOnHandUsd?: number; churnMonthlyPct?: number };
};

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
  const rl = rateLimit({ scope: "update-draft", ipKey: clientIp(req), maxCalls: 10 });
  if (!rl.ok) return rateLimited(rl);
  const body = (await req.json()) as Body;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return Response.json(fallback(body));

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

  const client = new Anthropic({ apiKey });
  const res = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1100,
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
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
