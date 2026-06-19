import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabase";
import { embed } from "@/lib/embeddings";
import type { AgentContext, AgentResult } from "@/lib/agent-runner";
import { composeContext, type RetrievalHit, RAG_SYSTEM_PROMPT_FRAGMENT, extractUsedCitations } from "@/lib/sage-retrieval";

// Grounded query — Sage's fifth agent. Sage with RETRIEVAL.
//
// Input: { query: string, scope?: 'all' | 'profile' | 'venture', topK?: number }
//
// The shape of the run: embed the user's question, kNN against the
// public_search_index, compose a numbered citation context block,
// hand to Claude with strict "ground every claim, cite [N]" rules,
// extract the cited sources, and return both the answer and the
// citation list. The list page renders citations as clickable cards.
//
// Differs from the other agents in that the output ISN'T a draft of
// something the user will send/edit — it's a research artifact. The
// run is terminal; the value is the answer + the cited sources.

const SYSTEM_PROMPT = `You are Sage, the AI mentor inside Sankofa Studio. You are answering a member's question using a grounded set of entries from Sankofa's knowledge base.

${RAG_SYSTEM_PROMPT_FRAGMENT}

Tone:
- Direct. Skip the throat-clearing — open with the answer.
- Use the language the user used — if they asked in Pidgin, answer in Pidgin.
- When several entries point to a pattern, name the pattern and cite a couple of representative examples.
- When the context is thin, say so plainly: "I only see two members working on this — [1] and [3]." Don't pad.`;

const TOP_K_DEFAULT = 12;

export async function groundedQuery(ctx: AgentContext): Promise<AgentResult> {
  const input = ctx.input as { query?: string; scope?: "all" | "profile" | "venture"; topK?: number };
  if (!input.query) throw new Error("missing_query");
  const query = input.query.trim();
  if (query.length < 3) throw new Error("query_too_short");

  const sb = supabaseAdmin();
  if (!sb) throw new Error("admin_unavailable");

  const topK = Math.min(Math.max(input.topK ?? TOP_K_DEFAULT, 1), 30);
  const kindFilter = !input.scope || input.scope === "all" ? null : input.scope;

  // Step 1: embed the query.
  const queryVec = await ctx.step("Embedding your question", async () => {
    const [v] = await embed([query]);
    if (!v || v.length === 0) throw new Error("embed_failed");
    return v;
  });

  // Step 2: kNN over public_search_index.
  const hits = await ctx.step(`Searching ${kindFilter ?? "everything"}`, async () => {
    const { data, error } = await sb.rpc("public_search_match", {
      query_embedding: queryVec,
      match_count: topK,
      kind_filter: kindFilter,
    });
    if (error) throw new Error(`rpc_failed: ${error.message}`);
    return (data ?? []) as Array<{
      id: number; entity_kind: string; entity_id: string;
      href: string; title: string; body: string; similarity: number;
    }>;
  });

  if (hits.length === 0) {
    return {
      output: {
        query, scope: input.scope ?? "all",
        answer: "I couldn't find anything matching your question in the public knowledge base. Try a different phrasing — or describe what you're looking for in more detail.",
        citations: [], sources: [],
      },
      terminal: true,
      title: `No results · "${query.slice(0, 80)}"`,
      notification: {
        title: "Sage couldn't find matches",
        body: query.slice(0, 160),
        url: `/studio/agent-runs/${ctx.runId}`,
      },
    };
  }

  // Step 3: compose context block. Pure function from
  // lib/sage-retrieval — applies the similarity floor, dedupes, and
  // budgets total chars so the system prompt stays inside cache.
  const composed = await ctx.step("Composing context", async () => {
    const retrievalHits: RetrievalHit[] = hits.map((h) => ({
      entity_kind: h.entity_kind,
      entity_id: h.entity_id,
      href: h.href,
      title: h.title,
      body: h.body,
      similarity: h.similarity,
    }));
    return composeContext(retrievalHits);
  });

  if (composed.citations.length === 0) {
    // Floor knocked everything out — the matches were all too weak.
    return {
      output: {
        query, scope: input.scope ?? "all",
        answer: "I found some loosely-related entries, but none were a strong enough match to answer your question. Try a different phrasing or be more specific.",
        citations: [], sources: hits.slice(0, 5).map((h) => ({
          title: h.title, href: h.href, similarity: h.similarity, entity_kind: h.entity_kind,
        })),
      },
      terminal: true,
      title: `Weak match · "${query.slice(0, 80)}"`,
      notification: {
        title: "Sage's matches were too weak",
        body: query.slice(0, 160),
        url: `/studio/agent-runs/${ctx.runId}`,
      },
    };
  }

  // Step 4: ask Claude.
  const answer = await ctx.step(`Answering with ${composed.citations.length} sources`, async () => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      // Local-mode fallback so the run flow works in dev. Returns the
      // top hit's title as a stub answer.
      return `(local mode — Anthropic API key not configured)\n\nI found ${composed.citations.length} relevant entries, top match: [1] ${composed.citations[0]?.title}.`;
    }
    const client = new Anthropic({ apiKey });
    const res = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1200,
      system: [
        { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
        { type: "text", text: `CONTEXT:\n\n${composed.contextBlock}`, cache_control: { type: "ephemeral" } },
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

  // Step 5: figure out which citations the model actually used.
  const used = extractUsedCitations(answer, composed.citations);

  return {
    output: {
      query,
      scope: input.scope ?? "all",
      answer,
      // Full citation set the LLM had access to (numbered, for the UI).
      citations: composed.citations,
      // The subset the model actually cited — useful for the "Sources"
      // strip rendering only what's load-bearing.
      used_citations: used.used,
      stats: {
        hits_returned: hits.length,
        in_context: composed.citations.length,
        dropped_for_budget: composed.droppedForBudget,
        all_refs_valid: used.allRefsValid,
      },
    },
    terminal: true,
    title: `Sage: ${query.slice(0, 80)}`,
    notification: {
      title: "Sage answered your question",
      body: answer.replace(/\[\d+(?:\s*,\s*\d+)*\]/g, "").slice(0, 160),
      url: `/studio/agent-runs/${ctx.runId}`,
    },
  };
}
