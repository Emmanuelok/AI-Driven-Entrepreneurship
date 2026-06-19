import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabase";
import type { AgentContext, AgentResult } from "@/lib/agent-runner";

// Venture pitch polish — Sage's fourth agent.
//
// Input: { ventureSlug: string }  (the public_venture row's slug)
//
// Sage reads the venture's current public payload and produces a
// polished four-section pitch the founder can paste back into their
// publish flow:
//   - hook:     one-liner that earns the next 20 seconds of attention
//   - problem:  the specific problem and who has it (named, located)
//   - solution: the wedge — what's different, not what's similar
//   - ask:      the one specific thing they're asking the reader for
//
// terminal: false. The founder reviews + republishes. Sage never
// writes to public_ventures directly — every change is human-approved.

const SYSTEM_PROMPT = `You are Sage, the AI mentor inside Sankofa Studio. You are polishing a founder's venture pitch — they will review it and decide whether to republish. Your job is to strengthen the writing while staying faithful to what they've actually built.

Rules:
- Do not invent traction, metrics, customers, or partnerships. Only sharpen what's there.
- "Hook" must earn the next 20 seconds. Lead with a fact, a contrast, or a concrete situation. Avoid abstractions ("we believe…", "the future of…").
- "Problem" must name a real person or situation. "Mama Adwoa in Tamale loses 4 crates a week" beats "smallholders face spoilage."
- "Solution" must articulate the wedge — what's different, what's defensible, what's only-you. Not a feature list.
- "Ask" must be specific. "Raising $200k pre-seed" beats "looking to grow." "3 mentor intros to fintech operators" beats "support."
- If a section's source material is too thin to polish, return it as-is rather than padding.

Return JSON ONLY:
{
  "hook":     "…",
  "problem":  "…",
  "solution": "…",
  "ask":      "…"
}`;

export async function venturePitchPolish(ctx: AgentContext): Promise<AgentResult> {
  const input = ctx.input as { ventureSlug?: string };
  if (!input.ventureSlug) throw new Error("missing_venture");

  const sb = supabaseAdmin();
  if (!sb) throw new Error("admin_unavailable");

  const venture = await ctx.step("Reading venture", async () => {
    const { data } = await sb
      .from("public_ventures")
      .select("payload, sectors, region, stage, is_raising, raising_amount_usd, owner_id")
      .eq("slug", input.ventureSlug)
      .maybeSingle();
    if (!data) throw new Error("venture_not_found");
    return data as Record<string, unknown>;
  });

  // Only the founder herself can run this — polish is sensitive
  // intellectual content. We check via owner_id and the runner's
  // userId.
  if ((venture as { owner_id?: string }).owner_id !== ctx.userId) {
    throw new Error("not_venture_owner");
  }

  const polished = await ctx.step("Polishing pitch", async () => {
    const payload = (venture as { payload?: Record<string, unknown> }).payload ?? {};
    const promptMessage = [
      `CURRENT PUBLIC PAYLOAD:`,
      JSON.stringify(payload, null, 2),
      ``,
      `SECTORS: ${(venture as { sectors?: string[] }).sectors?.join(", ") ?? "(none)"}`,
      `REGION: ${(venture as { region?: string | null }).region ?? "(none)"}`,
      `STAGE: ${(venture as { stage?: string | null }).stage ?? "(none)"}`,
      `RAISING: ${(venture as { is_raising?: boolean }).is_raising
        ? `yes${(venture as { raising_amount_usd?: number }).raising_amount_usd
          ? ` ($${(venture as { raising_amount_usd: number }).raising_amount_usd.toLocaleString()} target)`
          : ""}`
        : "no"}`,
      ``,
      `Produce the polished pitch now. JSON only.`,
    ].join("\n");

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      const payloadAny = payload as Record<string, unknown>;
      return {
        hook: String(payloadAny.tagline ?? ""),
        problem: "",
        solution: "",
        ask: "",
      };
    }
    const client = new Anthropic({ apiKey });
    const res = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 900,
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: promptMessage }],
    });
    const text = res.content
      .filter((c) => c.type === "text")
      .map((c) => (c.type === "text" ? c.text : ""))
      .join("")
      .trim();
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
    try {
      const parsed = JSON.parse(cleaned) as { hook?: string; problem?: string; solution?: string; ask?: string };
      return {
        hook: String(parsed.hook ?? "").trim(),
        problem: String(parsed.problem ?? "").trim(),
        solution: String(parsed.solution ?? "").trim(),
        ask: String(parsed.ask ?? "").trim(),
      };
    } catch {
      return { hook: text, problem: "", solution: "", ask: "" };
    }
  });

  return {
    output: { ...polished, ventureSlug: input.ventureSlug },
    terminal: false, // founder reviews + republishes — that's the approval
    title: `Polished pitch for ${input.ventureSlug}`,
    notification: {
      title: `Sage polished your pitch`,
      body: polished.hook.slice(0, 160),
      url: `/studio/agent-runs/${ctx.runId}`,
    },
  };
}
