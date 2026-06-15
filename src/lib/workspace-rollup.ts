// ─────────────────────────────────────────────────────────────────────────
// Cohort-of-workspaces aggregation.
//
// Pure functions over the rows an instructor's analytics page would
// fetch — workspaces they own, plus the tasks/deadlines/messages those
// workspaces contain. Returns per-workspace + totals so the page can
// render a roll-up without re-running the math in the view layer. Keeps
// everything testable without Supabase.
// ─────────────────────────────────────────────────────────────────────────

const DAY = 86_400_000;

export type RollupInputWorkspace = {
  id: string;
  title: string;
  accent: string;
  kind: string;
  member_count: number;
  open_tasks: number;
  done_tasks_7d: number;
  open_deadlines: number;
  overdue_deadlines: number;
  // ISO of the most recent activity row of any kind. null if the
  // workspace has never been touched.
  last_activity_at: string | null;
};

export type WorkspaceRollupRow = RollupInputWorkspace & {
  health: "thriving" | "steady" | "quiet" | "stalled";
  daysSinceActivity: number | null;
};

export type WorkspaceRollupTotals = {
  workspaces: number;
  members: number;
  openTasks: number;
  doneTasks7d: number;
  openDeadlines: number;
  overdueDeadlines: number;
  thriving: number;
  steady: number;
  quiet: number;
  stalled: number;
};

// Health buckets:
//   thriving — activity in the last 3 days AND at least one task closed
//              in the last week.
//   steady   — activity in the last 7 days OR any open deadline.
//   quiet    — activity in the last 21 days but no recent closures.
//   stalled  — no activity for 21+ days, or never touched.
export function classifyWorkspace(w: RollupInputWorkspace, now: number): { health: WorkspaceRollupRow["health"]; daysSinceActivity: number | null } {
  if (!w.last_activity_at) return { health: "stalled", daysSinceActivity: null };
  const t = new Date(w.last_activity_at).getTime();
  const days = Math.max(0, Math.floor((now - t) / DAY));
  if (days <= 3 && w.done_tasks_7d > 0) return { health: "thriving", daysSinceActivity: days };
  if (days <= 7) return { health: "steady", daysSinceActivity: days };
  if (days <= 21) return { health: "quiet", daysSinceActivity: days };
  return { health: "stalled", daysSinceActivity: days };
}

export function rollup(workspaces: RollupInputWorkspace[], now: number): {
  rows: WorkspaceRollupRow[];
  totals: WorkspaceRollupTotals;
} {
  const rows: WorkspaceRollupRow[] = workspaces.map((w) => {
    const c = classifyWorkspace(w, now);
    return { ...w, ...c };
  });

  // Sort: most-at-risk first (overdue → stalled → quiet → steady → thriving).
  const healthOrder: Record<WorkspaceRollupRow["health"], number> = { stalled: 0, quiet: 1, steady: 2, thriving: 3 };
  rows.sort((a, b) => {
    if (a.overdue_deadlines !== b.overdue_deadlines) return b.overdue_deadlines - a.overdue_deadlines;
    if (healthOrder[a.health] !== healthOrder[b.health]) return healthOrder[a.health] - healthOrder[b.health];
    return a.title.localeCompare(b.title);
  });

  const totals: WorkspaceRollupTotals = {
    workspaces: rows.length,
    members: rows.reduce((s, r) => s + r.member_count, 0),
    openTasks: rows.reduce((s, r) => s + r.open_tasks, 0),
    doneTasks7d: rows.reduce((s, r) => s + r.done_tasks_7d, 0),
    openDeadlines: rows.reduce((s, r) => s + r.open_deadlines, 0),
    overdueDeadlines: rows.reduce((s, r) => s + r.overdue_deadlines, 0),
    thriving: rows.filter((r) => r.health === "thriving").length,
    steady: rows.filter((r) => r.health === "steady").length,
    quiet: rows.filter((r) => r.health === "quiet").length,
    stalled: rows.filter((r) => r.health === "stalled").length,
  };

  return { rows, totals };
}

export function healthLabel(h: WorkspaceRollupRow["health"]): { label: string; tone: "emerald" | "amber" | "rust" | "muted" } {
  switch (h) {
    case "thriving": return { label: "Thriving", tone: "emerald" };
    case "steady": return { label: "Steady", tone: "emerald" };
    case "quiet": return { label: "Quiet", tone: "amber" };
    case "stalled": return { label: "Stalled", tone: "rust" };
  }
}
