import { describe, it, expect } from "vitest";
import {
  normalizeCriteria, hasAnyFilter, matchVenture, filterMatchingVentures,
  summarizeCriteria, stageLabel, suggestTitle,
  EMPTY_CRITERIA, VALID_STAGES,
  type MatchableVenture, type SearchCriteria,
} from "./saved-search";

function venture(over: Partial<MatchableVenture> = {}): MatchableVenture {
  return {
    slug: "v1",
    title: "Zuri Health",
    tagline: "Telehealth for Lagos.",
    sectors: ["healthtech", "fintech"],
    stage: "mvp",
    is_raising: true,
    raising_amount_usd: 250_000,
    region: "Nigeria",
    updated_at: "2026-06-10T00:00:00Z",
    ...over,
  };
}

// ── normalizeCriteria ─────────────────────────────────────────────

describe("normalizeCriteria", () => {
  it("returns EMPTY_CRITERIA for null/undefined input", () => {
    expect(normalizeCriteria(null)).toEqual(EMPTY_CRITERIA);
    expect(normalizeCriteria(undefined)).toEqual(EMPTY_CRITERIA);
  });

  it("trims, lowercases, dedupes sector slugs", () => {
    const c = normalizeCriteria({ sectors: ["  Climate ", "climate", "FinTech", "", null, 42] } as Record<string, unknown>);
    expect(c.sectors).toEqual(["climate", "fintech"]);
  });

  it("caps sector list at 12", () => {
    const c = normalizeCriteria({ sectors: Array.from({ length: 30 }, (_, i) => `s${i}`) });
    expect(c.sectors.length).toBe(12);
  });

  it("rejects invalid stage values silently", () => {
    expect(normalizeCriteria({ stage: "yolo" } as Record<string, unknown>).stage).toBeNull();
    for (const s of VALID_STAGES) {
      expect(normalizeCriteria({ stage: s }).stage).toBe(s);
    }
  });

  it("trims region and bounds length", () => {
    expect(normalizeCriteria({ region: "  Nigeria  " }).region).toBe("Nigeria");
    expect(normalizeCriteria({ region: "x".repeat(200) }).region!.length).toBe(60);
  });

  it("accepts true / '1' / 1 for raisingOnly", () => {
    expect(normalizeCriteria({ raisingOnly: true }).raisingOnly).toBe(true);
    expect(normalizeCriteria({ raisingOnly: "1" } as Record<string, unknown>).raisingOnly).toBe(true);
    expect(normalizeCriteria({ raisingOnly: 1 } as Record<string, unknown>).raisingOnly).toBe(true);
    expect(normalizeCriteria({ raisingOnly: false }).raisingOnly).toBe(false);
    expect(normalizeCriteria({ raisingOnly: "true" } as Record<string, unknown>).raisingOnly).toBe(false);
  });

  it("floors raise bounds and rejects negatives", () => {
    expect(normalizeCriteria({ minRaiseUsd: 250.7 }).minRaiseUsd).toBe(250);
    expect(normalizeCriteria({ minRaiseUsd: -5 }).minRaiseUsd).toBeNull();
    expect(normalizeCriteria({ minRaiseUsd: NaN }).minRaiseUsd).toBeNull();
  });

  it("swaps min/max if user reversed them", () => {
    const c = normalizeCriteria({ minRaiseUsd: 500_000, maxRaiseUsd: 100_000 });
    expect(c.minRaiseUsd).toBe(100_000);
    expect(c.maxRaiseUsd).toBe(500_000);
  });

  it("clamps q to 120 chars and nulls empty input", () => {
    expect(normalizeCriteria({ q: "" }).q).toBeNull();
    expect(normalizeCriteria({ q: "  " }).q).toBeNull();
    expect(normalizeCriteria({ q: "x".repeat(300) }).q!.length).toBe(120);
  });
});

// ── hasAnyFilter ──────────────────────────────────────────────────

describe("hasAnyFilter", () => {
  it("is false for EMPTY_CRITERIA", () => {
    expect(hasAnyFilter(EMPTY_CRITERIA)).toBe(false);
  });

  it("is true when any single filter is set", () => {
    expect(hasAnyFilter({ ...EMPTY_CRITERIA, sectors: ["climate"] })).toBe(true);
    expect(hasAnyFilter({ ...EMPTY_CRITERIA, stage: "mvp" })).toBe(true);
    expect(hasAnyFilter({ ...EMPTY_CRITERIA, region: "Nigeria" })).toBe(true);
    expect(hasAnyFilter({ ...EMPTY_CRITERIA, raisingOnly: true })).toBe(true);
    expect(hasAnyFilter({ ...EMPTY_CRITERIA, minRaiseUsd: 1 })).toBe(true);
    expect(hasAnyFilter({ ...EMPTY_CRITERIA, maxRaiseUsd: 100_000 })).toBe(true);
    expect(hasAnyFilter({ ...EMPTY_CRITERIA, q: "saas" })).toBe(true);
  });
});

// ── matchVenture ──────────────────────────────────────────────────

describe("matchVenture", () => {
  it("EMPTY_CRITERIA matches everything", () => {
    expect(matchVenture(venture(), EMPTY_CRITERIA)).toBe(true);
  });

  it("raisingOnly excludes non-raising ventures", () => {
    const c: SearchCriteria = { ...EMPTY_CRITERIA, raisingOnly: true };
    expect(matchVenture(venture({ is_raising: false }), c)).toBe(false);
    expect(matchVenture(venture({ is_raising: true }), c)).toBe(true);
  });

  it("stage requires exact match", () => {
    const c: SearchCriteria = { ...EMPTY_CRITERIA, stage: "mvp" };
    expect(matchVenture(venture({ stage: "mvp" }), c)).toBe(true);
    expect(matchVenture(venture({ stage: "launch" }), c)).toBe(false);
  });

  it("region is case-insensitive", () => {
    const c: SearchCriteria = { ...EMPTY_CRITERIA, region: "nigeria" };
    expect(matchVenture(venture({ region: "Nigeria" }), c)).toBe(true);
    expect(matchVenture(venture({ region: "Ghana" }), c)).toBe(false);
    expect(matchVenture(venture({ region: null }), c)).toBe(false);
  });

  it("sectors match ANY (not all)", () => {
    const c: SearchCriteria = { ...EMPTY_CRITERIA, sectors: ["climate", "fintech"] };
    expect(matchVenture(venture({ sectors: ["fintech"] }), c)).toBe(true);
    expect(matchVenture(venture({ sectors: ["agritech"] }), c)).toBe(false);
  });

  it("sector matching is case-insensitive", () => {
    const c: SearchCriteria = { ...EMPTY_CRITERIA, sectors: ["fintech"] };
    expect(matchVenture(venture({ sectors: ["Fintech"] }), c)).toBe(true);
    expect(matchVenture(venture({ sectors: ["FINTECH"] }), c)).toBe(true);
  });

  it("raise bounds are inclusive and skip null asks", () => {
    expect(matchVenture(venture({ raising_amount_usd: 100_000 }), { ...EMPTY_CRITERIA, minRaiseUsd: 100_000 })).toBe(true);
    expect(matchVenture(venture({ raising_amount_usd: 99_999 }), { ...EMPTY_CRITERIA, minRaiseUsd: 100_000 })).toBe(false);
    expect(matchVenture(venture({ raising_amount_usd: 500_000 }), { ...EMPTY_CRITERIA, maxRaiseUsd: 500_000 })).toBe(true);
    expect(matchVenture(venture({ raising_amount_usd: 500_001 }), { ...EMPTY_CRITERIA, maxRaiseUsd: 500_000 })).toBe(false);
    // null ask is treated as unknown → included.
    expect(matchVenture(venture({ raising_amount_usd: null }), { ...EMPTY_CRITERIA, minRaiseUsd: 100_000 })).toBe(true);
  });

  it("free-text q searches title + tagline (case-insensitive)", () => {
    const c: SearchCriteria = { ...EMPTY_CRITERIA, q: "lagos" };
    expect(matchVenture(venture({ tagline: "Telehealth for Lagos." }), c)).toBe(true);
    expect(matchVenture(venture({ tagline: "Healthcare for Kenya." }), c)).toBe(false);
  });

  it("multiple criteria are ANDed", () => {
    const c: SearchCriteria = { ...EMPTY_CRITERIA, sectors: ["fintech"], stage: "mvp", raisingOnly: true };
    expect(matchVenture(venture(), c)).toBe(true);
    expect(matchVenture(venture({ stage: "launch" }), c)).toBe(false);
    expect(matchVenture(venture({ is_raising: false }), c)).toBe(false);
  });
});

// ── filterMatchingVentures ────────────────────────────────────────

describe("filterMatchingVentures", () => {
  it("preserves input order", () => {
    const a = venture({ slug: "a" });
    const b = venture({ slug: "b" });
    const c = venture({ slug: "c", sectors: ["education"] });
    const out = filterMatchingVentures([a, b, c], { ...EMPTY_CRITERIA, sectors: ["fintech"] });
    expect(out.map((v) => v.slug)).toEqual(["a", "b"]);
  });
});

// ── summarizeCriteria + stageLabel ────────────────────────────────

describe("summarizeCriteria", () => {
  it("returns 'All ventures' when no filter is set", () => {
    expect(summarizeCriteria(EMPTY_CRITERIA)).toBe("All ventures");
  });

  it("formats sectors with +N overflow", () => {
    const c: SearchCriteria = { ...EMPTY_CRITERIA, sectors: ["fintech", "climate", "edtech", "health", "agri"] };
    expect(summarizeCriteria(c)).toBe("Fintech, Climate, Edtech +2");
  });

  it("formats raise bounds in $k / $M", () => {
    expect(summarizeCriteria({ ...EMPTY_CRITERIA, minRaiseUsd: 200_000 })).toContain("$200k+");
    expect(summarizeCriteria({ ...EMPTY_CRITERIA, maxRaiseUsd: 1_000_000 })).toContain("up to $1M");
    expect(summarizeCriteria({ ...EMPTY_CRITERIA, minRaiseUsd: 200_000, maxRaiseUsd: 500_000 })).toContain("$200k–$500k");
    expect(summarizeCriteria({ ...EMPTY_CRITERIA, raisingOnly: true })).toContain("raising now");
  });

  it("joins parts with '·'", () => {
    const c: SearchCriteria = { ...EMPTY_CRITERIA, sectors: ["fintech"], stage: "mvp", region: "Nigeria", raisingOnly: true };
    expect(summarizeCriteria(c)).toBe("Fintech · MVP · Nigeria · raising now");
  });

  it("includes the q phrase quoted", () => {
    expect(summarizeCriteria({ ...EMPTY_CRITERIA, q: "diaspora" })).toBe('"diaspora"');
  });

  it("stageLabel returns 'Any stage' for null", () => {
    expect(stageLabel(null)).toBe("Any stage");
    expect(stageLabel("mvp")).toBe("MVP");
    expect(stageLabel("scale")).toBe("Scale");
  });
});

// ── suggestTitle ──────────────────────────────────────────────────

describe("suggestTitle", () => {
  it("returns 'All ventures' for empty criteria", () => {
    expect(suggestTitle(EMPTY_CRITERIA)).toBe("All ventures");
  });

  it("truncates over 80 chars with an ellipsis", () => {
    const c: SearchCriteria = { ...EMPTY_CRITERIA, sectors: ["climate", "fintech", "agritech", "edtech", "logistics", "marketplace", "saas"] };
    const t = suggestTitle(c);
    expect(t.length).toBeLessThanOrEqual(80);
  });
});
