import Anthropic from "@anthropic-ai/sdk";
import { aiUsageHeaders } from "@/lib/ai-headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Claude-as-judge. Given an input, the agent's output, and a rubric,
// returns a structured pass/fail + score + reasoning.

type Body = {
  input: string;
  output: string;
  rubric: string;
  mustInclude?: string[];
};

const SYSTEM = `You are a rigorous AI evaluation judge.

Given an AI agent's output, the original user input, and a rubric, you grade
the output on three things:
  1) Does it satisfy the rubric, in full?
  2) Score 0-10, where 7+ is "shippable" and 9+ is "excellent".
  3) Specific reasoning — what the agent did well, what it missed.

Be strict but fair. A response that's confidently wrong scores LOWER than one
that admits it doesn't know. Empty or hallucinated outputs are 0. Verbose
correctness scores lower than concise correctness. Tool calls that succeeded
but didn't help count as partial credit.

Output STRICT JSON only. No markdown, no fences. Shape:
{ "passed": boolean, "score": number (0-10), "reasoning": string (2-4 sentences) }`;

export async function POST(req: Request) {
  const body = (await req.json()) as Body;
  const apiKey = process.env.ANTHROPIC_API_KEY;

  // Pre-judge: if mustInclude is set, fail fast on any missing substring.
  if (body.mustInclude && body.mustInclude.length > 0) {
    const missing = body.mustInclude.filter((s) => !body.output.toLowerCase().includes(s.toLowerCase()));
    if (missing.length > 0) {
      return Response.json({
        passed: false,
        score: Math.max(0, 5 - missing.length),
        reasoning: `Hard-check failed: output is missing required substring(s) — ${missing.map((s) => `"${s}"`).join(", ")}.`,
      });
    }
  }

  if (!apiKey) {
    return Response.json({
      passed: body.output.length > 30,
      score: 5,
      reasoning: "[demo] Set ANTHROPIC_API_KEY on the server for real grading. Length-based fallback used.",
    });
  }

  const client = new Anthropic({ apiKey });
  try {
    const res = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 600,
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{
        role: "user",
        content: `INPUT:\n${body.input}\n\nAGENT OUTPUT:\n${body.output}\n\nRUBRIC:\n${body.rubric}\n\nGrade it.`,
      }],
    });
    const text = res.content.filter((c) => c.type === "text").map((c) => (c.type === "text" ? c.text : "")).join("").trim();
    const cleaned = text.replace(/^```json\n?|\n?```$/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return Response.json({
      passed: !!parsed.passed,
      score: Math.max(0, Math.min(10, Number(parsed.score) || 0)),
      reasoning: String(parsed.reasoning || ""),
    }, { headers: aiUsageHeaders(res) });
  } catch (e) {
    return Response.json({ passed: false, score: 0, reasoning: `Judge error: ${(e as Error).message}` }, { status: 502 });
  }
}
