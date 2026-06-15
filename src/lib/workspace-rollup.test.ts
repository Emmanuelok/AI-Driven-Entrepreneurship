import { describe, it, expect } from "vitest";
import { classifyWorkspace, rollup, healthLabel, type RollupInputWorkspace } from "./workspace-rollup";

const NOW = new Date(2026, 5, 15, 12).getTime();
const DAY = 86_400_000;

function ws(over: Partial<RollupInputWorkspace>): RollupInputWorkspace {
  return {
    id: "w",
    title: "T",
    accent: "emerald",
    kind: "study_group",
    member_count: 5,
    open_tasks: 4,
    done_tasks_7d: 2,
    open_deadlines: 1,
    overdue_deadlines: 0,
    last_activity_at: new Date(NOW - DAY).toISOString(),
    ...over,
  };
}

describe("classifyWorkspace", () => {
  it("flags 'thriving' when activity is fresh and tasks are closing", () => {
    const c = classifyWorkspace(ws({ last_activity_at: new Date(NOW - 2 * DAY).toISOString(), done_tasks_7d: 3 }), NOW);
    expect(c.health).toBe("thriving");
    expect(c.daysSinceActivity).toBe(2);
  });

  it("downgrades to 'steady' when there's recent activity but no closures", () => {
    const c = classifyWorkspace(ws({ last_activity_at: new Date(NOW - 2 * DAY).toISOString(), done_tasks_7d: 0 }), NOW);
    expect(c.health).toBe("steady");
  });

  it("calls activity 8-21 days back 'quiet'", () => {
    const c = classifyWorkspace(ws({ last_activity_at: new Date(NOW - 14 * DAY).toISOString(), done_tasks_7d: 0 }), NOW);
    expect(c.health).toBe("quiet");
    expect(c.daysSinceActivity).toBe(14);
  });

  it("calls 21+ day silence 'stalled'", () => {
    const c = classifyWorkspace(ws({ last_activity_at: new Date(NOW - 40 * DAY).toISOString() }), NOW);
    expect(c.health).toBe("stalled");
  });

  it("treats never-touched workspaces as 'stalled' with null days", () => {
    const c = classifyWorkspace(ws({ last_activity_at: null }), NOW);
    expect(c.health).toBe("stalled");
    expect(c.daysSinceActivity).toBeNull();
  });
});

describe("rollup", () => {
  it("aggregates totals correctly", () => {
    const out = rollup([
      ws({ id: "a", member_count: 4, open_tasks: 3, done_tasks_7d: 2, open_deadlines: 2, overdue_deadlines: 1, last_activity_at: new Date(NOW - DAY).toISOString() }),
      ws({ id: "b", member_count: 6, open_tasks: 1, done_tasks_7d: 0, open_deadlines: 0, overdue_deadlines: 0, last_activity_at: new Date(NOW - 30 * DAY).toISOString() }),
    ], NOW);
    expect(out.totals.workspaces).toBe(2);
    expect(out.totals.members).toBe(10);
    expect(out.totals.openTasks).toBe(4);
    expect(out.totals.doneTasks7d).toBe(2);
    expect(out.totals.overdueDeadlines).toBe(1);
    expect(out.totals.stalled).toBe(1);
  });

  it("sorts overdue + stalled to the top", () => {
    const out = rollup([
      ws({ id: "fine", title: "Healthy", overdue_deadlines: 0, last_activity_at: new Date(NOW - DAY).toISOString(), done_tasks_7d: 4 }),
      ws({ id: "burn", title: "Burning", overdue_deadlines: 3, last_activity_at: new Date(NOW - 60 * DAY).toISOString() }),
      ws({ id: "stale", title: "Stalled", overdue_deadlines: 0, last_activity_at: new Date(NOW - 40 * DAY).toISOString() }),
    ], NOW);
    expect(out.rows.map((r) => r.id)).toEqual(["burn", "stale", "fine"]);
  });

  it("emits empty totals for an empty input", () => {
    const out = rollup([], NOW);
    expect(out.totals).toEqual({ workspaces: 0, members: 0, openTasks: 0, doneTasks7d: 0, openDeadlines: 0, overdueDeadlines: 0, thriving: 0, steady: 0, quiet: 0, stalled: 0 });
    expect(out.rows.length).toBe(0);
  });
});

describe("healthLabel", () => {
  it("maps each health bucket to a tone", () => {
    expect(healthLabel("thriving").tone).toBe("emerald");
    expect(healthLabel("quiet").tone).toBe("amber");
    expect(healthLabel("stalled").tone).toBe("rust");
  });
});
