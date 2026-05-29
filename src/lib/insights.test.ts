import { describe, it, expect } from "vitest";
import { computeInsights, insightStarter } from "./insights";
import type { ConnectionRow } from "./connections";

function edge(from: [string, string], to: [string, string], label: string | null = null): ConnectionRow {
  return {
    id: `${from[0]}:${from[1]}->${to[0]}:${to[1]}`,
    from_kind: from[0], from_id: from[1],
    to_kind: to[0], to_id: to[1],
    label,
    created_at: new Date().toISOString(),
  } as ConnectionRow;
}

describe("computeInsights", () => {
  it("returns empty insights for an empty graph", () => {
    const i = computeInsights([], { builds: [], ventures: [] });
    expect(i.topProblem).toBeNull();
    expect(i.ventureFromSketch).toEqual([]);
    expect(i.orphanBuilds).toEqual([]);
    expect(i.byKind).toEqual([]);
  });

  it("picks the most-connected problem regardless of edge direction", () => {
    const rows = [
      edge(["venture", "v1"], ["problem", "post-harvest-loss"], "tackles"),
      edge(["build", "b1"], ["problem", "post-harvest-loss"], "addresses"),
      edge(["problem", "vernacular-tutoring"], ["venture", "v2"], "tackled by"),
    ];
    const i = computeInsights(rows, { builds: [], ventures: [] });
    expect(i.topProblem).toEqual({ id: "post-harvest-loss", degree: 2 });
  });

  it("captures sketch→venture ancestry in either direction", () => {
    const rows = [
      edge(["sketch", "s1"], ["venture", "v1"], "seeded from"),
      edge(["venture", "v2"], ["sketch", "s2"], "drew from"),
    ];
    const i = computeInsights(rows, {
      builds: [],
      ventures: [{ id: "v1", name: "Lentil Co." }, { id: "v2", name: "Maize Co." }],
    });
    const names = i.ventureFromSketch.map((v) => v.name).sort();
    expect(names).toEqual(["Lentil Co.", "Maize Co."]);
  });

  it("flags builds with zero edges as orphans", () => {
    const rows = [
      edge(["build", "b-connected"], ["problem", "post-harvest-loss"]),
    ];
    const builds = [
      { id: "b-connected", name: "Connected" },
      { id: "b-orphan", name: "Lonely" },
    ];
    const i = computeInsights(rows, { builds, ventures: [] });
    expect(i.orphanBuilds.map((b) => b.id)).toEqual(["b-orphan"]);
  });

  it("returns null when no pattern is strong enough for a starter", () => {
    expect(insightStarter(null)).toBeNull();
    expect(insightStarter({ topProblem: null, ventureFromSketch: [], orphanBuilds: [], byKind: [] })).toBeNull();
    // degree 1 is not enough to claim a pattern
    expect(insightStarter({ topProblem: { id: "p1", degree: 1 }, ventureFromSketch: [], orphanBuilds: [], byKind: [] })).toBeNull();
  });

  it("starter prefers a pulled-toward problem over other patterns", () => {
    const s = insightStarter({
      topProblem: { id: "post-harvest-loss", degree: 3 },
      ventureFromSketch: [{ id: "v1", name: "Lentil Co." }],
      orphanBuilds: [{ id: "b1", name: "USSD" }],
      byKind: [],
    });
    expect(s).toContain("post-harvest-loss");
    expect(s).toContain("Ship Hour");
  });

  it("starter falls back to sketch ancestry when no strong problem", () => {
    const s = insightStarter({
      topProblem: null,
      ventureFromSketch: [{ id: "v1", name: "Lentil Co." }],
      orphanBuilds: [],
      byKind: [],
    });
    expect(s).toContain("Lentil Co.");
  });

  it("starter falls back to orphan build as last resort", () => {
    const s = insightStarter({
      topProblem: null,
      ventureFromSketch: [],
      orphanBuilds: [{ id: "b1", name: "Cold-chain Tracker" }],
      byKind: [],
    });
    expect(s).toContain("Cold-chain Tracker");
  });

  it("tallies endpoints from both sides for byKind coverage", () => {
    const rows = [
      edge(["sketch", "s1"], ["venture", "v1"]),
      edge(["venture", "v1"], ["problem", "p1"]),
    ];
    const i = computeInsights(rows, { builds: [], ventures: [] });
    const counts = Object.fromEntries(i.byKind.map((b) => [b.kind, b.count]));
    expect(counts.venture).toBe(2);     // appears on both edges
    expect(counts.sketch).toBe(1);
    expect(counts.problem).toBe(1);
  });
});
