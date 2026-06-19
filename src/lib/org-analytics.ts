// Pure org-level analytics aggregator. Takes raw rows from cohorts +
// cohort_members + cohort_progress + cohort_assignments (filtered to
// the org's cohorts) and computes the rollup the org dashboard needs.
//
// Pure so we can unit-test against synthetic fixtures without a DB.
// The API route's job is just to fetch the right rows and call this.

import type { CohortStatus, CohortMemberState } from "@/lib/cohort-state";

export type CohortRow = {
  id: string;
  name: string;
  status: CohortStatus;
  start_date: string | null;
  end_date: string | null;
  capacity: number | null;
};

export type CohortMemberRow = {
  cohort_id: string;
  user_id: string;
  role: "owner" | "instructor" | "student";
  state: CohortMemberState;
  joined_at: string;
  completed_at: string | null;
  dropped_at: string | null;
};

export type ProgressRow = {
  cohort_id: string;
  user_id: string;
  assignment_id: string;
  status: "not_started" | "in_progress" | "submitted" | "completed";
  updated_at: string;
};

export type AssignmentRow = {
  id: string;
  cohort_id: string;
  due_at: string | null;
};

export type OrgRollup = {
  // High-level KPIs
  totals: {
    cohorts: number;
    cohortsRunning: number;
    cohortsOpen: number;
    cohortsEnded: number;
    cohortsDraftOrArchived: number;
    students: number;             // distinct student user_ids (active + invited)
    instructors: number;          // distinct instructor user_ids
    completedStudents: number;
    droppedStudents: number;
    completionRatePct: number;    // completed / (completed + dropped + active)
    avgCohortFillPct: number | null; // sum of (active+invited)/capacity / n  for cohorts with capacity
  };
  // Per-cohort cards for the dashboard list — sorted by recency
  cohorts: Array<{
    id: string;
    name: string;
    status: CohortStatus;
    studentsActive: number;
    studentsInvited: number;
    studentsCompleted: number;
    studentsDropped: number;
    capacity: number | null;
    fillPct: number | null;
    completionPct: number;        // for finished students
    momentumLast7Days: number;    // count of distinct students with any progress update in last 7d
    atRiskCount: number;          // active students with NO progress updates in 14d
  }>;
  // The cohorts that need attention (sorted by at-risk count desc).
  atRiskCohorts: Array<{ id: string; name: string; atRiskCount: number }>;
};

const DAY_MS = 86_400_000;

export function computeOrgRollup(input: {
  cohorts: CohortRow[];
  members: CohortMemberRow[];
  progress: ProgressRow[];
  assignments: AssignmentRow[];
  now?: Date;
}): OrgRollup {
  const now = (input.now ?? new Date()).getTime();
  const last7 = now - 7 * DAY_MS;
  const last14 = now - 14 * DAY_MS;

  // Index members by cohort_id, filtering down to students (state-wise
  // we count active + invited + completed + dropped distinctly).
  const membersByCohort = new Map<string, CohortMemberRow[]>();
  for (const m of input.members) {
    const arr = membersByCohort.get(m.cohort_id) ?? [];
    arr.push(m);
    membersByCohort.set(m.cohort_id, arr);
  }

  // Index progress by (cohort_id, user_id) → latest_updated_at so the
  // momentum + at-risk checks are O(N) instead of O(N*P).
  const lastProgressByPair = new Map<string, number>();
  for (const p of input.progress) {
    const ts = new Date(p.updated_at).getTime();
    if (!Number.isFinite(ts)) continue;
    const key = `${p.cohort_id}:${p.user_id}`;
    const cur = lastProgressByPair.get(key);
    if (cur == null || ts > cur) lastProgressByPair.set(key, ts);
  }

  let totalStudents = 0;
  let totalInstructors = 0;
  let totalCompleted = 0;
  let totalDropped = 0;
  let totalActive = 0;
  let cohortsWithCapacity = 0;
  let fillSum = 0;

  const cohortCards: OrgRollup["cohorts"] = [];

  for (const c of input.cohorts) {
    const mems = membersByCohort.get(c.id) ?? [];

    let studentsActive = 0;
    let studentsInvited = 0;
    let studentsCompleted = 0;
    let studentsDropped = 0;
    let cohortInstructors = 0;
    let momentumLast7Days = 0;
    let atRiskCount = 0;

    for (const m of mems) {
      if (m.role === "instructor" || m.role === "owner") {
        cohortInstructors++;
        continue;
      }
      // students only past this point
      switch (m.state) {
        case "active": studentsActive++; break;
        case "invited": studentsInvited++; break;
        case "completed": studentsCompleted++; break;
        case "dropped": studentsDropped++; break;
      }
      // Momentum + at-risk check only for ACTIVE students; invited
      // shouldn't be expected to have made progress; completed/
      // dropped are terminal.
      if (m.state === "active") {
        const lastTs = lastProgressByPair.get(`${c.id}:${m.user_id}`);
        if (lastTs != null && lastTs >= last7) momentumLast7Days++;
        if (lastTs == null || lastTs < last14) atRiskCount++;
      }
    }

    // Roll into org totals.
    totalStudents += studentsActive + studentsInvited + studentsCompleted + studentsDropped;
    totalInstructors += cohortInstructors;
    totalActive += studentsActive;
    totalCompleted += studentsCompleted;
    totalDropped += studentsDropped;

    // Per-cohort fill (active + invited / capacity).
    let fillPct: number | null = null;
    if (c.capacity != null && c.capacity > 0) {
      cohortsWithCapacity++;
      fillPct = clamp((studentsActive + studentsInvited) / c.capacity, 0, 1);
      fillSum += fillPct;
    }

    // Per-cohort completion: of the finished cohort (completed +
    // dropped + active that's expected to finish), what fraction
    // completed? For running cohorts this is provisional. For ended
    // cohorts it's the final number.
    const finishedDenom = studentsCompleted + studentsDropped + studentsActive;
    const completionPct = finishedDenom > 0 ? Math.round((studentsCompleted / finishedDenom) * 100) : 0;

    cohortCards.push({
      id: c.id,
      name: c.name,
      status: c.status,
      studentsActive, studentsInvited, studentsCompleted, studentsDropped,
      capacity: c.capacity,
      fillPct,
      completionPct,
      momentumLast7Days,
      atRiskCount,
    });
  }

  // Sort cohorts by recency-ish: running first, then open, then ended,
  // then archived/draft. Within each band, more students first.
  const statusOrder: Record<CohortStatus, number> = {
    running: 0, open: 1, ended: 2, archived: 3, draft: 4,
  };
  cohortCards.sort((a, b) => {
    const sa = statusOrder[a.status] ?? 5;
    const sb = statusOrder[b.status] ?? 5;
    if (sa !== sb) return sa - sb;
    return (b.studentsActive + b.studentsInvited) - (a.studentsActive + a.studentsInvited);
  });

  // At-risk cohorts: those with the most at-risk students. We surface
  // up to 5 — past that the dashboard gets noisy.
  const atRiskCohorts = cohortCards
    .filter((c) => c.atRiskCount > 0)
    .map((c) => ({ id: c.id, name: c.name, atRiskCount: c.atRiskCount }))
    .sort((a, b) => b.atRiskCount - a.atRiskCount)
    .slice(0, 5);

  const completionDenom = totalCompleted + totalDropped + totalActive;
  const completionRatePct = completionDenom > 0
    ? Math.round((totalCompleted / completionDenom) * 100)
    : 0;
  const avgCohortFillPct = cohortsWithCapacity > 0
    ? Math.round((fillSum / cohortsWithCapacity) * 100)
    : null;

  // Status buckets for the totals card.
  let running = 0, open = 0, ended = 0, draftOrArch = 0;
  for (const c of input.cohorts) {
    if (c.status === "running") running++;
    else if (c.status === "open") open++;
    else if (c.status === "ended") ended++;
    else draftOrArch++;
  }

  return {
    totals: {
      cohorts: input.cohorts.length,
      cohortsRunning: running,
      cohortsOpen: open,
      cohortsEnded: ended,
      cohortsDraftOrArchived: draftOrArch,
      students: totalStudents,
      instructors: totalInstructors,
      completedStudents: totalCompleted,
      droppedStudents: totalDropped,
      completionRatePct,
      avgCohortFillPct,
    },
    cohorts: cohortCards,
    atRiskCohorts,
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
