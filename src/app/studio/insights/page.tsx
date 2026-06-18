"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase";
import { useStore } from "@/store";
import { Card, Stat } from "@/components/ui";
import { ArrowLeft, ArrowRight, TrendingUp, CheckCircle2, Calendar, MessageSquare, Paperclip, Flame, Loader2 } from "lucide-react";
import type { CrossInsights } from "@/app/api/v2/me/insights/route";

// /studio/insights — cross-workspace 'your week' digest. Aggregates
// every active workspace into one personal summary + a per-workspace
// breakdown of where you've been active.

const ACCENT_HEX: Record<string, string> = {
  emerald: "#2cc295",
  amber: "#f4a949",
  indigo: "#6c8cff",
  rust: "#d96444",
};

const MOMENTUM_META: Record<string, { label: string; tone: string }> = {
  "on-fire": { label: "On fire", tone: "text-rust" },
  steady: { label: "Steady", tone: "text-emerald" },
  light: { label: "Light", tone: "text-amber" },
  quiet: { label: "Quiet", tone: "text-muted" },
};

export default function InsightsPage() {
  const { user, hydrated } = useStore();
  const [data, setData] = useState<CrossInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState<7 | 30>(7);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const sb = supabaseBrowser();
      if (!sb) { setLoading(false); return; }
      const { data: sess } = await sb.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) { setLoading(false); return; }
      try {
        const res = await fetch(`/api/v2/me/insights?days=${days}`, { headers: { Authorization: `Bearer ${token}` } });
        const json = (await res.json()) as { ok: boolean; insights?: CrossInsights };
        if (cancelled) return;
        setData(json.ok && json.insights ? json.insights : null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id, days]);

  if (!hydrated || loading) {
    return <div className="min-h-[40vh] flex items-center justify-center"><Loader2 className="size-6 text-emerald animate-spin" /></div>;
  }
  if (!data) {
    return (
      <div className="max-w-3xl mx-auto px-5 sm:px-8 py-12 text-center">
        <TrendingUp className="size-10 text-emerald mx-auto mb-3" />
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold">Not enough data yet.</h1>
        <p className="mt-2 text-muted">Once you&apos;re a member of a workspace and start moving, this page comes alive.</p>
        <Link href="/studio/workspaces" className="inline-flex items-center gap-1.5 mt-6 text-emerald hover:underline">
          Go to workspaces <ArrowRight className="size-3.5" />
        </Link>
      </div>
    );
  }

  const t = data.total;
  const m = MOMENTUM_META[t.momentum] ?? MOMENTUM_META.quiet;

  return (
    <div className="max-w-6xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <Link href="/studio/workspaces" className="text-xs text-muted hover:text-foreground inline-flex items-center gap-1.5 mb-4">
        <ArrowLeft className="size-3" /> Workspaces
      </Link>

      <div className="flex items-end justify-between gap-4 flex-wrap mb-8">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-emerald mb-2 flex items-center gap-1.5">
            <TrendingUp className="size-3.5" /> Your insights
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight text-balance">
            {t.totalEvents === 0
              ? "A quiet stretch. One small move starts the wheel."
              : t.headline}
          </h1>
          <p className="mt-3 text-sm text-muted flex items-center gap-2">
            <span>Last {data.windowDays} days · across {data.perWorkspace.length} workspace{data.perWorkspace.length === 1 ? "" : "s"}</span>
            <span className={`inline-flex items-center gap-1 ${m.tone}`}>
              {t.momentum === "on-fire" && <Flame className="size-3" />} {m.label}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-1">
          {([7, 30] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1.5 rounded-full text-xs border transition ${days === d ? "border-emerald/60 bg-emerald/10 text-emerald" : "border-border text-muted hover:text-foreground"}`}
            >
              Last {d} days
            </button>
          ))}
        </div>
      </div>

      <div className="grid sm:grid-cols-4 gap-3 mb-8">
        <Stat label="Tasks closed" value={t.tasksClosed} color="emerald" />
        <Stat label="Deadlines hit" value={t.deadlinesHit} color="indigo" />
        <Stat label="Messages sent" value={t.messagesSent} color="amber" sub={`${t.activeDays} active days`} />
        <Stat label="Files shared" value={t.filesAdded} color="rust" />
      </div>

      <h2 className="text-[10px] uppercase tracking-[0.25em] text-muted mb-3">Where you were active</h2>
      {data.perWorkspace.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted">
          No activity in any workspace yet for this window.
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {data.perWorkspace.map((p) => {
            const accent = ACCENT_HEX[p.accent] ?? ACCENT_HEX.emerald;
            const wm = MOMENTUM_META[p.insights.momentum] ?? MOMENTUM_META.quiet;
            return (
              <Link key={p.workspace_id} href={`/studio/workspaces/${p.workspace_id}`} className="glass lift rounded-2xl p-5 relative overflow-hidden group">
                <div className="absolute -top-10 -right-10 size-24 rounded-full blur-2xl opacity-15" style={{ background: accent }} />
                <div className="relative">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium truncate group-hover:text-emerald transition">{p.title}</h3>
                    <span className={`text-[10px] uppercase tracking-widest flex items-center gap-1 ${wm.tone}`}>
                      {p.insights.momentum === "on-fire" && <Flame className="size-2.5" />} {wm.label}
                    </span>
                  </div>
                  <p className="text-xs text-muted line-clamp-2 leading-relaxed mb-3">{p.insights.headline}</p>
                  <div className="flex items-center gap-3 text-[10px] text-muted flex-wrap">
                    {p.insights.tasksClosed > 0 && <span className="inline-flex items-center gap-1"><CheckCircle2 className="size-2.5 text-emerald" /> {p.insights.tasksClosed}</span>}
                    {p.insights.deadlinesHit > 0 && <span className="inline-flex items-center gap-1"><Calendar className="size-2.5 text-indigo" /> {p.insights.deadlinesHit}</span>}
                    {p.insights.messagesSent > 0 && <span className="inline-flex items-center gap-1"><MessageSquare className="size-2.5 text-amber" /> {p.insights.messagesSent}</span>}
                    {p.insights.filesAdded > 0 && <span className="inline-flex items-center gap-1"><Paperclip className="size-2.5 text-rust" /> {p.insights.filesAdded}</span>}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
