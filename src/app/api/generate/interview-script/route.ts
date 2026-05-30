import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { parseBodyWithRaw } from "@/lib/parse-body";
import { readSiteContext, siteSystemBlock } from "@/lib/site-brain";

export const runtime = "nodejs";

const Body = z.object({
  problem: z.string().max(8000),
  persona: z.string().max(4000),
  ventureName: z.string().max(200).optional(),
}).loose();
type Body = z.infer<typeof Body>;

const SYSTEM = `You generate Bob Moesta-style customer-discovery interview scripts. The questions never lead, never pitch, never accept hypotheticals — they extract specific past behavior. Pure JSON output.`;

export async function POST(req: Request) {
  const parsed = await parseBodyWithRaw(req, Body);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const raw = parsed.raw;
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return Response.json(fallback(body));
  }

  const brain = siteSystemBlock(readSiteContext(raw));

  const client = new Anthropic({ apiKey });
  const res = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1500,
    system: [{ type: "text", text: brain + SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: `Generate a 12-question customer-discovery interview script for this scenario.

PROBLEM: ${body.problem}
TARGET PERSONA: ${body.persona}
${body.ventureName ? `WORKING NAME: ${body.ventureName}` : ""}

Rules:
- No leading questions. No "would you" hypotheticals.
- All questions extract concrete past behavior or specific recent events.
- Order: opening rapport → context → past behavior → existing workarounds → moments of pain → unfulfilled wishes → close.

Output JSON: {"questions":[{"category":"...","q":"..."}, ...]} (12 items)`,
      },
    ],
  });

  const text = res.content.filter((c) => c.type === "text").map((c) => (c.type === "text" ? c.text : "")).join("");
  const cleaned = text.replace(/^```json\n?|\n?```$/g, "").trim();
  try {
    return Response.json(JSON.parse(cleaned));
  } catch {
    return Response.json(fallback(body));
  }
}

function fallback(b: Body) {
  return {
    questions: [
      { category: "Opening", q: `Thanks for chatting. Tell me a little about your day-to-day work as ${b.persona.toLowerCase()}.` },
      { category: "Context", q: "Walk me through what you did yesterday — start to finish." },
      { category: "Context", q: "What's the busiest day of the week for you, and why?" },
      { category: "Past behavior", q: `Tell me about the last time you experienced ${b.problem.toLowerCase().split(" ").slice(0, 6).join(" ")}.` },
      { category: "Past behavior", q: "How often does that happen — once a week? Once a month?" },
      { category: "Workarounds", q: "When that happens, what do you do first? What do you do next?" },
      { category: "Workarounds", q: "Have you ever tried [adjacent solution they would know about]? What happened?" },
      { category: "Pain moments", q: "When was the last time it cost you real money? How much?" },
      { category: "Pain moments", q: "Who else does it affect when it happens to you?" },
      { category: "Wishes", q: "If you could change one thing about this whole situation, what would it be?" },
      { category: "Wishes", q: "Who in your life is best at handling this? What do they do differently?" },
      { category: "Close", q: "Is there anything I should have asked but didn't? Who else like you should I talk to?" },
    ],
  };
}
