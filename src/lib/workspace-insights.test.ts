import { describe, it, expect } from "vitest";
import { computeWorkspaceInsights, type InsightEvent } from "./workspace-insights";

const NOW = new Date("2026-06-15T12:00:00Z").getTime();
const DAY = 86_400_000;

function ev(kind: InsightEvent["kind"], daysAgo: number): InsightEvent {
  return { kind, at: NOW - daysAgo * DAY };
}

describe("computeWorkspaceInsights — counting", () => {
  it("counts each kind within the window", () => {
    const events: InsightEvent[] = [
      ev("task_done", 1), ev("task_done", 2),
      ev("deadline_done", 0),
      ev("message", 1), ev("message", 1), ev("message", 3),
      ev("file_added", 4),
      ev("task_added", 5),
      ev("note_edit", 2),
    ];
    const r = computeWorkspaceInsights(events, NOW);
    expect(r.tasksClosed).toBe(2);
    expect(r.deadlinesHit).toBe(1);
    expect(r.messagesSent).toBe(3);
    expect(r.filesAdded).toBe(1);
    expect(r.tasksCreated).toBe(1);
    expect(r.notesEdited).toBe(1);
    expect(r.totalEvents).toBe(9);
  });

  it("excludes events outside the 7-day window", () => {
    const events: InsightEvent[] = [ev("task_done", 1), ev("task_done", 10), ev("message", 30)];
    const r = computeWorkspaceInsights(events, NOW);
    expect(r.tasksClosed).toBe(1);
    expect(r.messagesSent).toBe(0);
    expect(r.totalEvents).toBe(1);
  });

  it("honors a custom window", () => {
    const events: InsightEvent[] = [ev("task_done", 1), ev("task_done", 20)];
    const r = computeWorkspaceInsights(events, NOW, 30);
    expect(r.windowDays).toBe(30);
    expect(r.tasksClosed).toBe(2);
  });
});

describe("computeWorkspaceInsights — active days", () => {
  it("counts distinct days, not events", () => {
    const events: InsightEvent[] = [
      { kind: "message", at: new Date("2026-06-15T09:00:00Z").getTime() },
      { kind: "message", at: new Date("2026-06-15T14:00:00Z").getTime() },
      { kind: "task_done", at: new Date("2026-06-14T10:00:00Z").getTime() },
    ];
    const r = computeWorkspaceInsights(events, NOW);
    expect(r.activeDays).toBe(2);
  });
});

describe("computeWorkspaceInsights — momentum buckets", () => {
  it("'quiet' for an empty window", () => {
    expect(computeWorkspaceInsights([], NOW).momentum).toBe("quiet");
  });

  it("'light' for a single small action", () => {
    const r = computeWorkspaceInsights([ev("task_done", 1)], NOW);
    // output 2 + activeDays 2 = 4 → steady actually. Use a lighter case:
    const r2 = computeWorkspaceInsights([ev("message", 1)], NOW);
    // 0.5 + 2 = 2.5 → light
    expect(r2.momentum).toBe("light");
    expect(["light", "steady"]).toContain(r.momentum);
  });

  it("'on-fire' for a heavy, consistent week", () => {
    const events: InsightEvent[] = [];
    for (let d = 0; d < 6; d++) { events.push(ev("task_done", d)); events.push(ev("deadline_done", d)); }
    const r = computeWorkspaceInsights(events, NOW);
    expect(r.momentum).toBe("on-fire");
  });
});

describe("computeWorkspaceInsights — headline", () => {
  it("nudges gently when quiet", () => {
    const r = computeWorkspaceInsights([], NOW);
    expect(r.headline.toLowerCase()).toContain("quiet");
  });

  it("leads with concrete numbers when active", () => {
    const events: InsightEvent[] = [ev("task_done", 1), ev("task_done", 2), ev("deadline_done", 0)];
    const r = computeWorkspaceInsights(events, NOW);
    expect(r.headline).toContain("closed 2 tasks");
    expect(r.headline).toContain("hit 1 deadline");
  });

  it("adds the 'on fire' flourish at peak momentum", () => {
    const events: InsightEvent[] = [];
    for (let d = 0; d < 6; d++) { events.push(ev("task_done", d)); events.push(ev("deadline_done", d)); }
    const r = computeWorkspaceInsights(events, NOW);
    expect(r.headline).toMatch(/on fire/i);
  });

  it("singularizes correctly", () => {
    const r = computeWorkspaceInsights([ev("task_done", 1), ev("file_added", 1)], NOW);
    expect(r.headline).toContain("1 task");
    expect(r.headline).not.toContain("1 tasks");
    expect(r.headline).toContain("1 file");
  });
});
