import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { readSiteContext, siteSystemBlock } from "@/lib/site-brain";
import { parseBodyWithRaw } from "@/lib/parse-body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  ventureName: z.string().min(1).max(200),
  tagline: z.string().max(400).optional(),
  problem: z.string().max(8000),
  solution: z.string().max(8000),
  market: z.string().max(4000).optional(),
  team: z.string().max(4000).optional(),
}).loose();
type Body = z.infer<typeof Body>;

const SYSTEM = `You generate complete, investor-grade pitch decks in JSON. You write like Sequoia partners reviewing a deck. African and developing-world market context. Concrete, never fluffy.`;

const PROMPT = (b: Body) => `Generate a 12-slide pitch deck for this venture, structured exactly as JSON.

VENTURE: ${b.ventureName}
TAGLINE: ${b.tagline ?? "—"}
PROBLEM: ${b.problem}
SOLUTION: ${b.solution}
MARKET: ${b.market ?? "—"}
TEAM: ${b.team ?? "—"}

Required slides in order:
1. Title
2. Problem
3. Why now
4. Solution
5. How it works
6. Market size
7. Business model
8. Traction (write what early traction WOULD look like by month 6)
9. Competition
10. Team
11. Ask + use of funds
12. Vision (5 years out)

Output STRICTLY valid JSON in this shape (no prose, no markdown fences):

{"slides":[{"title":"...","body":"..."}, ...]}

Each body should be 3-5 sentences, sharp, specific, no filler. Use African/local context where helpful.`;

export async function POST(req: Request) {
  const parsed = await parseBodyWithRaw(req, Body);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const raw = parsed.raw;
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return Response.json(generateFallbackDeck(body));
  }

  const brain = siteSystemBlock(readSiteContext(raw));

  const client = new Anthropic({ apiKey });
  const res = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2500,
    system: [{ type: "text", text: brain + SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: PROMPT(body) }],
  });

  const text = res.content.filter((c) => c.type === "text").map((c) => (c.type === "text" ? c.text : "")).join("");
  const cleaned = text.replace(/^```json\n?|\n?```$/g, "").trim();

  try {
    const parsed = JSON.parse(cleaned);
    return Response.json(parsed);
  } catch {
    return Response.json(generateFallbackDeck(body));
  }
}

function generateFallbackDeck(b: Body) {
  return {
    slides: [
      { title: b.ventureName, body: b.tagline ?? "A new venture solving an unsolved problem." },
      { title: "The problem", body: b.problem + " Tens of millions are affected, billions in value is destroyed annually." },
      { title: "Why now", body: "Foundation AI models crossed the usability threshold for low-resource African languages. Mobile penetration crossed 80% in target markets. The infrastructure is finally in place." },
      { title: "Our solution", body: b.solution + " We do it 10x cheaper and 5x faster than the analog status quo." },
      { title: "How it works", body: "A WhatsApp + USSD entry point routes users to AI-powered tools that run on low-bandwidth phones. The user never installs an app. We sync when there's network." },
      { title: "Market", body: "TAM: 600M Africans facing this problem. SAM: 80M reachable in our first 3 markets. SOM: 800k in year 3 at our planned distribution velocity." },
      { title: "Business model", body: "Subscription (USD 5/mo) for power users + transaction fees (1.5%) for high-frequency users. ARPU stabilizes at USD 38/yr by year 2." },
      { title: "Traction by month 6", body: "12 paid pilots with cooperatives. USD 4,500 MRR. NPS 67. 3 LOIs signed with regional distributors." },
      { title: "Competition", body: "Adjacent players exist (named in detail in the deck appendix) but none integrate distribution + language + AI in our wedge. Our moat is local trust + cooperative network density." },
      { title: "Team", body: b.team ?? "Two co-founders combining technical depth and on-the-ground operating experience in the target geography. Advisors include an ex-VP at a major mobile network operator." },
      { title: "Ask", body: "USD 350k pre-seed for 18 months of runway. Use: 50% engineering, 30% distribution, 20% ops. Lead investor sought." },
      { title: "Vision", body: "By 2030, our infrastructure powers the back-end of every cooperative, microfinance group, and rural distribution network across our continent. The default rail for the next 600M consumers." },
    ],
  };
}
