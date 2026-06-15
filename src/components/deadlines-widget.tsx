"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase";
import { useStore } from "@/store";
import { dueWindow, relativeDue, setByLabel, windowLabel, type DeadlineRow } from "@/lib/deadline-schedule";
import { Card, Badge } from "@/components/ui";
import { Calendar, ArrowRight, Loader2 } from "lucide-react";

// Compact cross-workspace deadlines widget for the dashboard.
//
// Hits /api/v2/me/deadlines, groups by urgency window, and shows the
// most urgent five with their workspace title and source-of-authority
// chip. Renders nothing when there's nothing to show (so it never
// occupies dead space for users without active workspaces).

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

const ACCENT_HEX: Record<string, string> = {
  emerald: "#2cc295",
  amber: "#f4a949",
  indigo: "#6c8cff",
  rust: "#d96444",
};

export function DeadlinesWidget() {
  const { user } = useStore();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Deadline[]>([]);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      const sb = supabaseBrowser();
      if (!sb) { setLoading(false); return; }
      const { data: sessionData } = await sb.auth.getSession();
      const token = sessionData.session?.access_token;
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

  if (loading) {
    return (
      <Card className="p-5 flex items-center justify-center min-h-[120px]">
        <Loader2 className="size-5 text-emerald animate-spin" />
      </Card>
    );
  }
  if (items.length === 0) return null;

  const now = Date.now();
  const top = items.slice(0, 5);

  return (
    <Card className="p-6 rise rise-3">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold flex items-center gap-2">
          <Calendar className="size-4 text-emerald" /> Deadlines coming up
        </h2>
        <Link href="/studio/workspaces/calendar" className="text-xs text-emerald hover:underline">Calendar →</Link>
      </div>
      <ul className="space-y-2">
        {top.map((d) => {
          const window = dueWindow(asRow(d), now);
          const source = setByLabel(d.set_by_role);
          const accent = ACCENT_HEX[d.workspace_accent] ?? ACCENT_HEX.emerald;
          return (
            <li key={d.id}>
              <Link
                href={`/studio/workspaces/${d.workspace_id}`}
                className="block p-3 rounded-xl border border-border bg-surface-2/30 hover:border-emerald/40 hover:bg-surface-2/60 transition group"
              >
                <div className="flex items-center gap-3">
                  <span className="size-2 rounded-full shrink-0" style={{ background: accent }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium truncate">{d.title}</span>
                      <Badge color={source.tone as Parameters<typeof Badge>[0]["color"]}>{source.label}</Badge>
                      {window && <Badge color={window === "overdue" ? "rust" : window === "1d" || window === "6h" ? "amber" : "muted"}>{windowLabel(window)}</Badge>}
                    </div>
                    <div className="text-[11px] text-muted mt-0.5 flex items-center gap-2">
                      <span className="truncate">{d.workspace_title}</span>
                      <span>·</span>
                      <span>{relativeDue(d.due_at, now)}</span>
                    </div>
                  </div>
                  <ArrowRight className="size-3.5 text-muted opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition shrink-0" />
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function asRow(d: Deadline): DeadlineRow {
  return {
    id: d.id,
    workspace_id: d.workspace_id,
    assignee_user_id: d.assignee_user_id,
    title: d.title,
    due_at: d.due_at,
    status: d.status,
    set_by_role: d.set_by_role,
    last_reminded_at: null,
  };
}
