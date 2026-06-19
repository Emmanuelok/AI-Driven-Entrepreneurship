import { describe, it, expect } from "vitest";
import {
  canTransitionStatus, validNextStatuses,
  canTransitionMemberState, validNextMemberStates,
  isAcceptingEnrollment, isLive,
  seatsRemaining, cohortCalendarProgress, statusLabel,
} from "./cohort-state";

describe("status transitions", () => {
  it("happy path is draft → open → running → ended → archived", () => {
    expect(canTransitionStatus("draft", "open")).toBe(true);
    expect(canTransitionStatus("open", "running")).toBe(true);
    expect(canTransitionStatus("running", "ended")).toBe(true);
    expect(canTransitionStatus("ended", "archived")).toBe(true);
  });

  it("rejects same-state transitions", () => {
    for (const s of ["draft", "open", "running", "ended", "archived"] as const) {
      expect(canTransitionStatus(s, s)).toBe(false);
    }
  });

  it("allows opening enrollment back from running", () => {
    expect(canTransitionStatus("running", "open")).toBe(true);
  });

  it("does NOT allow draft → running directly (must pass through open)", () => {
    expect(canTransitionStatus("draft", "running")).toBe(false);
  });

  it("ended → running re-opens a cohort for late wrap-up", () => {
    expect(canTransitionStatus("ended", "running")).toBe(true);
  });

  it("archived → draft restores", () => {
    expect(canTransitionStatus("archived", "draft")).toBe(true);
    expect(canTransitionStatus("archived", "running")).toBe(false);
  });

  it("validNextStatuses excludes the current status", () => {
    const next = validNextStatuses("open");
    expect(next).not.toContain("open");
    expect(next).toEqual(expect.arrayContaining(["running", "draft", "archived"]));
  });
});

describe("member state transitions", () => {
  it("invited → active is the accept path; invited → dropped is the decline path", () => {
    expect(canTransitionMemberState("invited", "active")).toBe(true);
    expect(canTransitionMemberState("invited", "dropped")).toBe(true);
  });

  it("active students can be completed or dropped but NOT moved back to invited", () => {
    expect(canTransitionMemberState("active", "completed")).toBe(true);
    expect(canTransitionMemberState("active", "dropped")).toBe(true);
    expect(canTransitionMemberState("active", "invited")).toBe(false);
  });

  it("a dropped or completed student can be reactivated", () => {
    expect(canTransitionMemberState("dropped", "active")).toBe(true);
    expect(canTransitionMemberState("completed", "active")).toBe(true);
  });

  it("can't go from completed to dropped (semantic conflict)", () => {
    expect(canTransitionMemberState("completed", "dropped")).toBe(false);
  });

  it("validNextMemberStates returns the right buckets", () => {
    expect(validNextMemberStates("invited").sort()).toEqual(["active", "dropped"]);
    expect(validNextMemberStates("active").sort()).toEqual(["completed", "dropped"]);
  });
});

describe("isAcceptingEnrollment + isLive", () => {
  it("only 'open' accepts enrollment", () => {
    expect(isAcceptingEnrollment("open")).toBe(true);
    expect(isAcceptingEnrollment("draft")).toBe(false);
    expect(isAcceptingEnrollment("running")).toBe(false);
    expect(isAcceptingEnrollment("ended")).toBe(false);
    expect(isAcceptingEnrollment("archived")).toBe(false);
  });

  it("'open' and 'running' are live", () => {
    expect(isLive("open")).toBe(true);
    expect(isLive("running")).toBe(true);
    expect(isLive("draft")).toBe(false);
    expect(isLive("ended")).toBe(false);
    expect(isLive("archived")).toBe(false);
  });
});

describe("seatsRemaining", () => {
  it("returns null when capacity is null", () => {
    expect(seatsRemaining(null, 10)).toBeNull();
    expect(seatsRemaining(undefined, 10)).toBeNull();
  });

  it("returns capacity minus occupied, never negative", () => {
    expect(seatsRemaining(30, 5)).toBe(25);
    expect(seatsRemaining(10, 10)).toBe(0);
    expect(seatsRemaining(10, 12)).toBe(0); // never negative
  });
});

describe("cohortCalendarProgress", () => {
  it("returns null when either date is missing", () => {
    expect(cohortCalendarProgress(null, "2026-12-01")).toBeNull();
    expect(cohortCalendarProgress("2026-01-01", null)).toBeNull();
  });

  it("returns null when end <= start", () => {
    expect(cohortCalendarProgress("2026-12-01", "2026-12-01")).toBeNull();
    expect(cohortCalendarProgress("2026-12-01", "2026-11-01")).toBeNull();
  });

  it("returns 0 progress at start, 1 at end, halfway in the middle", () => {
    const r1 = cohortCalendarProgress("2026-01-01", "2026-12-31", new Date("2026-01-01T00:00:00Z"));
    expect(r1!.progress).toBeCloseTo(0, 2);
    const r2 = cohortCalendarProgress("2026-01-01", "2026-12-31", new Date("2026-12-31T00:00:00Z"));
    expect(r2!.progress).toBeCloseTo(1, 2);
    const r3 = cohortCalendarProgress("2026-01-01", "2026-12-31", new Date("2026-07-02T00:00:00Z"));
    expect(r3!.progress).toBeGreaterThan(0.45);
    expect(r3!.progress).toBeLessThan(0.55);
  });

  it("computes week index for a 12-week cohort correctly", () => {
    const start = "2026-01-01";
    const end = "2026-03-26"; // ~12 weeks
    const r = cohortCalendarProgress(start, end, new Date("2026-01-29T00:00:00Z"));
    // 4 weeks elapsed
    expect(r!.weekIndex).toBeGreaterThanOrEqual(3);
    expect(r!.weekIndex).toBeLessThanOrEqual(4);
    expect(r!.totalWeeks).toBeGreaterThanOrEqual(11);
    expect(r!.totalWeeks).toBeLessThanOrEqual(13);
  });

  it("clamps at the edges instead of going negative or over 1", () => {
    const before = cohortCalendarProgress("2026-01-01", "2026-12-31", new Date("2025-06-01T00:00:00Z"));
    expect(before!.progress).toBe(0);
    const after = cohortCalendarProgress("2026-01-01", "2026-12-31", new Date("2027-06-01T00:00:00Z"));
    expect(after!.progress).toBe(1);
  });
});

describe("statusLabel", () => {
  it("returns distinct human strings", () => {
    const labels = (["draft", "open", "running", "ended", "archived"] as const).map(statusLabel);
    expect(new Set(labels).size).toBe(5);
  });
});
