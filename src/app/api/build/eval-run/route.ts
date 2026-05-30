import Anthropic from "@anthropic-ai/sdk";
import { aiGuard } from "@/lib/ai-guard";
import { aiUsageHeaders } from "@/lib/ai-headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Runs ONE test case through Claude with the agent's system prompt and
// returns the raw output. The judge endpoint scores it.

type Body = { systemPrompt: string; input: string };

export async function POST(req: Request) {
  // Evals get hammered when students "run all" — 30/min covers a suite of 10
  // tests run 3x in quick succession before hitting the wall.
  const guard = await aiGuard({ req, scope: "eval-run", maxCalls: 30 });
  if (!guard.ok) return guard.response;
  const body = (await req.json()) as Body;
  if (!guard.apiKey) {
    return Response.json({ output: `[demo] No API key on the server. Set ANTHROPIC_API_KEY to actually run evals.\nYour test input was: ${body.input.slice(0, 120)}` });
  }
  const client = new Anthropic({ apiKey: guard.apiKey });
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
