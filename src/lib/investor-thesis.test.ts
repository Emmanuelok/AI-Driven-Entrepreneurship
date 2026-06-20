import { describe, it, expect } from "vitest";
import {
  normalizeThesis, thesisCompleteness, canPublishThesis, missingForPublish,
  formatCheckRange, summarizeThesis, thesisMatchesVenture, thesisMatchScore,
  EMPTY_THESIS, THESIS_PUBLISH_MIN_SCORE,
  type InvestorThesis,
} from "./investor-thesis";
import type { MatchableVenture } from "./saved-search";

function thesis(over: Partial<InvestorThesis> = {}): InvestorThesis {
  return {
    headline: "Pre-seed climate & fintech across West Africa",
    statement: "We back technical founders building climate and fintech infrastructure in West Africa at the earliest stage.",
    sectors: ["climate", "fintech"],
    stages: ["idea", "mvp"],
    regions: ["Nigeria", "Ghana"],
    checkMinUsd: 25_000,
    checkMaxUsd: 250_000,
    acceptsColdPitch: true,
    isPublished: true,
    ...over,
  };
}

function venture(over: Partial<MatchableVenture> = {}): MatchableVenture {
  return {
    slug: "v1",
    title: "Zuri Health",
    tagline: "Telehealth for Lagos.",
    sectors: ["fintech"],
    stage: "mvp",
    is_raising: true,
    raising_amount_usd: 200_000,
    region: "Nigeria",
    updated_at: "2026-06-10T00:00:00Z",
    ...over,
  };
}

// ── normalizeThesis ───────────────────────────────────────────────

describe("normalizeThesis", () => {
  it("returns EMPTY_THESIS for non-object input", () => {
    expect(normalizeThesis(null)).toEqual(EMPTY_THESIS);
    expect(normalizeThesis("nope")).toEqual(EMPTY_THESIS);
    expect(normalizeThesis(42)).toEqual(EMPTY_THESIS);
  });

  it("trims headline/statement and bounds length", () => {
    const t = normalizeThesis({ headline: "  Hi  ", statement: "x".repeat(5000) });
    expect(t.headline).toBe("Hi");
    expect(t.statement.length).toBe(4000);
  });

  it("lowercases + dedupes sectors, preserves region case", () => {
    const t = normalizeThesis({ sectors: ["Climate", "climate", "FinTech"], regions: ["Nigeria", "nigeria", "Ghana"] });
    expect(t.sectors).toEqual(["climate", "fintech"]);
    // regions dedupe case-insensitively but keep first-seen casing
    expect(t.regions).toEqual(["Nigeria", "Ghana"]);
  });

  it("validates stages against the enum", () => {
    const t = normalizeThesis({ stages: ["idea", "bogus", "scale", "idea"] });
    expect(t.stages).toEqual(["idea", "scale"]);
  });

  it("floors + non-negates check bounds, swaps reversed", () => {
    expect(normalizeThesis({ checkMinUsd: 50.9 }).checkMinUsd).toBe(50);
    expect(normalizeThesis({ checkMinUsd: -5 }).checkMinUsd).toBeNull();
    const swapped = normalizeThesis({ checkMinUsd: 500_000, checkMaxUsd: 100_000 });
    expect(swapped.checkMinUsd).toBe(100_000);
    expect(swapped.checkMaxUsd).toBe(500_000);
  });

  it("coerces booleans from true/'1'/1", () => {
    expect(normalizeThesis({ acceptsColdPitch: "1" }).acceptsColdPitch).toBe(true);
    expect(normalizeThesis({ isPublished: 1 }).isPublished).toBe(true);
    expect(normalizeThesis({ acceptsColdPitch: "yes" }).acceptsColdPitch).toBe(false);
  });

  it("caps sector + region list sizes", () => {
    const t = normalizeThesis({
      sectors: Array.from({ length: 30 }, (_, i) => `s${i}`),
      regions: Array.from({ length: 30 }, (_, i) => `r${i}`),
    });
    expect(t.sectors.length).toBe(12);
    expect(t.regions.length).toBe(10);
  });
});

// ── completeness ──────────────────────────────────────────────────

describe("thesisCompleteness", () => {
  it("is 0 for empty", () => {
    expect(thesisCompleteness(EMPTY_THESIS)).toBe(0);
  });

  it("is 100 for a fully-filled thesis", () => {
    expect(thesisCompleteness(thesis())).toBe(100);
  });

  it("awards partial credit per section", () => {
    const t = thesis({ statement: "", regions: [], checkMinUsd: null, checkMaxUsd: null });
    // headline 25 + sectors 15 + stages 15 = 55
    expect(thesisCompleteness(t)).toBe(55);
  });

  it("ignores too-short headline/statement", () => {
    const t = normalizeThesis({ headline: "Hi", statement: "short" });
    expect(thesisCompleteness(t)).toBe(0);
  });
});

describe("canPublishThesis + missingForPublish", () => {
  it("requires the minimum score", () => {
    expect(canPublishThesis(EMPTY_THESIS)).toBe(false);
    expect(canPublishThesis(thesis())).toBe(true);
    expect(THESIS_PUBLISH_MIN_SCORE).toBeGreaterThan(0);
  });

  it("lists what's missing for an incomplete thesis", () => {
    const m = missingForPublish(EMPTY_THESIS);
    expect(m).toContain("a headline");
    expect(m).toContain("a thesis statement");
    expect(m).toContain("at least one sector");
    expect(m).toContain("at least one stage");
  });

  it("returns no missing items for a complete thesis", () => {
    expect(missingForPublish(thesis())).toEqual([]);
  });
});

// ── formatting ────────────────────────────────────────────────────

describe("formatCheckRange", () => {
  it("returns null when no bounds set", () => {
    expect(formatCheckRange({ checkMinUsd: null, checkMaxUsd: null })).toBeNull();
  });
  it("formats both / min-only / max-only", () => {
    expect(formatCheckRange({ checkMinUsd: 25_000, checkMaxUsd: 250_000 })).toBe("$25k–$250k");
    expect(formatCheckRange({ checkMinUsd: 100_000, checkMaxUsd: null })).toBe("$100k+");
    expect(formatCheckRange({ checkMinUsd: null, checkMaxUsd: 1_000_000 })).toBe("up to $1M");
  });
});

describe("summarizeThesis", () => {
  it("joins stages, sectors, regions, check", () => {
    const s = summarizeThesis(thesis());
    expect(s).toContain("Idea/MVP");
    expect(s).toContain("Climate, Fintech");
    expect(s).toContain("Nigeria, Ghana");
    expect(s).toContain("checks $25k–$250k");
  });
  it("falls back to 'Open thesis' when empty", () => {
    expect(summarizeThesis(EMPTY_THESIS)).toBe("Open thesis");
  });
  it("overflows sectors with +N", () => {
    const s = summarizeThesis(thesis({ sectors: ["a", "b", "c", "d", "e"] }));
    expect(s).toContain("+2");
  });
});

// ── matching ──────────────────────────────────────────────────────

describe("thesisMatchesVenture", () => {
  it("matches a consistent venture", () => {
    expect(thesisMatchesVenture(thesis(), venture())).toBe(true);
  });

  it("requires sector overlap when thesis lists sectors", () => {
    expect(thesisMatchesVenture(thesis(), venture({ sectors: ["agritech"] }))).toBe(false);
  });

  it("requires venture stage ∈ thesis stages", () => {
    expect(thesisMatchesVenture(thesis(), venture({ stage: "scale" }))).toBe(false);
    expect(thesisMatchesVenture(thesis(), venture({ stage: "idea" }))).toBe(true);
  });

  it("requires region membership when thesis lists regions", () => {
    expect(thesisMatchesVenture(thesis(), venture({ region: "Kenya" }))).toBe(false);
    expect(thesisMatchesVenture(thesis(), venture({ region: "ghana" }))).toBe(true); // case-insensitive
  });

  it("enforces the check range against a numeric ask", () => {
    expect(thesisMatchesVenture(thesis(), venture({ raising_amount_usd: 10_000 }))).toBe(false);
    expect(thesisMatchesVenture(thesis(), venture({ raising_amount_usd: 300_000 }))).toBe(false);
    expect(thesisMatchesVenture(thesis(), venture({ raising_amount_usd: 25_000 }))).toBe(true);
  });

  it("includes ventures with a null ask (unknown, not excluded)", () => {
    expect(thesisMatchesVenture(thesis(), venture({ raising_amount_usd: null }))).toBe(true);
  });

  it("an empty thesis matches everything", () => {
    expect(thesisMatchesVenture(EMPTY_THESIS, venture())).toBe(true);
  });
});

describe("thesisMatchScore", () => {
  it("rewards more specific overlaps", () => {
    const tight = thesis({ sectors: ["fintech"], stages: ["mvp"], regions: ["Nigeria"] });
    const loose = thesis({ sectors: ["fintech", "climate", "health"], stages: [], regions: [], checkMinUsd: null, checkMaxUsd: null });
    expect(thesisMatchScore(tight, venture())).toBeGreaterThan(thesisMatchScore(loose, venture()));
  });

  it("caps at 100", () => {
    const t = thesis({ sectors: ["fintech", "climate", "health", "edtech"] });
    expect(thesisMatchScore(t, venture({ sectors: ["fintech", "climate", "health", "edtech"] }))).toBeLessThanOrEqual(100);
  });
});
