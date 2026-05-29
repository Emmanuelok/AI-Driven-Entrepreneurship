import Anthropic from "@anthropic-ai/sdk";
import { readSiteContext, siteSystemBlock } from "@/lib/site-brain";

export const runtime = "nodejs";

type Body = { prompt: string; stickies: string[] };

export async function POST(req: Request) {
  const raw = await req.json();
  const body = raw as Body;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return Response.json({ summary: fallback(body) });

  const brain = siteSystemBlock(readSiteContext(raw));
  const client = new Anthropic({ apiKey });
  const res = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1200,
    system: [{ type: "text", text: `${brain}You synthesize brainstorm boards into clear thinking. Output prose with markdown.`, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: `The question was: "${body.prompt}".

The board has these stickies:
${body.stickies.map((s, i) => `${i + 1}. ${s}`).join("\n")}

Produce a 5-section synthesis:
1. **Clusters** — group the stickies into 3-4 themes, listing which stickies belong to each.
2. **The strongest signal** — which 2 stickies, taken together, point to the biggest opportunity?
3. **The unspoken assumption** — what is the board NOT addressing that it should?
4. **The single highest-leverage action this week** — concrete, 48-hour scope.
5. **One question to take to a real customer tomorrow** — verbatim.`,
      },
    ],
  });
  const text = res.content.filter((c) => c.type === "text").map((c) => (c.type === "text" ? c.text : "")).join("");
  return Response.json({ summary: text });
}

function fallback(b: Body) {
  return `## Brainstorm synthesis

**Clusters identified (${b.stickies.length} stickies)**

- *Distribution & trust* — cooperative chairmen, religious networks, market-day demos
- *Hardware risk* — failure liability, maintenance gap, climate exposure
- *Economic alignment* — pay-per-crate, subscription, take-rate side
- *Validation* — customer discovery, willingness-to-pay, signed letters

**The strongest signal**

Two stickies point to the same opportunity: *cooperative chairmen as multipliers* + *Friday prayer announcement channel*. Distribution-through-trusted-leaders is the actual moat.

**The unspoken assumption**

The board assumes the cooperatives can pay. None of the stickies test whether the value flows back to the smallholder fast enough to justify the membership.

**Highest-leverage action this week**

Get two signed LOIs from cooperative chairmen pegged to specific monthly amounts. Not verbal — paper. That converts your validation rate from soft to hard.

**Customer question for tomorrow**

"Walk me through the last week you lost crates. What did you do that night?"

⚠️ Demo synthesis — wire \`ANTHROPIC_API_KEY\` for a real cluster analysis.`;
}
