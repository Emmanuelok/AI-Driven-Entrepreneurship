import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabase";
import type { AgentContext, AgentResult } from "@/lib/agent-runner";

// Discussion summary — Sage's third agent.
//
// Input: { workspaceId: string, sinceHours?: number }
//
// Sage reads the workspace's recent discussion (default last 72h,
// configurable via sinceHours) and produces a structured digest a
// member returning from a few days off can scan instead of reading
// every message.
//
// Sections:
//   - decisions: key choices that were made
//   - open_questions: questions still hanging
//   - action_items: who's doing what next
//   - mentions: brief one-line characterizations of who said what
//
// The caller must be a workspace member — the runner doesn't enforce
// this directly (it's a generic helper) so we re-check here.

const SYSTEM_PROMPT = `You are Sage, the AI mentor inside Sankofa Studio. You are producing a structured digest of a workspace's recent discussion so a teammate returning from a few days off can catch up in 60 seconds.

Rules:
- Stay grounded in the messages provided. Don't invent action items, decisions, or attributions.
- "Decisions" are things the group actually decided. Not "they discussed X" — "they chose X over Y because Z."
- "Open questions" are real unresolved questions. Not rhetorical asides.
- "Action items" should attribute when possible — name the person, what they committed to, and any deadline mentioned.
- "Mentions" is a short list of each speaker who contributed substantively with a one-line take on what they brought.
- If a section has nothing to surface, return an empty array — don't pad.

Return JSON ONLY:
{
  "decisions":      ["…", "…"],
  "open_questions": ["…", "…"],
  "action_items":   [{ "who": "name or '?'", "what": "…", "when": "string or null" }],
  "mentions":       [{ "name": "…", "contribution": "…" }]
}`;

export async function discussionSummary(ctx: AgentContext): Promise<AgentResult> {
  const input = ctx.input as { workspaceId?: string; sinceHours?: number };
  if (!input.workspaceId) throw new Error("missing_workspace");

  const sb = supabaseAdmin();
  if (!sb) throw new Error("admin_unavailable");

  // Membership gate. The runner's startAgentRun handed us userId.
  const membership = await ctx.step("Checking workspace access", async () => {
    const { data } = await sb.rpc("is_workspace_member", {
      _workspace_id: input.workspaceId,
      _user_id: ctx.userId,
    });
    if (!data) throw new Error("not_a_member");
    return data as string;
  });
  void membership;

  const sinceMs = Math.max(1, Math.min(720, input.sinceHours ?? 72)) * 3600_000;
  const sinceIso = new Date(Date.now() - sinceMs).toISOString();

  const messages = await ctx.step(`Reading messages since ${sinceIso.slice(0, 10)}`, async () => {
    const { data } = await sb
      .from("workspace_messages")
      .select("author_name, body, is_agent, created_at")
      .eq("workspace_id", input.workspaceId)
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: true })
      .limit(500);
    return (data ?? []) as Array<{ author_name: string; body: string; is_agent: boolean; created_at: string }>;
  });

  if (messages.length === 0) {
    return {
      output: { decisions: [], open_questions: [], action_items: [], mentions: [], note: "No messages in window." },
      terminal: true,
      title: `Discussion digest`,
      notification: {
        title: `No discussion to summarize`,
        body: `Nothing in the last ${Math.round(sinceMs / 3600_000)} hours.`,
        url: `/studio/agent-runs/${ctx.runId}`,
      },
    };
  }

  // Compose a compact transcript for the model. We strip Sage's own
  // bot replies (is_agent=true) so the digest summarizes humans, not
  // Sage's previous outputs.
  const transcript = messages
    .filter((m) => !m.is_agent)
    .map((m) => `[${m.created_at.slice(0, 16).replace("T", " ")}] ${m.author_name}: ${m.body.replace(/\s+/g, " ").slice(0, 800)}`)
    .join("\n");

  const summary = await ctx.step("Composing digest", async () => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return {
        decisions: [],
        open_questions: [],
        action_items: [],
        mentions: messages.slice(0, 5).map((m) => ({ name: m.author_name, contribution: m.body.slice(0, 80) })),
      };
    }
    const client = new Anthropic({ apiKey });
    const res = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1400,
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: `RECENT WORKSPACE DISCUSSION:\n\n${transcript}\n\nProduce the digest now. JSON only.` }],
    });
    const text = res.content
      .filter((c) => c.type === "text")
      .map((c) => (c.type === "text" ? c.text : ""))
      .join("")
      .trim();
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
    try {
      const parsed = JSON.parse(cleaned) as {
        decisions?: string[]; open_questions?: string[];
        action_items?: Array<{ who?: string; what?: string; when?: string | null }>;
        mentions?: Array<{ name?: string; contribution?: string }>;
      };
      return {
        decisions: (parsed.decisions ?? []).filter((s) => typeof s === "string"),
        open_questions: (parsed.open_questions ?? []).filter((s) => typeof s === "string"),
        action_items: (parsed.action_items ?? []).map((a) => ({
          who: String(a.who ?? "?"),
          what: String(a.what ?? ""),
          when: a.when ?? null,
        })).filter((a) => a.what),
        mentions: (parsed.mentions ?? []).map((a) => ({
          name: String(a.name ?? ""),
          contribution: String(a.contribution ?? ""),
        })).filter((a) => a.name),
      };
    } catch {
      return { decisions: [], open_questions: [], action_items: [], mentions: [] };
    }
  });

  return {
    output: { ...summary, workspaceId: input.workspaceId, sinceHours: input.sinceHours ?? 72, messageCount: messages.length },
    terminal: true,
    title: `Digest · ${messages.length} messages`,
    notification: {
      title: `Sage's discussion digest is ready`,
      body: `${summary.decisions.length} decisions · ${summary.action_items.length} action items · ${summary.open_questions.length} open questions`,
      url: "/studio/agent-runs",
    },
  };
}
