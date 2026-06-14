import { describe, it, expect } from "vitest";
import { dueWindow, shouldRemind, windowLabel, setByLabel, relativeDue, type DeadlineRow } from "./deadline-schedule";

const NOW = new Date("2026-06-15T12:00:00Z").getTime();
const DAY = 86_400_000;
const HOUR = 3_600_000;

function row(over: Partial<DeadlineRow> = {}): DeadlineRow {
  return {
    id: "d1",
    workspace_id: "w1",
    assignee_user_id: "u1",
    title: "Submit revisions",
    due_at: new Date(NOW + 5 * DAY).toISOString(),
    status: "open",
    set_by_role: "self",
    last_reminded_at: null,
    ...over,
  };
}

describe("dueWindow", () => {
  it("returns 7d for due in ~5 days", () => {
    expect(dueWindow(row(), NOW)).toBe("7d");
  });
  it("returns 3d for due in 2 days", () => {
    expect(dueWindow(row({ due_at: new Date(NOW + 2 * DAY).toISOString() }), NOW)).toBe("3d");
  });
  it("returns 1d for due in 12 hours", () => {
    expect(dueWindow(row({ due_at: new Date(NOW + 12 * HOUR).toISOString() }), NOW)).toBe("1d");
  });
  it("returns 6h for due in 3 hours", () => {
    expect(dueWindow(row({ due_at: new Date(NOW + 3 * HOUR).toISOString() }), NOW)).toBe("6h");
  });
  it("returns overdue for an open deadline 6h past due", () => {
    expect(dueWindow(row({ due_at: new Date(NOW - 6 * HOUR).toISOString() }), NOW)).toBe("overdue");
  });
  it("falls silent for deadlines more than 24h overdue", () => {
    expect(dueWindow(row({ due_at: new Date(NOW - 2 * DAY).toISOString() }), NOW)).toBeNull();
  });
  it("falls silent for deadlines further than 7 days out", () => {
    expect(dueWindow(row({ due_at: new Date(NOW + 30 * DAY).toISOString() }), NOW)).toBeNull();
  });
  it("ignores closed deadlines", () => {
    expect(dueWindow(row({ status: "done" }), NOW)).toBeNull();
    expect(dueWindow(row({ status: "cancelled" }), NOW)).toBeNull();
  });
});

describe("shouldRemind", () => {
  it("fires for never-reminded windows", () => {
    expect(shouldRemind(row(), NOW)).toEqual({ window: "7d" });
  });
  it("dedupes within the window horizon", () => {
    const r = row({ last_reminded_at: new Date(NOW - 1 * DAY).toISOString() });
    expect(shouldRemind(r, NOW)).toBeNull(); // 7d horizon is 4d
  });
  it("re-fires after the window horizon passes", () => {
    const r = row({ last_reminded_at: new Date(NOW - 5 * DAY).toISOString() });
    expect(shouldRemind(r, NOW)).toEqual({ window: "7d" });
  });
  it("6h re-fires after 4h gap (failed delivery recovery)", () => {
    const r = row({
      due_at: new Date(NOW + 3 * HOUR).toISOString(),
      last_reminded_at: new Date(NOW - 5 * HOUR).toISOString(),
    });
    expect(shouldRemind(r, NOW)).toEqual({ window: "6h" });
  });
  it("overdue fires exactly once within 24h", () => {
    const fresh = row({ due_at: new Date(NOW - 2 * HOUR).toISOString() });
    expect(shouldRemind(fresh, NOW)).toEqual({ window: "overdue" });
    const already = row({
      due_at: new Date(NOW - 2 * HOUR).toISOString(),
      last_reminded_at: new Date(NOW - 1 * HOUR).toISOString(),
    });
    expect(shouldRemind(already, NOW)).toBeNull();
  });
});

describe("labels", () => {
  it("renders human window labels", () => {
    expect(windowLabel("7d")).toMatch(/week/);
    expect(windowLabel("1d")).toMatch(/Tomorrow/);
    expect(windowLabel("overdue")).toMatch(/Missed/);
  });

  it("tags the source of authority distinctly", () => {
    expect(setByLabel("self").tone).toBe("muted");
    expect(setByLabel("instructor").tone).toBe("amber");
    expect(setByLabel("funder").tone).toBe("rust");
    expect(setByLabel("investor").tone).toBe("rust");
    expect(setByLabel("journal").tone).toBe("indigo");
    expect(setByLabel("mentor").tone).toBe("emerald");
  });

  it("relative due reads naturally on both sides of the boundary", () => {
    expect(relativeDue(new Date(NOW + 3 * DAY), NOW)).toBe("in 3d");
    expect(relativeDue(new Date(NOW - 2 * HOUR), NOW)).toBe("overdue 2h");
    expect(relativeDue(new Date(NOW + 30 * 60_000), NOW)).toBe("in 30m");
  });
});
