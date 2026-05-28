import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";

type Body = {
  block: string;
  ventureName: string;
  tagline: string;
  region?: string;
  currentCanvas: Record<string, string>;
  jtbd?: { when: string; iWantTo: string; soICan: string; today: string };
  wedge?: { who: string; pain: string; alternative: string; insight: string };
};

const SYSTEM = `You help African / developing-world founders sharpen one block of their Lean Canvas at a time.

You are NOT a generic chatbot. You are a strategist who has read Ash Maurya, Clay Christensen, Geoffrey Moore, and Bob Moesta — and shipped real companies in Ghana, Kenya, Nigeria, Senegal, India.

Rules:
- Output ONLY the block content. No headings, no labels, no "Here's a draft:", no markdown fences.
- 60-180 words, dense, specific, opinionated.
- Use the founder's existing inputs (other blocks, JTBD, wedge) to ground your answer.
- Reference the region's reality (mobile money, WhatsApp distribution, USSD, last-mile, etc.) only if it actually fits.
- If a block has no signal yet (founder hasn't filled adjacent blocks), state your best guess and tag it [hypothesis].`;

const BLOCK_PROMPTS: Record<string, string> = {
  Problem: "List the top 3 customer problems, ranked by pain. For each: a) who feels it (specific), b) frequency (daily/weekly/monthly), c) cost of the status quo (time/money/risk). Skip problems that have a 'good enough' workaround.",
  Customer: "Define the early adopter persona with 5 unambiguous attributes (geography, role, asset ownership, daily routine, current alternative). Then name the segment you're explicitly NOT serving in v1.",
  "Value prop": "Write ONE sentence: 'We help [specific customer] [outcome] so they can [deeper benefit] — unlike [alternative] which [limitation].' Then 2 lines explaining why this matters now.",
  Solution: "Name the 3 minimum features. For each: which customer assumption does this feature test? If a feature doesn't test an assumption, cut it.",
  Channels: "Three concentric circles: how do you reach customer #1 (manual is fine), customer #100 (semi-scalable), customer #10,000 (a flywheel). Be honest about which one you don't have yet.",
  Revenue: "Pricing model + price point + frequency + payment rail (MoMo, Stripe, cash). Calculate: 1 customer pays $X/month. To hit $5k MRR you need Y customers. Is that achievable in 6 months given your channels?",
  Cost: "Variable cost per customer (everything that scales with use: BOM, payment fees, support, MoMo charges, fulfilment). Then gross margin per customer. <40% gross margin = back to drawing board.",
  Metrics: "Pick ONE leading indicator (something you can move this week) and ONE lagging indicator (the score). Explain why these two and not 'DAU' or 'sign-ups'.",
  "Unfair edge": "Brutally honest. Insight, IP, distribution, network effects, or domain access. 'We work hard' is NOT a moat. If you don't have one yet, name the asset you'll build over the next 12 months that becomes one.",
};

export async function POST(req: Request) {
  const body = (await req.json()) as Body;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ text: fallback(body) });
  }
  const blockHint = BLOCK_PROMPTS[body.block] ?? `Draft the '${body.block}' block of the Lean Canvas.`;

  const ctx = [
    `Venture: ${body.ventureName} — ${body.tagline}`,
    body.region ? `Region: ${body.region}` : "",
    body.jtbd?.when ? `JTBD: When ${body.jtbd.when}, I want to ${body.jtbd.iWantTo}, so I can ${body.jtbd.soICan}. Today they ${body.jtbd.today}.` : "",
    body.wedge?.who ? `Wedge: ${body.wedge.who} | Pain: ${body.wedge.pain} | Alternative: ${body.wedge.alternative} | Insight: ${body.wedge.insight}` : "",
    "Existing blocks the founder has filled:",
    ...Object.entries(body.currentCanvas).filter(([, v]) => v && v.trim()).map(([k, v]) => `- ${k}: ${v}`),
  ].filter(Boolean).join("\n");

  const client = new Anthropic({ apiKey });
  const res = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 700,
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: `${ctx}\n\nDraft this block: ${body.block}\nGuidance: ${blockHint}` }],
  });
  const text = res.content.filter((c) => c.type === "text").map((c) => (c.type === "text" ? c.text : "")).join("").trim();
  return Response.json({ text });
}

function fallback(b: Body) {
  return `[hypothesis] Draft for ${b.block}: based on what you've written about "${b.ventureName}", consider that the strongest version of this block is specific, falsifiable, and tied to your wedge. (Live AI assist requires ANTHROPIC_API_KEY on the server.)`;
}
