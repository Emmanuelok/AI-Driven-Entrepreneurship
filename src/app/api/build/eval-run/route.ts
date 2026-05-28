import Anthropic from "@anthropic-ai/sdk";
import { aiUsageHeaders } from "@/lib/ai-headers";
import { rateLimit, rateLimited, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Runs ONE test case through Claude with the agent's system prompt and
// returns the raw output. The judge endpoint scores it.

type Body = { systemPrompt: string; input: string };

export async function POST(req: Request) {
  // Evals get hammered when students "run all" — 30/min covers a suite of 10
  // tests run 3x in quick succession before hitting the wall.
  const rl = rateLimit({ scope: "eval-run", ipKey: clientIp(req), maxCalls: 30 });
  if (!rl.ok) return rateLimited(rl);
  const body = (await req.json()) as Body;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ output: `[demo] No API key on the server. Set ANTHROPIC_API_KEY to actually run evals.\nYour test input was: ${body.input.slice(0, 120)}` });
  }
  const client = new Anthropic({ apiKey });
  try {
    const res = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      system: [{ type: "text", text: body.systemPrompt || "You are a helpful assistant.", cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: body.input }],
    });
    const text = res.content.filter((c) => c.type === "text").map((c) => (c.type === "text" ? c.text : "")).join("");
    return Response.json({ output: text }, { headers: aiUsageHeaders(res) });
  } catch (e) {
    return Response.json({ output: "", error: (e as Error).message }, { status: 502 });
  }
}
