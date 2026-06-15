"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase";
import { useStore } from "@/store";
import { rollup, healthLabel, type RollupInputWorkspace } from "@/lib/workspace-rollup";
import { Card, Badge, Stat } from "@/components/ui";
import { ArrowLeft, ArrowRight, GraduationCap, Users, KanbanSquare, Calendar, TrendingUp, Loader2, AlertTriangle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

// Cohort-of-workspaces analytics. Shows the instructor / project owner
// a roll-up across every workspace they own: total members, open tasks,
// 7-day closures, open + overdue deadlines, and a health distribution.
// The per-workspace table sorts the most-at-risk to the top so the
// instructor can act on what's stalling.

const ACCENT_HEX: Record<string, string> = {
  emerald: "#2cc295",
  amber: "#f4a949",
  indigo: "#6c8cff",
  rust: "#d96444",
};

const TONE_CLASS: Record<string, string> = {
  emerald: "text-emerald",
  amber: "text-amber",
  rust: "text-rust",
  muted: "text-muted",
};

export default function WorkspaceAnalyticsPage() {
  const { user, hydrated } = useStore();
  const [rows, setRows] = useState<RollupInputWorkspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      const sb = supabaseBrowser();
      if (!sb) { setLoading(false); return; }
      const { data: sess } = await sb.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) { setLoading(false); return; }
      try {
        const res = await fetch("/api/v2/workspaces/rollup", { headers: { Authorization: `Bearer ${token}` } });
        const data = (await res.json()) as { ok: boolean; results?: RollupInputWorkspace[]; error?: string };
        if (cancelled) return;
        if (!data.ok) { setErr(data.error || "Unknown error"); return; }
        setRows(data.results ?? []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  const { rows: sortedRows, totals } = useMemo(() => rollup(rows, Date.now()), [rows]);

  if (!hydrated || loading) {
    return <div className="min-h-[40vh] flex items-center justify-center"><Loader2 className="size-6 text-emerald animate-spin" /></div>;
  }

  if (sortedRows.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-5 sm:px-8 py-12 text-center">
        <GraduationCap className="size-10 text-emerald mx-auto mb-3" />
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold">No workspaces to analyze.</h1>
        <p className="mt-2 text-muted">This page summarizes the workspaces you OWN — start one to see the roll-up here.</p>
        <Link href="/studio/workspaces" className="inline-flex items-center gap-1.5 mt-6 text-emerald hover:underline">
          Go to workspaces <ArrowRight className="size-3.5" />
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <Link href="/studio/workspaces" className="text-xs text-muted hover:text-foreground inline-flex items-center gap-1.5 mb-4">
        <ArrowLeft className="size-3" /> Workspaces
      </Link>

      <div className="mb-8">
        <p className="text-xs uppercase tracking-[0.22em] text-emerald mb-2 flex items-center gap-1.5">
          <TrendingUp className="size-3.5" /> Roll-up
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight text-balance">
          Your <span className="text-emerald">{sortedRows.length}</span> workspace{sortedRows.length === 1 ? "" : "s"}, at a glance.
        </h1>
        <p className="mt-3 text-muted max-w-2xl">Members, tasks, deadlines, and workspace health across every workspace you own. The at-risk ones are sorted to the top so you can act on what's stalling.</p>
      </div>

      {err && <Card className="p-4 mb-6 border-rust/30 bg-rust/5 text-sm text-rust">{err}</Card>}

      {/* Headline stats */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Stat label="Members" value={totals.members} color="emerald" sub={`across ${totals.workspaces} workspaces`} />
        <Stat label="Open tasks" value={totals.openTasks} color="amber" sub={`${totals.doneTasks7d} closed in 7d`} />
        <Stat label="Open deadlines" value={totals.openDeadlines} color="indigo" sub={`${totals.overdueDeadlines} overdue`} />
        <Stat label="Stalled workspaces" value={totals.stalled} color={totals.stalled > 0 ? "rust" : "emerald"} sub={`${totals.thriving} thriving · ${totals.steady} steady · ${totals.quiet} quiet`} />
      </div>

      {/* Health distribution bar */}
      <Card className="p-5 mb-6">
        <div className="flex items-center justify-between text-xs mb-2">
          <span className="text-[10px] uppercase tracking-widest text-muted">Health</span>
          <span className="text-muted">{totals.workspaces} total</span>
        </div>
        <div className="flex h-2.5 rounded-full overflow-hidden bg-surface-2">
          <Segment count={totals.thriving} total={totals.workspaces} color="#2cc295" />
          <Segment count={totals.steady} total={totals.workspaces} color="#0c8f6a" />
          <Segment count={totals.quiet} total={totals.workspaces} color="#f4a949" />
          <Segment count={totals.stalled} total={totals.workspaces} color="#d96444" />
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted mt-2">
          <Legend color="#2cc295" label={`${totals.thriving} thriving`} />
          <Legend color="#0c8f6a" label={`${totals.steady} steady`} />
          <Legend color="#f4a949" label={`${totals.quiet} quiet`} />
          <Legend color="#d96444" label={`${totals.stalled} stalled`} />
        </div>
      </Card>

      {/* Per-workspace table */}
      <Card className="p-5 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-widest text-muted border-b border-border">
              <th className="pb-2">Workspace</th>
              <th className="pb-2">Health</th>
              <th className="pb-2 text-right">Members</th>
              <th className="pb-2 text-right">Open tasks</th>
              <th className="pb-2 text-right">Done 7d</th>
              <th className="pb-2 text-right">Deadlines</th>
              <th className="pb-2 text-right">Last active</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((r) => {
              const accent = ACCENT_HEX[r.accent] ?? ACCENT_HEX.emerald;
              const h = healthLabel(r.health);
              return (
                <tr key={r.id} className="border-b border-border last:border-0 hover:bg-surface-2/30 transition">
                  <td className="py-3 pr-3">
                    <Link href={`/studio/workspaces/${r.id}`} className="flex items-center gap-2 group">
                      <span className="size-2 rounded-full shrink-0" style={{ background: accent }} />
                      <span className="font-medium group-hover:text-emerald transition">{r.title}</span>
                    </Link>
                    <div className="text-[10px] text-muted ml-4">{r.kind.replace(/_/g, " ")}</div>
                  </td>
                  <td className="py-3 pr-3">
                    <span className={`text-xs ${TONE_CLASS[h.tone]}`}>{h.label}</span>
                    {r.overdue_deadlines > 0 && (
                      <span className="ml-2 inline-flex items-center gap-1 text-[10px] text-rust"><AlertTriangle className="size-2.5" /> {r.overdue_deadlines} overdue</span>
                    )}
                  </td>
                  <td className="py-3 pr-3 text-right text-muted"><span className="inline-flex items-center gap-1"><Users className="size-3" /> {r.member_count}</span></td>
                  <td className="py-3 pr-3 text-right text-muted"><span className="inline-flex items-center gap-1"><KanbanSquare className="size-3" /> {r.open_tasks}</span></td>
                  <td className="py-3 pr-3 text-right text-emerald">{r.done_tasks_7d}</td>
                  <td className="py-3 pr-3 text-right text-muted"><span className="inline-flex items-center gap-1"><Calendar className="size-3" /> {r.open_deadlines}</span></td>
                  <td className="py-3 text-right text-muted text-xs">{r.last_activity_at ? `${formatDistanceToNow(new Date(r.last_activity_at))} ago` : "never"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function Segment({ count, total, color }: { count: number; total: number; color: string }) {
  if (count === 0 || total === 0) return null;
  return <div style={{ width: `${(count / total) * 100}%`, background: color }} />;
}

function Legend({ color, label }: { color: string; label: string }) {
  return <span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full" style={{ background: color }} /> {label}</span>;
}
