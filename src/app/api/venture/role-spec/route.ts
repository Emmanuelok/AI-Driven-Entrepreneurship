import Anthropic from "@anthropic-ai/sdk";
import { aiUsageHeaders } from "@/lib/ai-headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Drafts a role spec from venture context. Output is the founder-voice
// version that goes on the careers page + a candidate scorecard rubric.

type Body = {
  ventureName: string;
  tagline: string;
  region?: string;
  roleTitle: string;
  type: "full-time" | "part-time" | "contractor" | "advisor";
  equityPct?: number;
  compensationUsd?: number;
  canvas?: Record<string, string>;
  wedge?: { who?: string; pain?: string };
};

const SYSTEM = `You write role specs founders actually use, not corporate JD slop.

Output STRICT JSON only. No markdown fences. Shape:
{
  "description": string,
  "mustHaves": string[],
  "niceHaves": string[],
  "rubric": [{ "dimension": string, "weight": number, "what_to_probe": string }]
}

Rules:
- description: 120-220 words, founder voice. Open with the problem this person is hired to attack, NOT the company boilerplate. End with "what your first 90 days look like".
- mustHaves: 4-6. Each one a single specific capability or piece of evidence (e.g. "Has shipped 3+ React apps to production with ≥1k WAU"). NO "self-starter, team player" generic fluff.
- niceHaves: 2-4. Genuinely nice-to-have, not actually-required-in-disguise.
- rubric: 4-6 dimensions. Each gets weight 1-3 (3 = critical). what_to_probe is the question or behavior to look for in interview.

Bias: if the venture's wedge or region implies specific context (e.g. Northern Ghana agritech, mobile-money fintech), surface it as a must-have. Don't import Silicon Valley templates into African markets.`;

export async function POST(req: Request) {
  const body = (await req.json()) as Body;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return Response.json(fallback(body));

  const ctx = `Venture: ${body.ventureName} — ${body.tagline}
${body.region ? `Region: ${body.region}\n` : ""}Role: ${body.roleTitle} (${body.type})
${body.equityPct ? `Equity: ${body.equityPct}%\n` : ""}${body.compensationUsd ? `Comp: $${body.compensationUsd}/yr\n` : ""}${body.wedge?.who ? `Wedge: ${body.wedge.who}. Pain: ${body.wedge.pain ?? "n/a"}\n` : ""}${body.canvas ? Object.entries(body.canvas).filter(([, v]) => v?.trim()).map(([k, v]) => `${k}: ${v}`).join("\n") : ""}`;

  const client = new Anthropic({ apiKey });
  try {
    const res = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1800,
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: ctx + "\n\nDraft the spec." }],
    });
    const text = res.content.filter((c) => c.type === "text").map((c) => (c.type === "text" ? c.text : "")).join("").trim();
    const cleaned = text.replace(/^```json\n?|\n?```$/g, "").trim();
    return Response.json(JSON.parse(cleaned), { headers: aiUsageHeaders(res) });
  } catch (e) {
    return Response.json({ error: (e as Error).message, ...fallback(body) }, { status: 502 });
  }
}

function fallback(b: Body) {
  return {
    description: `[demo] Set ANTHROPIC_API_KEY for a live spec. This is a placeholder for the ${b.roleTitle} role at ${b.ventureName}.`,
    mustHaves: ["Set ANTHROPIC_API_KEY on the server"],
    niceHaves: ["Run the live AI for real output"],
    rubric: [
      { dimension: "Domain proximity", weight: 3, what_to_probe: "Have they been close to this customer or problem before?" },
      { dimension: "Shipping record", weight: 3, what_to_probe: "What did they ship in the last 12 months — solo, end-to-end?" },
      { dimension: "Ambition fit", weight: 2, what_to_probe: "Is the ambition aligned with the wedge — too big, too small, just right?" },
      { dimension: "Communication", weight: 2, what_to_probe: "Can they explain a hard idea simply, in writing, on the first try?" },
    ],
  };
}
