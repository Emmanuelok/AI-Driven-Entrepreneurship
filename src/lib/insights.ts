// Pattern extraction from the user's connection graph. Shared between
// the /studio/connections/insights UI and the Site Brain snapshot so
// Sage and the patterns page are looking at the same numbers.
//
// All computation is pure: in → connection rows + local entity lists,
// out → a compact InsightsSummary. Cheap to call on every AI request.

import type { ConnectionRow } from "@/lib/connections";

export type InsightsSummary = {
  // Atlas problem with the most edges pointing at it (any direction).
  // null when no problem has been linked.
  topProblem: { id: string; degree: number } | null;
  // Ventures that have at least one sketch edge — "matured ideas".
  ventureFromSketch: { id: string; name: string }[];
  // Builds with zero connections of any kind.
  orphanBuilds: { id: string; name: string }[];
  // Coverage tallies for the header chip strip.
  byKind: Array<{ kind: string; count: number }>;
};

export function computeInsights(
  rows: ConnectionRow[],
  entities: {
    builds: { id: string; name: string }[];
    ventures: { id: string; name: string }[];
    sketches?: { id: string; title: string }[];
    letters?: { id: string; title: string }[];
  },
): InsightsSummary {
  // Degree of every problem id.
  const problemDegree = new Map<string, number>();
  // Connected build ids — anything appearing on either side.
  const connectedBuildIds = new Set<string>();
  // Sketch→Venture edges (either direction).
  const sketchVentureEdges = new Map<string, string>(); // venture_id → sketch_id

  const byKind = new Map<string, number>();

  for (const r of rows) {
    byKind.set(r.from_kind, (byKind.get(r.from_kind) ?? 0) + 1);
    byKind.set(r.to_kind, (byKind.get(r.to_kind) ?? 0) + 1);

    if (r.from_kind === "problem") problemDegree.set(r.from_id, (problemDegree.get(r.from_id) ?? 0) + 1);
    if (r.to_kind === "problem") problemDegree.set(r.to_id, (problemDegree.get(r.to_id) ?? 0) + 1);

    if (r.from_kind === "build") connectedBuildIds.add(r.from_id);
    if (r.to_kind === "build") connectedBuildIds.add(r.to_id);

    if (r.from_kind === "sketch" && r.to_kind === "venture") sketchVentureEdges.set(r.to_id, r.from_id);
    if (r.from_kind === "venture" && r.to_kind === "sketch") sketchVentureEdges.set(r.from_id, r.to_id);
  }

  const top = Array.from(problemDegree.entries()).sort((a, b) => b[1] - a[1])[0];
  const topProblem = top ? { id: top[0], degree: top[1] } : null;

  const ventureFromSketch = Array.from(sketchVentureEdges.keys()).map((vid) => ({
    id: vid,
    name: entities.ventures.find((v) => v.id === vid)?.name ?? vid.slice(0, 12),
  }));

  const orphanBuilds = entities.builds
    .filter((b) => !connectedBuildIds.has(b.id))
    .map((b) => ({ id: b.id, name: b.name }));

  const byKindArr = Array.from(byKind.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([kind, count]) => ({ kind, count }));

  return { topProblem, ventureFromSketch, orphanBuilds, byKind: byKindArr };
}
