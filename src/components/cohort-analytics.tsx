"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";
import { Card } from "@/components/ui";
import { BarChart3, TrendingUp, Clock, Users, AlertTriangle, CheckCircle2, ChevronDown } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

// Instructor-only analytics card. Lives below the progress matrix on
// /studio/cohorts/[id]. Hidden when there are no students or no
// assignments — the totals would all be NaN/zero and waste vertical
// space.

type Totals = {
  students: number;
  assignments: number;
  completionRate: number;
  onTimeRate: number;
  medianDaysToComplete: number | null;
  stuckStudents: number;
};
type PerAssignment = {
  id: string;
  title: string;
  kind: string;
  dueAt: string | null;
  completionRate: number;
  started: number;
  done: number;
  stuck: number;
  onTime: number;
  medianDays: number | null;
};
type PerStudent = {
  userId: string;
  displayName: string | null;
  email: string | null;
  done: number;
  inProgress: number;
  onTime: number;
  behind: number;
  completionPct: number;
  lastActivity: string | null;
};
type Weekly = { week: string; completions: number };
type AnalyticsPayload = { totals: Totals; perAssignment: PerAssignment[]; perStudent: PerStudent[]; weekly: Weekly[] };

export function CohortAnalytics({ cohortId, refreshKey }: { cohortId: string; refreshKey?: number }) {
  const [data, setData] = useState<AnalyticsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [studentsOpen, setStudentsOpen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const sb = supabaseBrowser();
        if (!sb) { setLoading(false); return; }
        const { data: { session } } = await sb.auth.getSession();
        if (!session) { setLoading(false); return; }
        const res = await fetch(`/api/v2/cohorts/${cohortId}/analytics`, { headers: { Authorization: `Bearer ${session.access_token}` } });
        const json = await res.json();
        if (json.ok) setData(json);
      } catch { /* silent */ }
      setLoading(false);
    })();
  }, [cohortId, refreshKey]);

  if (loading) return null;
  if (!data || data.totals.students === 0 || data.totals.assignments === 0) return null;

  const { totals, perAssignment, perStudent, weekly } = data;
  const maxWeekly = Math.max(...weekly.map((w) => w.completions), 1);
  const stuckAssignments = perAssignment.filter((a) => a.stuck > 0).slice(0, 3);
  const lowestCompletion = perAssignment.slice(0, 5);

  return (
    <Card className="p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs uppercase tracking-[0.22em] text-emerald flex items-center gap-1.5">
          <BarChart3 className="size-3.5" /> Analytics
        </h2>
        <span className="text-[10px] text-muted">Instructor view · rolled up from progress + assignments</span>
      </div>

      {/* Headline numbers */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-5">
        <Stat icon={Users} label="Students" value={String(totals.students)} tone="emerald" />
        <Stat icon={CheckCircle2} label="Completion" value={pct(totals.completionRate)} tone="emerald" />
        <Stat icon={TrendingUp} label="On-time" value={totals.onTimeRate > 0 ? pct(totals.onTimeRate) : "—"} tone="amber" />
        <Stat icon={Clock} label="Median days" value={totals.medianDaysToComplete !== null ? `${totals.medianDaysToComplete}d` : "—"} tone="indigo" />
        <Stat icon={AlertTriangle} label="Behind" value={String(totals.stuckStudents)} tone={totals.stuckStudents > 0 ? "rust" : "muted"} />
      </div>

      {/* Weekly completions sparkline */}
      <Card className="p-3 mb-4 bg-surface-2/40">
        <div className="text-[10px] uppercase tracking-widest text-muted mb-2">Completions per ISO week · last 8</div>
        <div className="flex items-end gap-1 h-14">
          {weekly.map((w) => (
            <div key={w.week} className="flex-1 flex flex-col items-center gap-1" title={`${w.week}: ${w.completions}`}>
              <div className="w-full bg-emerald/40 rounded-sm" style={{ height: `${Math.max(2, (w.completions / maxWeekly) * 100)}%` }} />
              <div className="text-[8px] text-muted truncate">{w.week.slice(-3)}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Stuck assignments — clearest "do something" surface */}
      {stuckAssignments.length > 0 && (
        <Card className="p-3 mb-4 border border-rust/30 bg-rust/5">
          <div className="text-[10px] uppercase tracking-widest text-rust mb-2 flex items-center gap-1.5">
            <AlertTriangle className="size-3" /> Students stuck &gt; 7 days
          </div>
          <ul className="space-y-1 text-xs">
            {stuckAssignments.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2">
                <span className="truncate">{a.title}</span>
                <span className="text-rust font-mono shrink-0">{a.stuck} stuck · {a.done}/{totals.students} done</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Lowest-completion assignments */}
      <div className="mb-4">
        <div className="text-[10px] uppercase tracking-widest text-muted mb-2">Lowest completion rate</div>
        <ul className="space-y-1.5">
          {lowestCompletion.map((a) => (
            <li key={a.id} className="flex items-center gap-3 text-xs">
              <div className="flex-1 min-w-0 truncate">{a.title}</div>
              <div className="flex-1 max-w-[120px] h-1.5 rounded-full bg-surface-2 overflow-hidden">
                <div
                  className={`h-full ${a.completionRate >= 0.75 ? "bg-emerald" : a.completionRate >= 0.4 ? "bg-amber" : "bg-rust"}`}
                  style={{ width: `${Math.round(a.completionRate * 100)}%` }}
                />
              </div>
              <div className="w-20 text-right font-mono text-muted shrink-0">
                {pct(a.completionRate)}
                {a.medianDays !== null && <span className="text-[10px] ml-1.5 opacity-70">{a.medianDays}d</span>}
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Per-student rollup, collapsed by default for large cohorts */}
      <button
        onClick={() => setStudentsOpen(!studentsOpen)}
        className="w-full text-[10px] uppercase tracking-widest text-muted hover:text-emerald inline-flex items-center justify-between pt-3 border-t border-border"
      >
        <span>Per-student rollup ({perStudent.length})</span>
        <ChevronDown className={`size-3 transition ${studentsOpen ? "rotate-180" : ""}`} />
      </button>
      {studentsOpen && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-[10px] uppercase tracking-widest text-muted">
              <tr>
                <th className="text-left pb-1.5">Student</th>
                <th className="text-right pb-1.5">Done</th>
                <th className="text-right pb-1.5">On-time</th>
                <th className="text-right pb-1.5">Behind</th>
                <th className="text-right pb-1.5">Last seen</th>
              </tr>
            </thead>
            <tbody>
              {perStudent.map((s) => (
                <tr key={s.userId} className="border-t border-border">
                  <td className="py-1.5 max-w-[160px] truncate">{s.displayName || s.email || s.userId.slice(0, 8)}</td>
                  <td className="py-1.5 text-right font-mono text-emerald">{s.done}/{totals.assignments}</td>
                  <td className="py-1.5 text-right font-mono">{s.onTime}</td>
                  <td className={`py-1.5 text-right font-mono ${s.behind > 0 ? "text-rust" : "text-muted"}`}>{s.behind || "—"}</td>
                  <td className="py-1.5 text-right text-muted text-[10px]">{s.lastActivity ? formatDistanceToNow(new Date(s.lastActivity), { addSuffix: true }) : "never"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

function Stat({ icon: Icon, label, value, tone }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; tone: "emerald" | "amber" | "indigo" | "rust" | "muted" }) {
  const colors: Record<typeof tone, string> = {
    emerald: "text-emerald",
    amber: "text-amber",
    indigo: "text-indigo",
    rust: "text-rust",
    muted: "text-muted",
  };
  return (
    <div className="rounded-xl border border-border bg-surface-2/40 p-3">
      <div className="text-[10px] uppercase tracking-widest text-muted flex items-center gap-1">
        <Icon className="size-2.5" /> {label}
      </div>
      <div className={`mt-0.5 font-[family-name:var(--font-display)] text-xl font-semibold ${colors[tone]}`}>{value}</div>
    </div>
  );
}
