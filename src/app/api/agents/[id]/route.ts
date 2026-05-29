import Anthropic from "@anthropic-ai/sdk";
import { getAgent } from "@/lib/agents";
import { readSiteContext, siteSystemBlock } from "@/lib/site-brain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const agent = getAgent(id);
  if (!agent) return Response.json({ error: "agent not found" }, { status: 404 });

  const raw = await req.json();
  const inputs = raw as Record<string, string>;
  const brain = siteSystemBlock(readSiteContext(raw));
  const apiKey = process.env.ANTHROPIC_API_KEY;

  const userPrompt = `Inputs:\n${Object.entries(inputs).map(([k, v]) => `- ${k}: ${v}`).join("\n")}\n\nProduce your output now.`;

  if (!apiKey) {
    return new Response(makeFallback(agent.id, inputs), {
      headers: { "Content-Type": "text/plain; charset=utf-8", "x-mode": "demo" },
    });
  }

  const client = new Anthropic({ apiKey });
  const stream = await client.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    system: [{ type: "text", text: brain + agent.systemPrompt, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userPrompt }],
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const evt of stream) {
          if (evt.type === "content_block_delta" && evt.delta.type === "text_delta") {
            controller.enqueue(encoder.encode(evt.delta.text));
          }
        }
      } catch (err) {
        controller.enqueue(encoder.encode(`\n\n[error: ${(err as Error).message}]`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, { headers: { "Content-Type": "text/plain; charset=utf-8", "x-mode": "live" } });
}

function makeFallback(agentId: string, inputs: Record<string, string>): ReadableStream<Uint8Array> {
  const reply = canned(agentId, inputs);
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      const tokens = reply.split(/(\s+)/);
      for (const t of tokens) {
        controller.enqueue(encoder.encode(t));
        await new Promise((r) => setTimeout(r, 8));
      }
      controller.close();
    },
  });
}

function canned(id: string, _inputs: Record<string, string>): string {
  const banner = `\n\n> 🔌 *Demo output — wire \`ANTHROPIC_API_KEY\` for a live Claude run.*`;

  const samples: Record<string, string> = {
    "interview-synthesizer": `## Interview synthesis

**Top unmet needs (ranked by frequency)**
1. Post-harvest loss visibility (mentioned by 14/20)
2. Cash-flow timing (12/20)
3. Buyer trust deficit on quality (9/20)

**Most cited workarounds**
- Selling at fire-sale discount the same evening (16/20)
- Drying tomatoes into puree (4/20)

**JTBD candidate statements**
- "When I see my crates start to spoil, I want a guaranteed buyer waiting, so I never have to discount at the end of the day."
- "When I sell to wholesalers, I want a verified quality grade, so I can charge premium for my best lots."

**Wedge experiments to run this week**
1. Pay-per-crate cold rental at one co-op for 7 days.
2. Pre-sell with a buyer LOI before the next harvest.
3. WhatsApp price-broadcast 2x/day from the Tamale market.

**Quotes that captured the pain**
- "I cried last Tuesday. Four crates rotted in my stall."
- "I have customers in Kumasi, but my tomatoes never make it there."
- "The bank won't lend to me because I keep no books."`,

    "financial-model": `## 12-Month Financial Model

| Month | Customers | MRR (USD) | COGS | Gross Margin |
|---|---|---|---|---|
| M1 | 2 | $100 | $40 | 60% |
| M3 | 8 | $400 | $160 | 60% |
| M6 | 22 | $1,100 | $440 | 60% |
| M9 | 47 | $2,350 | $940 | 60% |
| M12 | 84 | $4,200 | $1,680 | 60% |

**Unit economics**
- Blended CAC: $48 (cooperative-chairman intro = $6; market demo = $90)
- Payback period: 11 months
- Breakeven volume: 64 units (Month 11)

**Sensitivity — 3 assumptions that, if wrong by 30%, kill the business**
1. Churn at 4% monthly. At 12% monthly, never breakeven.
2. Cooperative-chairman intro CAC of $6. At $30, payback becomes 22 months.
3. Hardware BOM at $480/unit. At $620/unit, gross margin drops to 35%.`,

    "investor-email": `Subject: 80% post-harvest loss reduction at Yendi co-op — looking for $250k pre-seed

Kola,

11 customer interviews and 2 signed LOIs validate that tomato co-ops in Northern Ghana will pay $50/month + $2/crate for solar microcold storage. Our Yendi pilot dropped post-harvest loss from 37% to 7% over 6 weeks.

We're raising $250k pre-seed to deploy to 12 additional co-ops by Q4 and lock in the cooperative-chairman distribution moat before competitors notice.

I'd love your 15 minutes — specifically, on whether you'd lean toward subscription or per-crate pricing as the wedge.

— [Founder]
[Phone] · [LinkedIn]`,

    "okr-writer": `## Q3 OKRs

| Objective | Key Result | Target |
|---|---|---|
| **O1: Validate the wedge** | 20 customer interviews logged | 20 by EOQ |
|  | Signed LOIs from cooperative chairmen | 5 |
|  | Verbal-to-paper conversion rate | ≥ 60% |
| **O2: Ship the pay-per-crate MVP** | Functional prototype in 1 co-op | EOM 2 |
|  | Crate-tracking USSD shipped | EOM 3 |
|  | First $500 of revenue collected | EOQ |
| **O3: Lock in the distribution moat** | Co-op chairman intros made | 12 |
|  | Friday-prayer announcement runs | 8 |
|  | Cohort-level NPS | ≥ 65 |`,

    "brand-kit": `## Brand Kit — Sankofa Studio

**3 candidate names**
1. **Sankofa Studio** — Twi for "go back and fetch what is needed." Speaks to learning + roots.
2. **Akili** — Swahili for "intelligence / wisdom." Crisp, pan-African.
3. **Asili** — Swahili for "origin / foundation."

**2 tagline options**
- *From classroom to creator.*
- *Africa's learning + venture studio.*

**Color palette**
- Emerald \`#2cc295\` — primary, growth
- Amber \`#f4a949\` — energy, sun
- Rust \`#d96444\` — urgency, problem
- Off-black \`#0a0f0d\` — surface

**Brand voice — 3 do's**
- Specific names over generic categories ("Mama Adwoa," not "the smallholder")
- Show working, never just answers
- Match the learner's register (Pidgin if they Pidgin)

**3 don'ts**
- No corporate-deck-speak ("synergize," "leverage")
- No outsider-gaze "developing world" pity language
- Don't use English when a local-language phrase lands harder`,
  };

  return (samples[id] ?? `# Output\n\nThis is a demo response from the agent. Wire \`ANTHROPIC_API_KEY\` for real output.`) + banner;
}
