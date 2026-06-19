import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabase";
import { embed } from "@/lib/embeddings";
import type { AgentContext, AgentResult } from "@/lib/agent-runner";
import { composeContext, type RetrievalHit, RAG_SYSTEM_PROMPT_FRAGMENT, extractUsedCitations } from "@/lib/sage-retrieval";

// Workspace-grounded query — Sage's sixth agent.
//
// Like grounded_query (Phase 62) but scoped to ONE workspace's
// private index. Answers "what did Achieng say last week?", "what's
// the status of the LOI?", "who owns the cooperative pitch deadline?"
// — questions the public index can't touch.
//
// Input: { workspaceId: string, query: string, kindFilter?: 'message' |
// 'doc' | 'task' | 'deadline' }
//
// Membership is re-verified server-side (the runner is generic — auth
// belongs in the agent).

const SYSTEM_PROMPT = `You are Sage, the AI mentor inside Sankofa Studio. You are answering a workspace member's question by searching the workspace's own messages, docs, tasks, and deadlines.

${RAG_SYSTEM_PROMPT_FRAGMENT}

Tone:
- Talk like a teammate, not a search engine.
- When entries name specific members, name them too — "Achieng decided X [3]" is more useful than "the team decided X."
- If two entries contradict (a doc says one thing, a later message corrects it), call that out and cite both.
- When the context shows nothing material to the question, say so plainly: "Nothing in this workspace addresses that — try asking in #general."`;

export async function workspaceGroundedQuery(ctx: AgentContext): Promise<AgentResult> {
  const input = ctx.input as {
    workspaceId?: string;
    query?: string;
    kindFilter?: "message" | "doc" | "task" | "deadline";
    topK?: number;
  };
  if (!input.workspaceId) throw new Error("missing_workspace");
  if (!input.query || input.query.trim().length < 3) throw new Error("query_too_short");
  const query = input.query.trim();

  const sb = supabaseAdmin();
  if (!sb) throw new Error("admin_unavailable");

  // Membership gate. We pass through the same is_workspace_member RPC
  // every workspace API uses.
  await ctx.step("Checking workspace access", async () => {
    const { data } = await sb.rpc("is_workspace_member", {
      _workspace_id: input.workspaceId,
      _user_id: ctx.userId,
    });
    if (!data) throw new Error("not_a_member");
    return data as string;
  });

  // Pull workspace title for the run's notification + log labels.
  const workspaceTitle = await ctx.step("Reading workspace metadata", async () => {
    const { data } = await sb.from("workspaces").select("title").eq("id", input.workspaceId).maybeSingle();
    return (data as { title?: string } | null)?.title ?? "this workspace";
  });

  const topK = Math.min(Math.max(input.topK ?? 14, 1), 30);

  const queryVec = await ctx.step("Embedding your question", async () => {
    const [v] = await embed([query]);
    if (!v || v.length === 0) throw new Error("embed_failed");
    return v;
  });

  const hits = await ctx.step(`Searching workspace${input.kindFilter ? ` (${input.kindFilter}s)` : ""}`, async () => {
    const { data, error } = await sb.rpc("workspace_search_match", {
      _workspace_id: input.workspaceId,
      query_embedding: queryVec,
      match_count: topK,
      kind_filter: input.kindFilter ?? null,
    });
    if (error) throw new Error(`rpc_failed: ${error.message}`);
    return (data ?? []) as Array<{
      id: number; kind: string; ref_id: string; ref_url: string | null;
      title: string | null; body: string; similarity: number;
    }>;
  });

  if (hits.length === 0) {
    return {
      output: {
        query, workspaceId: input.workspaceId,
        answer: `I couldn't find anything in ${workspaceTitle} matching your question. The workspace index might not be populated yet — an admin can reindex from the search bar.`,
        citations: [], used_citations: [],
        stats: { hits_returned: 0, in_context: 0, dropped_for_budget: 0, all_refs_valid: true },
      },
      terminal: true,
      title: `No results · "${query.slice(0, 60)}"`,
      notification: {
        title: "Sage found nothing in the workspace index",
        body: query.slice(0, 160),
        url: `/studio/agent-runs/${ctx.runId}`,
      },
    };
  }

  const composed = await ctx.step("Composing context", async () => {
    const retrievalHits: RetrievalHit[] = hits.map((h) => ({
      entity_kind: `workspace_${h.kind}`,
      entity_id: h.ref_id,
      href: h.ref_url || `/studio/workspaces/${input.workspaceId}`,
      title: h.title || "(untitled)",
      body: h.body,
      similarity: h.similarity,
    }));
    return composeContext(retrievalHits);
  });

  if (composed.citations.length === 0) {
    return {
      output: {
        query, workspaceId: input.workspaceId,
        answer: "I found some loosely-related entries, but none were a strong enough match to answer. Try a more specific phrasing.",
        citations: [], used_citations: [],
        stats: { hits_returned: hits.length, in_context: 0, dropped_for_budget: 0, all_refs_valid: true },
      },
      terminal: true,
      title: `Weak match · "${query.slice(0, 60)}"`,
      notification: {
        title: "Sage's matches were too weak",
        body: query.slice(0, 160),
        url: `/studio/agent-runs/${ctx.runId}`,
      },
    };
  }

  const answer = await ctx.step(`Answering with ${composed.citations.length} sources`, async () => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return `(local mode — Anthropic API key not configured)\n\nI found ${composed.citations.length} relevant entries in ${workspaceTitle}, top match: [1] ${composed.citations[0]?.title}.`;
    }
    const client = new Anthropic({ apiKey });
    const res = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1200,
      system: [
        { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
        { type: "text", text: `WORKSPACE: ${workspaceTitle}\n\nCONTEXT:\n\n${composed.contextBlock}`, cache_control: { type: "ephemeral" } },
      ],
      messages: [{ role: "user", content: query }],
    });
    const text = res.content
      .filter((c) => c.type === "text")
      .map((c) => (c.type === "text" ? c.text : ""))
      .join("")
      .trim();
    return text || "(Sage returned an empty answer — try rephrasing.)";
  });

  const used = extractUsedCitations(answer, composed.citations);

  return {
    output: {
      query, workspaceId: input.workspaceId,
      answer, citations: composed.citations, used_citations: used.used,
      stats: {
        hits_returned: hits.length,
        in_context: composed.citations.length,
        dropped_for_budget: composed.droppedForBudget,
        all_refs_valid: used.allRefsValid,
      },
    },
    terminal: true,
    title: `Sage (${workspaceTitle}): ${query.slice(0, 60)}`,
    notification: {
      title: `Sage answered: ${workspaceTitle}`,
      body: answer.replace(/\[\d+(?:\s*,\s*\d+)*\]/g, "").slice(0, 160),
      url: `/studio/agent-runs/${ctx.runId}`,
    },
  };
}
