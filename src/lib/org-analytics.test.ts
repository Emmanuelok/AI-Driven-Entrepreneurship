import { describe, it, expect } from "vitest";
import { computeOrgRollup, type CohortRow, type CohortMemberRow, type ProgressRow, type AssignmentRow } from "./org-analytics";

// Fixed clock for deterministic at-risk / momentum.
const NOW = new Date("2026-06-15T12:00:00Z");

function isoDaysAgo(n: number): string {
  return new Date(NOW.getTime() - n * 86_400_000).toISOString();
}

function cohort(over: Partial<CohortRow>): CohortRow {
  return { id: "c1", name: "Cohort", status: "running", start_date: null, end_date: null, capacity: null, ...over };
}
function mem(over: Partial<CohortMemberRow>): CohortMemberRow {
  return {
    cohort_id: "c1", user_id: "u1", role: "student", state: "active",
    joined_at: isoDaysAgo(30), completed_at: null, dropped_at: null, ...over,
  };
}

describe("computeOrgRollup — totals", () => {
  it("counts cohorts by status", () => {
    const r = computeOrgRollup({
      cohorts: [
        cohort({ id: "c1", status: "running" }),
        cohort({ id: "c2", status: "open" }),
        cohort({ id: "c3", status: "ended" }),
        cohort({ id: "c4", status: "draft" }),
        cohort({ id: "c5", status: "archived" }),
      ],
      members: [], progress: [], assignments: [], now: NOW,
    });
    expect(r.totals.cohorts).toBe(5);
    expect(r.totals.cohortsRunning).toBe(1);
    expect(r.totals.cohortsOpen).toBe(1);
    expect(r.totals.cohortsEnded).toBe(1);
    expect(r.totals.cohortsDraftOrArchived).toBe(2);
  });

  it("sums students across cohorts respecting state", () => {
    const r = computeOrgRollup({
      cohorts: [cohort({})],
      members: [
        mem({ user_id: "a", state: "active" }),
        mem({ user_id: "b", state: "invited" }),
        mem({ user_id: "c", state: "completed" }),
        mem({ user_id: "d", state: "dropped" }),
        mem({ user_id: "i1", role: "instructor", state: "active" }),
      ],
      progress: [], assignments: [], now: NOW,
    });
    expect(r.totals.students).toBe(4);
    expect(r.totals.instructors).toBe(1);
    expect(r.totals.completedStudents).toBe(1);
    expect(r.totals.droppedStudents).toBe(1);
  });

  it("computes completion rate as completed / (completed + dropped + active)", () => {
    const r = computeOrgRollup({
      cohorts: [cohort({})],
      members: [
        ...Array.from({ length: 7 }, (_, i) => mem({ user_id: `a${i}`, state: "completed" })),
        ...Array.from({ length: 2 }, (_, i) => mem({ user_id: `b${i}`, state: "dropped" })),
        ...Array.from({ length: 1 }, (_, i) => mem({ user_id: `c${i}`, state: "active" })),
      ],
      progress: [], assignments: [], now: NOW,
    });
    expect(r.totals.completionRatePct).toBe(70); // 7 / 10
  });

  it("computes avg cohort fill across cohorts that set capacity", () => {
    const r = computeOrgRollup({
      cohorts: [
        cohort({ id: "c1", capacity: 10 }),
        cohort({ id: "c2", capacity: 20 }),
        cohort({ id: "c3", capacity: null }),  // omit from avg
      ],
      members: [
        ...Array.from({ length: 5 }, (_, i) => mem({ cohort_id: "c1", user_id: `a${i}`, state: "active" })),
        ...Array.from({ length: 10 }, (_, i) => mem({ cohort_id: "c2", user_id: `b${i}`, state: "active" })),
      ],
      progress: [], assignments: [], now: NOW,
    });
    // c1: 5/10 = 50%, c2: 10/20 = 50%, c3 excluded → avg 50
    expect(r.totals.avgCohortFillPct).toBe(50);
  });

  it("returns null avg fill when no cohort has capacity", () => {
    const r = computeOrgRollup({
      cohorts: [cohort({ capacity: null })],
      members: [], progress: [], assignments: [], now: NOW,
    });
    expect(r.totals.avgCohortFillPct).toBeNull();
  });
});

describe("computeOrgRollup — per-cohort momentum + at-risk", () => {
  it("counts students with progress in last 7 days as momentum", () => {
    const r = computeOrgRollup({
      cohorts: [cohort({})],
      members: [
        mem({ user_id: "a" }),
        mem({ user_id: "b" }),
        mem({ user_id: "c" }),
      ],
      progress: [
        { cohort_id: "c1", user_id: "a", assignment_id: "x", status: "in_progress", updated_at: isoDaysAgo(2) },
        { cohort_id: "c1", user_id: "b", assignment_id: "x", status: "in_progress", updated_at: isoDaysAgo(6) },
        { cohort_id: "c1", user_id: "c", assignment_id: "x", status: "in_progress", updated_at: isoDaysAgo(10) },
      ],
      assignments: [], now: NOW,
    });
    expect(r.cohorts[0].momentumLast7Days).toBe(2);
  });

  it("flags active students with no progress in 14 days as at-risk", () => {
    const r = computeOrgRollup({
      cohorts: [cohort({})],
      members: [
        mem({ user_id: "a" }),
        mem({ user_id: "b" }),
        mem({ user_id: "c" }),
      ],
      progress: [
        { cohort_id: "c1", user_id: "a", assignment_id: "x", status: "in_progress", updated_at: isoDaysAgo(2) },
        { cohort_id: "c1", user_id: "b", assignment_id: "x", status: "in_progress", updated_at: isoDaysAgo(20) },
        // c has no progress at all
      ],
      assignments: [], now: NOW,
    });
    expect(r.cohorts[0].atRiskCount).toBe(2); // b + c
  });

  it("does not count completed/dropped students as at-risk", () => {
    const r = computeOrgRollup({
      cohorts: [cohort({})],
      members: [
        mem({ user_id: "a", state: "completed" }),
        mem({ user_id: "b", state: "dropped" }),
        mem({ user_id: "c", state: "active" }),
      ],
      progress: [], assignments: [], now: NOW,
    });
    expect(r.cohorts[0].atRiskCount).toBe(1); // only c
  });
});

describe("computeOrgRollup — cohort cards sort", () => {
  it("orders by status (running > open > ended > archived/draft) then by student count desc", () => {
    const r = computeOrgRollup({
      cohorts: [
        cohort({ id: "draft1", status: "draft" }),
        cohort({ id: "open1", status: "open" }),
        cohort({ id: "run-small", status: "running" }),
        cohort({ id: "run-big", status: "running" }),
        cohort({ id: "ended1", status: "ended" }),
      ],
      members: [
        mem({ cohort_id: "run-small", user_id: "a", state: "active" }),
        ...Array.from({ length: 4 }, (_, i) => mem({ cohort_id: "run-big", user_id: `b${i}`, state: "active" })),
      ],
      progress: [], assignments: [], now: NOW,
    });
    expect(r.cohorts.map((c) => c.id)).toEqual(["run-big", "run-small", "open1", "ended1", "draft1"]);
  });
});

describe("computeOrgRollup — atRiskCohorts list", () => {
  it("surfaces up to 5 cohorts with at-risk count desc, filtering out zero-count ones", () => {
    const r = computeOrgRollup({
      cohorts: Array.from({ length: 7 }, (_, i) => cohort({ id: `c${i}`, status: "running" })),
      members: [
        // c0: 3 at-risk
        ...Array.from({ length: 3 }, (_, i) => mem({ cohort_id: "c0", user_id: `c0u${i}` })),
        // c1: 1 at-risk
        mem({ cohort_id: "c1", user_id: "c1u" }),
        // c5: 2 at-risk
        ...Array.from({ length: 2 }, (_, i) => mem({ cohort_id: "c5", user_id: `c5u${i}` })),
        // c2/c3/c4/c6 have no students
      ],
      progress: [], assignments: [], now: NOW,
    });
    expect(r.atRiskCohorts.map((c) => c.id)).toEqual(["c0", "c5", "c1"]);
  });
});
