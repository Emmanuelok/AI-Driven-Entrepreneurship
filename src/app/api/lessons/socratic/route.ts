import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { readSiteContext, siteSystemBlock } from "@/lib/site-brain";
import { parseBodyWithRaw } from "@/lib/parse-body";

export const runtime = "nodejs";

const Body = z.object({
  question: z.string().min(1).max(4000),
  expectedConcepts: z.array(z.string().max(400)).max(20),
  studentAnswer: z.string().max(8000),
  genomeVoice: z.string().max(2000),
  firstName: z.string().max(80),
}).loose();
type Body = z.infer<typeof Body>;

export async function POST(req: Request) {
  const parsed = await parseBodyWithRaw(req, Body);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return Response.json(fallback(body));

  const brain = siteSystemBlock(readSiteContext(parsed.raw));

  const client = new Anthropic({ apiKey });
  const res = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 800,
    system: [
      {
        type: "text",
        text: `${brain}You are Sage, a Socratic tutor reviewing a student's answer. Never simply give the answer. Acknowledge what's right, point at what's missing or off, and ask one follow-up that nudges them toward the next concept. ${body.genomeVoice}

Output JSON:
{
  "verdict": "strong" | "partial" | "off",
  "encouragement": "short sentence praising what worked, by first name",
  "gap": "one specific thing they missed or got wrong (or empty if 'strong')",
  "nextNudge": "one Socratic question that moves them forward",
  "masteryDelta": 0.0 to 0.4 (how much credit toward concept mastery)
}`,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: `Question we asked ${body.firstName}: "${body.question}"

Concepts a good answer should touch on: ${body.expectedConcepts.join(", ")}

${body.firstName}'s answer: "${body.studentAnswer}"

Output the JSON.`,
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
  const hits = b.expectedConcepts.filter((c) => b.studentAnswer.toLowerCase().includes(c.toLowerCase().split(" ")[0])).length;
  const ratio = hits / Math.max(1, b.expectedConcepts.length);
  const verdict = ratio >= 0.5 ? "strong" : ratio >= 0.2 ? "partial" : "off";
  return {
    verdict,
    encouragement: verdict === "strong"
      ? `Good thinking, ${b.firstName} — you're touching on the heart of it.`
      : verdict === "partial"
      ? `You're partway there, ${b.firstName}.`
      : `Stay with it, ${b.firstName}. Let's slow down.`,
    gap: verdict === "strong" ? "" : `You haven't yet named: ${b.expectedConcepts.filter((c) => !b.studentAnswer.toLowerCase().includes(c.toLowerCase().split(" ")[0])).slice(0, 2).join(", ") || "the key move"}`,
    nextNudge: verdict === "strong"
      ? "Can you say in one sentence why this works in general — not just in this case?"
      : "Try again — what's the very first move you'd make if you couldn't use a formula at all?",
    masteryDelta: ratio * 0.3,
  };
}
