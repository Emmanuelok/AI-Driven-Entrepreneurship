import { describe, it, expect } from "vitest";
import {
  dedupeHits, applySimilarityFloor, composeContext, extractUsedCitations,
  type RetrievalHit, type Citation,
} from "./sage-retrieval";

function hit(over: Partial<RetrievalHit>): RetrievalHit {
  return {
    entity_kind: "profile",
    entity_id: "ada",
    href: "/people/ada",
    title: "Ada Lovelace",
    body: "A mentor working on fintech distribution in Lagos.",
    similarity: 0.6,
    ...over,
  };
}

describe("applySimilarityFloor", () => {
  it("drops hits below the floor", () => {
    const out = applySimilarityFloor(
      [hit({ similarity: 0.5 }), hit({ entity_id: "b", similarity: 0.2 })],
      0.3,
    );
    expect(out).toHaveLength(1);
    expect(out[0].entity_id).toBe("ada");
  });

  it("uses default floor 0.3 when none provided", () => {
    const out = applySimilarityFloor([hit({ similarity: 0.29 }), hit({ entity_id: "b", similarity: 0.31 })]);
    expect(out).toHaveLength(1);
    expect(out[0].entity_id).toBe("b");
  });
});

describe("dedupeHits", () => {
  it("drops same (entity_kind, entity_id) duplicates and keeps the higher-similarity one", () => {
    const out = dedupeHits([
      hit({ entity_id: "a", similarity: 0.5 }),
      hit({ entity_id: "a", similarity: 0.8 }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].similarity).toBe(0.8);
  });

  it("drops near-identical titles even with different ids", () => {
    const out = dedupeHits([
      hit({ entity_id: "1", title: "AI for African Lawyers", similarity: 0.85 }),
      hit({ entity_id: "2", title: "AI for African Lawyers (fork)", similarity: 0.7 }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].entity_id).toBe("1");
  });

  it("keeps distinct titles", () => {
    const out = dedupeHits([
      hit({ entity_id: "1", title: "AI for African Lawyers" }),
      hit({ entity_id: "2", title: "Solar microcold storage in Tamale" }),
    ]);
    expect(out).toHaveLength(2);
  });

  it("respects custom minTitleOverlap", () => {
    const a = hit({ entity_id: "1", title: "fintech in Lagos" });
    const b = hit({ entity_id: "2", title: "fintech in Nairobi" });
    // 2/3 overlap → kept at default 0.7, dropped at 0.5
    expect(dedupeHits([a, b], { minTitleOverlap: 0.7 })).toHaveLength(2);
    expect(dedupeHits([a, b], { minTitleOverlap: 0.5 })).toHaveLength(1);
  });
});

describe("composeContext", () => {
  it("numbers entries 1-based with title + body", () => {
    const out = composeContext([
      hit({ entity_id: "a", title: "Ada", body: "Mentor in fintech.", similarity: 0.7 }),
      hit({ entity_id: "b", title: "Bola", body: "Founder in agritech.", similarity: 0.65 }),
    ]);
    expect(out.contextBlock).toContain("[1] Ada");
    expect(out.contextBlock).toContain("[2] Bola");
    expect(out.citations).toEqual([
      { index: 1, title: "Ada", href: "/people/ada", entity_kind: "profile", similarity: 0.7 },
      { index: 2, title: "Bola", href: "/people/ada", entity_kind: "profile", similarity: 0.65 },
    ]);
  });

  it("applies the similarity floor before composing", () => {
    const out = composeContext([
      hit({ entity_id: "weak", similarity: 0.1 }),
      hit({ entity_id: "strong", similarity: 0.8 }),
    ]);
    expect(out.citations).toHaveLength(1);
    expect(out.citations[0].similarity).toBe(0.8);
  });

  it("dedupes before composing so [1] is unique", () => {
    const out = composeContext([
      hit({ entity_id: "a", similarity: 0.7 }),
      hit({ entity_id: "a", similarity: 0.65 }),
    ]);
    expect(out.citations).toHaveLength(1);
  });

  it("clips per-hit body that exceeds the per-hit cap", () => {
    // ~900 chars of body — exceeds the 600-char per-hit cap.
    const longBody = "First sentence. " + "x".repeat(900) + " Trailing sentence.";
    const out = composeContext([hit({ body: longBody })]);
    // The clipped body is shorter than the input.
    expect(out.contextBlock.length).toBeLessThan(longBody.length + 50); // +50 for "[1] Title\n" overhead
    expect(out.contextBlock).toMatch(/[.…]\s*$/m);
  });

  it("does NOT clip a body that's already under the per-hit cap", () => {
    const shortBody = "Just one short sentence.";
    const out = composeContext([hit({ body: shortBody })]);
    expect(out.contextBlock).toContain(shortBody);
  });

  it("respects the total budget and surfaces dropped count", () => {
    // Synthesize many large hits to blow the budget.
    const big = Array.from({ length: 50 }, (_, i) => hit({
      entity_id: `e${i}`,
      title: `Title ${i}`,
      body: "Lorem ipsum ".repeat(80),
    }));
    const out = composeContext(big);
    expect(out.totalChars).toBeLessThan(12_500); // budget + small overhead
    expect(out.droppedForBudget).toBeGreaterThan(0);
    expect(out.citations.length).toBeLessThan(big.length);
  });

  it("produces an empty context cleanly when input is empty", () => {
    const out = composeContext([]);
    expect(out.contextBlock).toBe("");
    expect(out.citations).toEqual([]);
    expect(out.droppedForBudget).toBe(0);
  });
});

describe("extractUsedCitations", () => {
  const cites: Citation[] = [
    { index: 1, title: "A", href: "/a", entity_kind: "profile", similarity: 0.8 },
    { index: 2, title: "B", href: "/b", entity_kind: "profile", similarity: 0.7 },
    { index: 3, title: "C", href: "/c", entity_kind: "venture", similarity: 0.6 },
  ];

  it("extracts single citations", () => {
    const r = extractUsedCitations("Several mentors work on fintech [2].", cites);
    expect(r.used.map((c) => c.index)).toEqual([2]);
    expect(r.allRefsValid).toBe(true);
  });

  it("extracts comma-separated multi-citations", () => {
    const r = extractUsedCitations("Two members ship hardware [1, 3].", cites);
    expect(r.used.map((c) => c.index).sort()).toEqual([1, 3]);
    expect(r.allRefsValid).toBe(true);
  });

  it("flags invalid references", () => {
    const r = extractUsedCitations("Per [7] this is rare.", cites);
    expect(r.used).toEqual([]);
    expect(r.allRefsValid).toBe(false);
  });

  it("returns no citations when none appear in the response", () => {
    const r = extractUsedCitations("Plain text answer.", cites);
    expect(r.used).toEqual([]);
    expect(r.allRefsValid).toBe(true);
  });
});
