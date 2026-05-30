import Anthropic from "@anthropic-ai/sdk";
import { nanoid } from "nanoid";
import { z } from "zod";
import { readSiteContext, siteSystemBlock } from "@/lib/site-brain";
import { parseBodyWithRaw } from "@/lib/parse-body";

export const runtime = "nodejs";

const Body = z.object({
  name: z.string().max(120),
  field: z.string().max(200),
  level: z.number().int().min(0).max(1000),
  streak: z.number().int().min(0).max(10_000),
  activeVenture: z.string().max(400).nullable().optional(),
  dueCards: z.number().int().min(0).max(100_000),
  activeGoals: z.array(z.string().max(400)).max(50),
  recentActivity: z.array(z.string().max(400)).max(50),
  memoryFacts: z.array(z.string().max(2000)).max(50),
}).loose();
type Body = z.infer<typeof Body>;

export async function POST(req: Request) {
  const parsed = await parseBodyWithRaw(req, Body);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const raw = parsed.raw;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return Response.json(fallback(body));

  const brain = siteSystemBlock(readSiteContext(raw));

  const client = new Anthropic({ apiKey });
  const res = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 800,
    system: [{ type: "text", text: `${brain}You generate the most useful 30-second daily briefing a founder-in-training could read. Honest, specific, warm. Tied to what you know about them. JSON only.`, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: `Generate a JSON daily briefing for:

NAME: ${body.name}
FIELD: ${body.field}
LEVEL: ${body.level} · STREAK: ${body.streak}d
ACTIVE VENTURE: ${body.activeVenture ?? "(none yet)"}
DUE FLASHCARDS: ${body.dueCards}
ACTIVE GOALS: ${body.activeGoals.join("; ") || "(none)"}
RECENT ACTIVITY: ${body.recentActivity.join(" / ") || "(none)"}
WHAT I REMEMBER ABOUT THEM:
${body.memoryFacts.map((f) => `- ${f}`).join("\n") || "(nothing yet)"}

Output JSON: {"morning": "2-3 sentence personal briefing", "priorities": [{"text":"...","estMin":15},{"text":"...","estMin":20},{"text":"...","estMin":10}]}`,
      },
    ],
  });
  const text = res.content.filter((c) => c.type === "text").map((c) => (c.type === "text" ? c.text : "")).join("");
  const cleaned = text.replace(/^```json\n?|\n?```$/g, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    return Response.json({ ...parsed, priorities: (parsed.priorities ?? []).map((p: { text: string; estMin: number }) => ({ id: nanoid(6), done: false, ...p })) });
  } catch {
    return Response.json(fallback(body));
  }
}

function fallback(b: Body) {
  const greet = `Good ${new Date().getHours() < 12 ? "morning" : "afternoon"}, ${b.name.split(" ")[0]}.`;
  const venturePart = b.activeVenture ? ` Your venture (${b.activeVenture}) is your highest-leverage focus this week.` : ` You don't have a venture yet — picking one from the Atlas is your highest-leverage move.`;
  const cardsPart = b.dueCards > 0 ? ` ${b.dueCards} flashcards are due — clear them in under 8 minutes to protect your ${b.streak}-day streak.` : ` Your streak is alive — you haven't missed a day in ${b.streak} days.`;
  return {
    morning: `${greet}${venturePart}${cardsPart}`,
    priorities: [
      { id: nanoid(6), text: b.dueCards > 0 ? `Clear ${b.dueCards} flashcards (Daily Review)` : "30 minutes on a learning track", estMin: 10, done: false },
      { id: nanoid(6), text: b.activeVenture ? `One concrete advance on ${b.activeVenture}` : "Pick a problem from the Atlas", estMin: 25, done: false },
      { id: nanoid(6), text: "End-of-day reflection in your Notebook", estMin: 8, done: false },
    ],
  };
}
