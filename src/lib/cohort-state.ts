// Cohort lifecycle + member state primitives. Pure, testable, no DB.
//
// The lifecycle status governs what verbs are available on the cohort
// from the dashboard. The member state machine governs what surfaces
// each row sees. Both are checked server-side; client guards just
// avoid showing buttons that would 400 on submit.

export type CohortStatus = "draft" | "open" | "running" | "ended" | "archived";
export type CohortMemberState = "invited" | "active" | "dropped" | "completed";
export type CohortKind = "course" | "program" | "accelerator" | "bootcamp" | "study_group" | "other";
export type CohortVisibility = "private" | "link" | "public";

// What's a valid next status from the current one. Cohorts are typically
// linear (draft → open → running → ended → archived), but instructors
// can pull a running cohort back to 'open' to re-open enrollment, or
// archive a draft they no longer plan to run.
const STATUS_TRANSITIONS: Record<CohortStatus, CohortStatus[]> = {
  draft:    ["open", "archived"],
  open:     ["running", "draft", "archived"],
  running:  ["ended", "open"],
  ended:    ["archived", "running"],
  archived: ["draft"],
};

export function canTransitionStatus(from: CohortStatus, to: CohortStatus): boolean {
  if (from === to) return false;
  return STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

export function validNextStatuses(from: CohortStatus): CohortStatus[] {
  return STATUS_TRANSITIONS[from] ?? [];
}

// Member state transitions. New bulk-invites land at 'invited'; a
// student accepting flips to 'active'; an instructor can mark them
// 'completed' at the end of the term or 'dropped' mid-cohort. A
// dropped or completed student can be reactivated.
const MEMBER_STATE_TRANSITIONS: Record<CohortMemberState, CohortMemberState[]> = {
  invited:   ["active", "dropped"],
  active:    ["completed", "dropped"],
  completed: ["active"],
  dropped:   ["active"],
};

export function canTransitionMemberState(from: CohortMemberState, to: CohortMemberState): boolean {
  if (from === to) return false;
  return MEMBER_STATE_TRANSITIONS[from]?.includes(to) ?? false;
}

export function validNextMemberStates(from: CohortMemberState): CohortMemberState[] {
  return MEMBER_STATE_TRANSITIONS[from] ?? [];
}

// Whether the cohort accepts new enrollments at this status. 'open'
// is the explicit signal — 'draft' isn't yet inviting, 'running' is
// already closed (late joiners disrupt the cohort), and so on.
export function isAcceptingEnrollment(status: CohortStatus): boolean {
  return status === "open";
}

// Whether the cohort is currently "live" — the dashboard surfaces
// active assignments, progress, discussion for the instructor.
export function isLive(status: CohortStatus): boolean {
  return status === "running" || status === "open";
}

// Compact human label.
const STATUS_LABEL: Record<CohortStatus, string> = {
  draft: "Draft",
  open: "Open · taking students",
  running: "Running",
  ended: "Ended",
  archived: "Archived",
};
export function statusLabel(s: CohortStatus): string {
  return STATUS_LABEL[s] ?? s;
}

// Compute remaining seats from capacity and the count of members
// currently in 'invited' OR 'active' state. Returns null when no
// capacity is set (uncapped cohort).
export function seatsRemaining(capacity: number | null | undefined, occupied: number): number | null {
  if (capacity == null) return null;
  return Math.max(0, capacity - occupied);
}

// Compute time-based progress through a cohort (0..1 of the calendar
// run). Returns null if dates aren't set; clamps at the edges. Used
// by the dashboard's "Week 4 of 12" header.
export function cohortCalendarProgress(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  now: Date = new Date(),
): { progress: number; weekIndex: number; totalWeeks: number } | null {
  if (!startDate || !endDate) return null;
  const start = new Date(startDate + "T00:00:00Z").getTime();
  const end = new Date(endDate + "T00:00:00Z").getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  const total = end - start;
  const elapsed = Math.max(0, Math.min(total, now.getTime() - start));
  const totalWeeks = Math.max(1, Math.round(total / (7 * 86_400_000)));
  const weekIndex = Math.max(0, Math.min(totalWeeks - 1, Math.floor(elapsed / (7 * 86_400_000))));
  return { progress: elapsed / total, weekIndex, totalWeeks };
}
