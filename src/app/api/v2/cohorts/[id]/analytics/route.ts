import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { authCohort, requireCohortRole } from "@/lib/cohort-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Instructor-only cohort analytics. Pulls assignments + progress rows +
// student roster from the same Supabase tables the cohort page reads,
// then rolls them up in JS — at cohort-scale (≤ a few hundred students,
// dozens of assignments) the math is cheap and the simpler API
// surface beats Postgres views we'd have to evolve in lockstep.
//
// Surfaces:
//   - totals: students, assignments, completion rate, on-time rate, median days-to-complete
//   - perAssignment: completion %, students stuck > 7 days, median days-to-complete
//   - perStudent: % done, last activity, on-time count, behind count
//   - weekly: completions per ISO-week for the last 8 weeks (sparkline)

type ProgressRow = {
  user_id: string;
  assignment_id: string;
  status: "not_started" | "in_progress" | "completed" | "submitted";
  score_pct: number | null;
  updated_at: string;
};
type Assignment = { id: string; title: string; kind: string; due_at: string | null; created_at: string };
type Member = { user_id: string; display_name: string | null; email: string | null; joined_at: string };

const DONE = new Set(["completed", "submitted"]);
const DAY_MS = 86_400_000;

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await ctx.params;
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const me = await authCohort(token, id);
  const forbidden = requireCohortRole(me, "instructor");
  if (forbidden) return forbidden;

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const [a, m, p] = await Promise.all([
    sb.from("cohort_assignments").select("id, title, kind, due_at, created_at").eq("cohort_id", id),
    sb.from("cohort_members").select("user_id, display_name, email, joined_at, role").eq("cohort_id", id).eq("role", "student"),
    sb.from("cohort_progress").select("user_id, assignment_id, status, score_pct, updated_at").eq("cohort_id", id),
  ]);

  const assignments = (a.data ?? []) as Assignment[];
  const students = (m.data ?? []) as Member[];
  const progress = (p.data ?? []) as ProgressRow[];

  // Pair lookup: `${user}:${aid}` → row
  const pair = new Map<string, ProgressRow>();
  for (const r of progress) pair.set(`${r.user_id}:${r.assignment_id}`, r);

  const studentCount = students.length;
  const assignmentCount = assignments.length;
  const totalCells = studentCount * assignmentCount;

  // ── Per-assignment ────────────────────────────────────────────────────
  const now = Date.now();
  const perAssignment = assignments.map((asg) => {
    let done = 0;
    let started = 0;
    let onTime = 0;
    let stuck = 0;                       // in_progress for >7d
    const daysToComplete: number[] = []; // for the median
    for (const s of students) {
      const row = pair.get(`${s.user_id}:${asg.id}`);
      if (!row || row.status === "not_started") continue;
      started++;
      if (DONE.has(row.status)) {
        done++;
        // Days from later-of(assignment created, member joined) → updated_at.
        const start = Math.max(new Date(asg.created_at).getTime(), new Date(s.joined_at).getTime());
        const end = new Date(row.updated_at).getTime();
        const days = Math.max(0, (end - start) / DAY_MS);
        daysToComplete.push(days);
        if (!asg.due_at || end <= new Date(asg.due_at).getTime()) onTime++;
      } else if (row.status === "in_progress") {
        const sinceUpdate = (now - new Date(row.updated_at).getTime()) / DAY_MS;
        if (sinceUpdate > 7) stuck++;
      }
    }
    return {
      id: asg.id,
      title: asg.title,
      kind: asg.kind,
      dueAt: asg.due_at,
      completionRate: studentCount ? done / studentCount : 0,
      started,
      done,
      stuck,
      onTime,
      medianDays: median(daysToComplete),
    };
  }).sort((x, y) => x.completionRate - y.completionRate); // worst-completion first → easiest to act on

  // ── Per-student ───────────────────────────────────────────────────────
  const perStudent = students.map((s) => {
    let done = 0;
    let inProgress = 0;
    let onTime = 0;
    let behind = 0; // past-due and not done
    let lastActivity: string | null = null;
    for (const asg of assignments) {
      const row = pair.get(`${s.user_id}:${asg.id}`);
      const dueMs = asg.due_at ? new Date(asg.due_at).getTime() : null;
      if (row && (!lastActivity || row.updated_at > lastActivity)) lastActivity = row.updated_at;
      if (row && DONE.has(row.status)) {
        done++;
        if (!dueMs || new Date(row.updated_at).getTime() <= dueMs) onTime++;
      } else if (row?.status === "in_progress") {
        inProgress++;
        if (dueMs && dueMs < now) behind++;
      } else {
        // not started / no row
        if (dueMs && dueMs < now) behind++;
      }
    }
    return {
      userId: s.user_id,
      displayName: s.display_name,
      email: s.email,
      done,
      inProgress,
      onTime,
      behind,
      completionPct: assignmentCount ? done / assignmentCount : 0,
      lastActivity,
    };
  }).sort((x, y) => x.completionPct - y.completionPct);

  // ── Weekly completions (last 8 ISO weeks) ─────────────────────────────
  const weekBuckets = new Map<string, number>();
  for (const r of progress) {
    if (!DONE.has(r.status)) continue;
    const k = isoWeekKey(new Date(r.updated_at));
    weekBuckets.set(k, (weekBuckets.get(k) ?? 0) + 1);
  }
  const weekly: { week: string; completions: number }[] = [];
  for (let i = 7; i >= 0; i--) {
    const d = new Date(now - i * 7 * DAY_MS);
    const k = isoWeekKey(d);
    weekly.push({ week: k, completions: weekBuckets.get(k) ?? 0 });
  }

  // ── Totals ────────────────────────────────────────────────────────────
  const totalDone = perAssignment.reduce((s, a) => s + a.done, 0);
  const totalOnTime = perAssignment.reduce((s, a) => s + a.onTime, 0);
  const allDays = perAssignment.flatMap((a) => (a.medianDays ?? null) === null ? [] : [a.medianDays!]);
  const totals = {
    students: studentCount,
    assignments: assignmentCount,
    completionRate: totalCells ? totalDone / totalCells : 0,
    onTimeRate: totalDone ? totalOnTime / totalDone : 0,
    medianDaysToComplete: median(allDays),
    stuckStudents: perStudent.filter((s) => s.behind > 0).length,
  };

  return Response.json({
    ok: true,
    totals,
    perAssignment,
    perStudent,
    weekly,
  });
}

// ── helpers ─────────────────────────────────────────────────────────────
function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const v = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return Math.round(v * 10) / 10;
}

// ISO-week key: "2026-W21". Cheap and unambiguous across year boundaries.
function isoWeekKey(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
