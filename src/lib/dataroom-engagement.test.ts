import { describe, it, expect } from "vitest";
import {
  scoreInvestor, aggregateVentureEngagement, temperatureMeta, engagementNudge,
  type GrantSignal,
} from "./dataroom-engagement";

const NOW = new Date("2026-06-15T12:00:00Z");

function grant(over: Partial<GrantSignal> = {}): GrantSignal {
  return {
    granteeUserId: "v1",
    grantedAt: "2026-06-01T00:00:00Z",
    expiresAt: "2026-12-01T00:00:00Z",
    revokedAt: null,
    firstViewedAt: null,
    lastViewedAt: null,
    viewCount: 0,
    ...over,
  };
}

describe("scoreInvestor", () => {
  it("classifies revoked grants regardless of views", () => {
    const s = scoreInvestor(grant({ revokedAt: "2026-06-10T00:00:00Z", viewCount: 9, firstViewedAt: "2026-06-09T00:00:00Z", lastViewedAt: "2026-06-14T00:00:00Z" }), NOW);
    expect(s.temperature).toBe("revoked");
  });

  it("classifies expired grants", () => {
    const s = scoreInvestor(grant({ expiresAt: "2026-06-01T00:00:00Z" }), NOW);
    expect(s.temperature).toBe("expired");
  });

  it("hot = viewed in last 7 days AND 2+ views", () => {
    const s = scoreInvestor(grant({
      firstViewedAt: "2026-06-10T00:00:00Z",
      lastViewedAt: "2026-06-14T00:00:00Z", // 1 day ago
      viewCount: 3,
    }), NOW);
    expect(s.temperature).toBe("hot");
  });

  it("warm = viewed but not recently/repeatedly enough for hot", () => {
    const s = scoreInvestor(grant({
      firstViewedAt: "2026-06-02T00:00:00Z",
      lastViewedAt: "2026-06-03T00:00:00Z", // 12 days ago
      viewCount: 1,
    }), NOW);
    expect(s.temperature).toBe("warm");
  });

  it("single recent view is warm, not hot (needs 2+)", () => {
    const s = scoreInvestor(grant({
      firstViewedAt: "2026-06-14T00:00:00Z",
      lastViewedAt: "2026-06-14T00:00:00Z",
      viewCount: 1,
    }), NOW);
    expect(s.temperature).toBe("warm");
  });

  it("cold = active grant never opened", () => {
    const s = scoreInvestor(grant(), NOW);
    expect(s.temperature).toBe("cold");
    expect(s.everViewed).toBe(false);
  });

  it("computes day deltas", () => {
    const s = scoreInvestor(grant({ lastViewedAt: "2026-06-10T12:00:00Z" }), NOW);
    expect(s.daysSinceLastView).toBe(5);
    expect(s.daysSinceGrant).toBe(14);
  });
});

describe("aggregateVentureEngagement", () => {
  it("returns zeros on empty", () => {
    const e = aggregateVentureEngagement([], NOW);
    expect(e.totalGrants).toBe(0);
    expect(e.engagementScore).toBe(0);
  });

  it("counts buckets + active grants correctly", () => {
    const e = aggregateVentureEngagement([
      grant({ granteeUserId: "hot", firstViewedAt: "2026-06-10T00:00:00Z", lastViewedAt: "2026-06-14T00:00:00Z", viewCount: 3 }),
      grant({ granteeUserId: "warm", firstViewedAt: "2026-06-02T00:00:00Z", lastViewedAt: "2026-06-03T00:00:00Z", viewCount: 1 }),
      grant({ granteeUserId: "cold" }),
      grant({ granteeUserId: "revoked", revokedAt: "2026-06-09T00:00:00Z" }),
      grant({ granteeUserId: "expired", expiresAt: "2026-06-01T00:00:00Z" }),
    ], NOW);
    expect(e.totalGrants).toBe(5);
    expect(e.activeGrants).toBe(3); // hot, warm, cold
    expect(e.viewedGrants).toBe(2); // hot, warm
    expect(e.hotCount).toBe(1);
    expect(e.warmCount).toBe(1);
    expect(e.coldCount).toBe(1);
    expect(e.totalViews).toBe(4);
  });

  it("engagement score rewards view-through + hot rate, capped 0-100", () => {
    // All 2 active grants viewed, 1 hot.
    const e = aggregateVentureEngagement([
      grant({ granteeUserId: "hot", firstViewedAt: "2026-06-10T00:00:00Z", lastViewedAt: "2026-06-14T00:00:00Z", viewCount: 3 }),
      grant({ granteeUserId: "warm", firstViewedAt: "2026-06-02T00:00:00Z", lastViewedAt: "2026-06-03T00:00:00Z", viewCount: 1 }),
    ], NOW);
    // viewThrough = 1.0 → 70, hotRate = 0.5 → 15, total 85
    expect(e.engagementScore).toBe(85);
  });

  it("all-cold venture scores zero engagement", () => {
    const e = aggregateVentureEngagement([grant(), grant({ granteeUserId: "v2" })], NOW);
    expect(e.engagementScore).toBe(0);
  });
});

describe("temperatureMeta + engagementNudge", () => {
  it("gives a distinct label per temperature", () => {
    const labels = (["hot", "warm", "cold", "expired", "revoked"] as const).map((t) => temperatureMeta(t).label);
    expect(new Set(labels).size).toBe(5);
  });

  it("nudges sensibly per aggregate state", () => {
    expect(engagementNudge(aggregateVentureEngagement([], NOW))).toContain("No investors invited");
    const allCold = aggregateVentureEngagement([grant(), grant({ granteeUserId: "v2" })], NOW);
    expect(engagementNudge(allCold)).toContain("opened the room");
    const hot = aggregateVentureEngagement([
      grant({ firstViewedAt: "2026-06-10T00:00:00Z", lastViewedAt: "2026-06-14T00:00:00Z", viewCount: 3 }),
    ], NOW);
    expect(engagementNudge(hot)).toContain("actively reviewing");
  });
});
