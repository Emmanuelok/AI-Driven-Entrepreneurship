// Retrieval-augmented generation building blocks. Pure functions that
// take embedding-search hits and turn them into a context block Sage
// can ground its answer in, with stable source attribution.
//
// Why pure: the LLM call is the expensive non-deterministic step.
// Composition + scoring + truncation are deterministic and worth
// unit-testing — RAG quality is mostly about what you send the model,
// not the model itself.

export type RetrievalHit = {
  entity_kind: string;       // 'profile' | 'venture' | 'workspace_message' | …
  entity_id: string;         // slug or row id
  href: string;              // deep-link path
  title: string;
  body: string;
  similarity: number;        // 0..1, cosine similarity from pgvector
};

export type Citation = {
  // Stable index the LLM uses in answers ("[1]", "[2]"). 1-based so
  // it reads naturally; we map back to the source on render.
  index: number;
  title: string;
  href: string;
  entity_kind: string;
  similarity: number;
};

// Cap on how many chars of each hit we feed Claude. Long bodies eat
// the budget without proportionally improving grounding — RAG papers
// consistently show diminishing returns past ~500 chars per chunk for
// general Q&A. This is per-hit, not total.
const PER_HIT_CHAR_CAP = 600;

// Hard cap on the composed context block. Keeps the system prompt
// inside Claude's ephemeral cache window and leaves room for the
// conversation history. ~12k chars ≈ ~3k tokens.
const TOTAL_CHAR_CAP = 12_000;

// Minimum similarity to include a hit. Very weak matches (cosine < 0.30)
// generally hurt more than they help — they confuse the model with
// off-topic context. We tuned this on the Voyage-3-lite distribution.
const MIN_SIMILARITY = 0.30;

// Drop near-duplicate hits. Two profiles with very similar bodies
// (a verified mentor + their fork) waste the context budget. We keep
// the higher-similarity one and drop the lower.
export function dedupeHits(hits: RetrievalHit[], { minTitleOverlap = 0.7 } = {}): RetrievalHit[] {
  // Sort highest-similarity first so when we encounter a duplicate
  // we keep the strong one.
  const sorted = [...hits].sort((a, b) => b.similarity - a.similarity);
  const kept: RetrievalHit[] = [];
  for (const hit of sorted) {
    let isDup = false;
    for (const k of kept) {
      // Same kind + same id is the trivial case.
      if (hit.entity_kind === k.entity_kind && hit.entity_id === k.entity_id) {
        isDup = true; break;
      }
      // Near-identical titles (case + whitespace insensitive) — these
      // happen when the same row was re-embedded after a typo fix.
      const a = hit.title.toLowerCase().replace(/\s+/g, " ").trim();
      const b = k.title.toLowerCase().replace(/\s+/g, " ").trim();
      if (a && b && titleOverlap(a, b) >= minTitleOverlap) {
        isDup = true; break;
      }
    }
    if (!isDup) kept.push(hit);
  }
  return kept;
}

// Jaccard token overlap on titles. Cheap, works for the dedupe case
// where two titles are "AI for African Lawyers" and "AI for African
// Lawyers (fork)" → overlap of 4/5 = 0.8 → dropped.
function titleOverlap(a: string, b: string): number {
  const ta = new Set(a.split(/\s+/));
  const tb = new Set(b.split(/\s+/));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

// Apply the minimum-similarity gate. Caller can override the floor
// when they explicitly want broader retrieval ("find anything related,
// even loosely").
export function applySimilarityFloor(hits: RetrievalHit[], floor = MIN_SIMILARITY): RetrievalHit[] {
  return hits.filter((h) => h.similarity >= floor);
}

// Truncate each hit's body to a sensible chunk size for RAG. We try
// to break at a sentence boundary; on failure, fall back to a hard
// char cut + ellipsis.
function clipBody(body: string, max = PER_HIT_CHAR_CAP): string {
  const trimmed = body.replace(/\s+/g, " ").trim();
  if (trimmed.length <= max) return trimmed;
  const cut = trimmed.slice(0, max);
  // Try the last sentence-ending punctuation.
  const m = cut.match(/[.!?]\s[^.!?]*$/);
  if (m && m.index && m.index > max * 0.5) {
    return cut.slice(0, m.index + 1) + " …";
  }
  // Fallback: last space.
  const sp = cut.lastIndexOf(" ");
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut) + "…";
}

export type ComposedContext = {
  contextBlock: string;          // ready to drop into system prompt
  citations: Citation[];         // ordered list, indices match [N] markers
  totalChars: number;            // budget consumed
  droppedForBudget: number;      // hits we had to skip due to TOTAL_CHAR_CAP
};

// Compose a context block for the LLM. Each hit becomes a numbered
// block with a heading + body. Tells the model how to cite via the
// [N] convention. Caller's system prompt is the right place to spell
// out citation rules.
export function composeContext(hits: RetrievalHit[]): ComposedContext {
  const cleaned = dedupeHits(applySimilarityFloor(hits));
  const blocks: string[] = [];
  const citations: Citation[] = [];
  let totalChars = 0;
  let droppedForBudget = 0;

  for (let i = 0; i < cleaned.length; i++) {
    const h = cleaned[i];
    const body = clipBody(h.body);
    const block = `[${i + 1}] ${h.title}\n${body}`;
    if (totalChars + block.length > TOTAL_CHAR_CAP) {
      droppedForBudget = cleaned.length - i;
      break;
    }
    blocks.push(block);
    citations.push({
      index: i + 1,
      title: h.title,
      href: h.href,
      entity_kind: h.entity_kind,
      similarity: h.similarity,
    });
    totalChars += block.length + 2; // newlines between blocks
  }

  return {
    contextBlock: blocks.join("\n\n"),
    citations,
    totalChars,
    droppedForBudget,
  };
}

// Best-effort renumber check: given an LLM response that includes
// citation markers like "[1]", "[2]", return the subset of citations
// actually used + the response with markers preserved. Useful if the
// UI wants to render only the cited sources.
export function extractUsedCitations(
  response: string,
  citations: Citation[],
): { used: Citation[]; allRefsValid: boolean } {
  // Match patterns like [1], [2,3], [1, 4]
  const matches = response.matchAll(/\[(\d+(?:\s*,\s*\d+)*)\]/g);
  const usedIndices = new Set<number>();
  let allRefsValid = true;
  for (const m of matches) {
    const ns = m[1].split(",").map((s) => parseInt(s.trim(), 10)).filter(Number.isFinite);
    for (const n of ns) {
      if (citations.some((c) => c.index === n)) usedIndices.add(n);
      else allRefsValid = false;
    }
  }
  return {
    used: citations.filter((c) => usedIndices.has(c.index)),
    allRefsValid,
  };
}

// System-prompt fragment we paste into agent calls. Defining it in
// one place ensures every grounded agent cites the same way.
export const RAG_SYSTEM_PROMPT_FRAGMENT = `You have been given a CONTEXT block containing numbered entries from Sankofa Studio's knowledge base. Each entry starts with [N] and a title.

Rules:
- Ground every claim in the provided entries. When you reference one, cite it inline as [N].
- If the context doesn't contain enough information to answer, say so — do NOT invent facts.
- Multiple citations are fine: "Several members work on fintech [3,5]."
- Don't repeat the entry headings in your answer; weave the information naturally.
- Keep the answer concise. The context is exhaustive — your job is the synthesis.`;
