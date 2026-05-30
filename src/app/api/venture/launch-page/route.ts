import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { aiGuard } from "@/lib/ai-guard";
import { aiUsageHeaders } from "@/lib/ai-headers";
import { readSiteContext, siteSystemBlock } from "@/lib/site-brain";
import { parseBodyWithRaw } from "@/lib/parse-body";

export const runtime = "nodejs";

const Body = z.object({
  ventureName: z.string().min(1).max(200),
  tagline: z.string().max(400),
  canvas: z.record(z.string(), z.string().max(8000)).optional(),
  jtbd: z.object({
    when: z.string().max(2000),
    iWantTo: z.string().max(2000),
    soICan: z.string().max(2000),
    today: z.string().max(2000),
  }).optional(),
  wedge: z.object({
    who: z.string().max(2000),
    pain: z.string().max(2000),
    alternative: z.string().max(2000),
    insight: z.string().max(2000),
  }).optional(),
  region: z.string().max(200).optional(),
}).loose();
type Body = z.infer<typeof Body>;

const SYSTEM = `You write conversion-grade landing copy for African / developing-world founders.

You output STRICT JSON. No prose around it. No markdown fences. Shape:
{
  "headline": string,
  "subhead": string,
  "bullets": string[],
  "cta": string,
  "whatsappBlurb": string
}

Rules:
- Headline: 8 words max. Concrete. Customer outcome, not feature. NO buzzwords (revolutionize, leverage, ecosystem).
- Subhead: 1-2 sentences naming the customer and the outcome.
- Bullets: exactly 3. Concrete numbers + verbs. "30% higher prices for farmers in pilot" beats "fair pricing".
- CTA: 4 words max. Action verb. "Join the waiting list", "Get same-day quote".
- whatsappBlurb: under 280 chars. Greeting, what it is, who it's for, link placeholder "[link]". No emojis.`;

export async function POST(req: Request) {
  const guard = await aiGuard({ req, scope: "launch-page", maxCalls: 10 });
  if (!guard.ok) return guard.response;
  const parsed = await parseBodyWithRaw(req, Body);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const raw = parsed.raw;
  if (!guard.apiKey) return Response.json(fallback(body));

  const brain = siteSystemBlock(readSiteContext(raw));
  const ctx = [
    `Venture: ${body.ventureName} — ${body.tagline}`,
    body.region ? `Region: ${body.region}` : "",
    body.jtbd?.when ? `JTBD: When ${body.jtbd.when}, I want to ${body.jtbd.iWantTo}, so I can ${body.jtbd.soICan}. Today they ${body.jtbd.today}.` : "",
    body.wedge?.who ? `Wedge: ${body.wedge.who}. Pain: ${body.wedge.pain}. Today they use: ${body.wedge.alternative}. Insight: ${body.wedge.insight}` : "",
    ...Object.entries(body.canvas ?? {}).filter(([, v]) => v && v.trim()).map(([k, v]) => `${k}: ${v}`),
  ].filter(Boolean).join("\n");

  const client = new Anthropic({ apiKey: guard.apiKey });
  const res = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 900,
    system: [{ type: "text", text: brain + SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: `${ctx}\n\nDraft the launch one-pager.` }],
  });
  const text = res.content.filter((c) => c.type === "text").map((c) => (c.type === "text" ? c.text : "")).join("").trim();
  const cleaned = text.replace(/^```json\n?|\n?```$/g, "").trim();
  try { return Response.json(JSON.parse(cleaned), { headers: aiUsageHeaders(res) }); } catch { return Response.json(fallback(body)); }
}

function fallback(b: Body) {
  return {
    headline: b.tagline || `${b.ventureName} — coming soon`,
    subhead: "Set ANTHROPIC_API_KEY on the server for real AI-drafted launch copy.",
    bullets: ["Bullet 1", "Bullet 2", "Bullet 3"],
    cta: "Join the waiting list",
    whatsappBlurb: `Hey! I'm building ${b.ventureName}. ${b.tagline}. Early-access: [link]`,
  };
}
