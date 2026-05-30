import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { parseBodyWithRaw } from "@/lib/parse-body";
import { aiGuard } from "@/lib/ai-guard";
import { aiUsageHeaders } from "@/lib/ai-headers";
import { readSiteContext, siteSystemBlock } from "@/lib/site-brain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  systemPrompt: z.string().max(20_000),
  projectName: z.string().max(200).optional(),
  description: z.string().max(2000).optional(),
}).loose();
type Body = z.infer<typeof Body>;

const SYSTEM = `You design test suites for AI agents.

Given an agent's system prompt, you produce 6-8 starter test cases covering:
  - Happy path (2-3): typical inputs the agent SHOULD ace.
  - Edge case (2-3): ambiguity, missing info, multilingual input where relevant.
  - Refusal / safety (1-2): inputs the agent should decline or escalate.
  - Adversarial (1): an attempt to trick the agent into ignoring its prompt.

Each test:
  - name: short label
  - input: the literal user message
  - rubric: 1-3 sentences, specific behaviors that count as "passing"
  - mustInclude: optional array of substrings that MUST appear (use sparingly)

Output STRICT JSON only. No markdown fences. Shape:
{ "tests": [{ "name": string, "input": string, "rubric": string, "mustInclude": string[] }] }`;

export async function POST(req: Request) {
  const guard = await aiGuard({ req, scope: "eval-suggest", maxCalls: 6 });
  if (!guard.ok) return guard.response;
  const parsed = await parseBodyWithRaw(req, Body);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const raw = parsed.raw;
  const brain = siteSystemBlock(readSiteContext(raw));
  if (!guard.apiKey) {
    return Response.json({
      tests: [
        { name: "[demo] happy path", input: "Sample user input.", rubric: "Responds in plain English, addresses the question.", mustInclude: [] },
        { name: "[demo] edge — empty", input: "", rubric: "Asks for more information instead of guessing.", mustInclude: [] },
      ],
    });
  }
  const client = new Anthropic({ apiKey: guard.apiKey });
  try {
    const res = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1800,
      system: [{ type: "text", text: brain + SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{
        role: "user",
        content: `AGENT NAME: ${body.projectName ?? "(unnamed)"}\n\nDESCRIPTION: ${body.description ?? "(none)"}\n\nSYSTEM PROMPT:\n${body.systemPrompt}\n\nDesign the test suite.`,
      }],
    });
    const text = res.content.filter((c) => c.type === "text").map((c) => (c.type === "text" ? c.text : "")).join("").trim();
    const cleaned = text.replace(/^```json\n?|\n?```$/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return Response.json(parsed, { headers: aiUsageHeaders(res) });
  } catch (e) {
    return Response.json({ error: (e as Error).message, tests: [] }, { status: 502 });
  }
}
