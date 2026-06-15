"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase";
import { useStore } from "@/store";
import { buildMonthGrid, MONTH_NAMES, shiftMonth } from "@/lib/calendar-grid";
import { setByLabel } from "@/lib/deadline-schedule";
import { Card } from "@/components/ui";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, ArrowLeft, Loader2 } from "lucide-react";

// Cross-workspace deadlines calendar — a real monthly grid showing every
// deadline (assigned to you OR workspace-wide) across every workspace
// you belong to. Click a day to reveal its items below. Today is always
// highlighted; past months read dimmer; the source-of-authority chip
// gives instructor/funder/journal deadlines visual weight.

type Deadline = {
  id: string;
  workspace_id: string;
  workspace_title: string;
  workspace_accent: string;
  title: string;
  detail: string;
  due_at: string;
  status: string;
  set_by_role: string;
  assignee_user_id: string | null;
};

type CalendarItem = { iso: string; deadline: Deadline };

const ACCENT_HEX: Record<string, string> = {
  emerald: "#2cc295",
  amber: "#f4a949",
  indigo: "#6c8cff",
  rust: "#d96444",
};

export default function CalendarPage() {
  const { user, hydrated } = useStore();
  const [items, setItems] = useState<Deadline[]>([]);
  const [loading, setLoading] = useState(true);
  const now = useMemo(() => new Date(), []);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

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
        const res = await fetch("/api/v2/me/deadlines", { headers: { Authorization: `Bearer ${token}` } });
        const data = (await res.json()) as { ok: boolean; results?: Deadline[] };
        if (cancelled) return;
        setItems(data.ok && data.results ? data.results : []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  const calendarItems = useMemo<CalendarItem[]>(() => items.map((d) => ({ iso: d.due_at, deadline: d })), [items]);
  const grid = useMemo(() => buildMonthGrid(year, month, calendarItems, { weekStart: 1, now: now.getTime() }), [year, month, calendarItems, now]);

  const selectedCell = selectedKey ? grid.cells.find((c) => `${c.date.getFullYear()}-${c.date.getMonth()}-${c.date.getDate()}` === selectedKey) ?? null : null;

  function prevMonth() { const { year: y, month: m } = shiftMonth(year, month, -1); setYear(y); setMonth(m); setSelectedKey(null); }
  function nextMonth() { const { year: y, month: m } = shiftMonth(year, month, 1); setYear(y); setMonth(m); setSelectedKey(null); }
  function goToday() { setYear(now.getFullYear()); setMonth(now.getMonth()); setSelectedKey(`${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`); }

  if (!hydrated || loading) {
    return <div className="min-h-[40vh] flex items-center justify-center"><Loader2 className="size-6 text-emerald animate-spin" /></div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <Link href="/studio/workspaces" className="text-xs text-muted hover:text-foreground inline-flex items-center gap-1.5 mb-4">
        <ArrowLeft className="size-3" /> Workspaces
      </Link>

      <div className="flex items-end justify-between flex-wrap gap-4 mb-6">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-emerald mb-2 flex items-center gap-1.5">
            <CalendarIcon className="size-3.5" /> Deadlines calendar
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight text-balance">
            {MONTH_NAMES[month]} <span className="text-muted">{year}</span>
          </h1>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={prevMonth} className="size-9 rounded-xl border border-border hover:border-emerald/40 hover:bg-emerald/5 flex items-center justify-center transition" title="Previous month" aria-label="Previous month">
            <ChevronLeft className="size-4" />
          </button>
          <button onClick={goToday} className="px-3 py-1.5 rounded-xl border border-border hover:border-emerald/40 hover:bg-emerald/5 text-sm transition">Today</button>
          <button onClick={nextMonth} className="size-9 rounded-xl border border-border hover:border-emerald/40 hover:bg-emerald/5 flex items-center justify-center transition" title="Next month" aria-label="Next month">
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>

      {/* Grid */}
      <Card className="p-2 sm:p-3">
        <div className="grid grid-cols-7 text-[10px] uppercase tracking-widest text-muted mb-1 px-1">
          {grid.weekdays.map((w) => <div key={w} className="px-1.5 py-1">{w}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {grid.cells.map((cell) => {
            const key = `${cell.date.getFullYear()}-${cell.date.getMonth()}-${cell.date.getDate()}`;
            const selected = selectedKey === key;
            const visible = cell.items.slice(0, 3);
            const more = cell.items.length - visible.length;
            return (
              <button
                key={key}
                onClick={() => setSelectedKey(selected ? null : key)}
                className={`text-left rounded-lg min-h-[88px] sm:min-h-[104px] p-1.5 border transition flex flex-col gap-1 ${
                  selected
                    ? "border-emerald bg-emerald/10"
                    : cell.isToday
                      ? "border-emerald/50 bg-emerald/5 hover:bg-emerald/10"
                      : cell.inMonth
                        ? "border-border hover:border-emerald/30 hover:bg-surface-2/40"
                        : "border-transparent opacity-40 hover:opacity-70"
                }`}
              >
                <div className={`text-[11px] font-medium ${cell.isToday ? "text-emerald" : cell.inMonth ? "text-foreground" : "text-muted"}`}>
                  {cell.date.getDate()}
                </div>
                <div className="flex-1 space-y-0.5 overflow-hidden">
                  {visible.map(({ deadline: d }) => {
                    const accent = ACCENT_HEX[d.workspace_accent] ?? ACCENT_HEX.emerald;
                    return (
                      <div key={d.id} className="text-[10px] leading-tight truncate flex items-center gap-1">
                        <span className="size-1.5 rounded-full shrink-0" style={{ background: accent }} />
                        <span className="truncate">{d.title}</span>
                      </div>
                    );
                  })}
                  {more > 0 && <div className="text-[10px] text-muted">+ {more} more</div>}
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      {/* Selected day detail */}
      {selectedCell && (
        <Card className="mt-6 p-5 sm:p-6 rise">
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold mb-1">
            {selectedCell.date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
          </h2>
          <p className="text-xs text-muted mb-4">{selectedCell.items.length === 0 ? "Nothing due." : `${selectedCell.items.length} deadline${selectedCell.items.length === 1 ? "" : "s"}.`}</p>
          {selectedCell.items.length > 0 && (
            <ul className="space-y-2">
              {selectedCell.items.map(({ deadline: d }) => {
                const accent = ACCENT_HEX[d.workspace_accent] ?? ACCENT_HEX.emerald;
                const src = setByLabel(d.set_by_role);
                const due = new Date(d.due_at);
                return (
                  <li key={d.id}>
                    <Link href={`/studio/workspaces/${d.workspace_id}`} className="block p-3 rounded-xl border border-border bg-surface-2/30 hover:border-emerald/40 transition group">
                      <div className="flex items-center gap-3">
                        <span className="size-2 rounded-full shrink-0" style={{ background: accent }} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{d.title}</div>
                          <div className="text-[11px] text-muted mt-0.5 flex items-center gap-2 flex-wrap">
                            <span className="truncate">{d.workspace_title}</span>
                            <span>·</span>
                            <span>{due.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</span>
                            <span>·</span>
                            <span>{src.label}</span>
                          </div>
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}

      {items.length === 0 && (
        <Card className="mt-8 p-8 text-center text-sm text-muted">
          You have no open deadlines yet. <Link href="/studio/workspaces" className="text-emerald hover:underline">Open a workspace</Link> to add one.
        </Card>
      )}
    </div>
  );
}
