"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase";

type Overview = {
  me: { userId?: string; email?: string };
  spend: {
    last30dUsd: number;
    byScope: { scope: string; usd: number }[];
    daily: { day: string; scope: string; cost_usd: number; tokens_in: number; tokens_out: number; calls: number }[];
  };
  events: {
    daily: { day: string; kind: string; level: string; n: number }[];
    topErrors: { kind: string; scope: string | null; message: string | null; level: string; created_at: string; ctx: Record<string, unknown> }[];
  };
  counts: { users: number; publicVentures: number; publicBuilds: number; aiCalls30d: number };
};

export default function AdminPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const sb = supabaseBrowser();
        if (!sb) { setErr("Cloud sync isn't configured."); return; }
        const { data: { session } } = await sb.auth.getSession();
        if (!session) { setErr("Sign in required. Then have a teammate add you to SANKOFA_ADMIN_EMAILS or the admins table."); return; }
        const res = await fetch("/api/admin/overview", { headers: { Authorization: `Bearer ${session.access_token}` } });
        if (res.status === 403) { setErr("You're signed in but not an admin. Add your email to SANKOFA_ADMIN_EMAILS env or insert into public.admins."); return; }
        const json = await res.json();
        if (!json.ok) { setErr(json.error || "Failed to load."); return; }
        setData(json as Overview);
      } catch (e) {
        setErr((e as Error).message);
      }
    })();
  }, []);

  if (err) {
    return (
      <div className="min-h-screen bg-[#0a0f0d] text-[#e7efe9] flex items-center justify-center p-8">
        <div className="max-w-md rounded-2xl border border-[#2a3a35] bg-[#141d1a] p-6 text-sm">
          <div className="text-[10px] uppercase tracking-[0.22em] text-[#f4a949] mb-2">Admin</div>
          <p className="text-[#cfe0d8] leading-relaxed">{err}</p>
          <Link href="/studio" className="mt-4 inline-block text-[#2cc295] hover:text-[#f4a949]">← back to studio</Link>
        </div>
      </div>
    );
  }
  if (!data) {
    return <div className="min-h-screen bg-[#0a0f0d] text-[#cfe0d8] flex items-center justify-center text-sm">Loading admin overview…</div>;
  }

  return (
    <div className="min-h-screen bg-[#0a0f0d] text-[#e7efe9]">
      <div className="max-w-7xl mx-auto px-6 sm:px-8 py-10 space-y-8">
        <header>
          <div className="text-[10px] uppercase tracking-[0.22em] text-[#2cc295] mb-2">Sankofa · admin</div>
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold">Operator overview</h1>
          <p className="text-sm text-[#8aa39a] mt-1">Signed in as {data.me.email ?? data.me.userId}.</p>
        </header>

        {/* Top-line counters */}
        <section className="grid sm:grid-cols-4 gap-3">
          <Counter label="Users" value={data.counts.users.toLocaleString()} />
          <Counter label="Public ventures" value={data.counts.publicVentures.toLocaleString()} tone="amber" />
          <Counter label="Public builds" value={data.counts.publicBuilds.toLocaleString()} tone="indigo" />
          <Counter label="AI calls (30d)" value={data.counts.aiCalls30d.toLocaleString()} tone="rust" />
        </section>

        {/* AI spend */}
        <section className="rounded-2xl border border-[#2a3a35] bg-[#141d1a] p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-medium">AI spend — last 30 days</h2>
            <span className="font-[family-name:var(--font-display)] text-3xl text-[#2cc295]">${data.spend.last30dUsd.toFixed(2)}</span>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-[#8aa39a] mb-2">By scope</div>
              <ul className="space-y-1.5">
                {data.spend.byScope.slice(0, 10).map((s) => (
                  <li key={s.scope} className="flex items-center justify-between text-sm">
                    <span className="font-mono text-xs">{s.scope}</span>
                    <span className="font-mono text-[#2cc295]">${s.usd.toFixed(4)}</span>
                  </li>
                ))}
                {data.spend.byScope.length === 0 && <li className="text-xs text-[#8aa39a] italic">No spend yet.</li>}
              </ul>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-[#8aa39a] mb-2">Daily trend</div>
              <SparkBars data={dailyTotals(data.spend.daily)} format={(n) => `$${n.toFixed(2)}`} />
            </div>
          </div>
        </section>

        {/* Top errors */}
        <section className="rounded-2xl border border-[#2a3a35] bg-[#141d1a] p-6">
          <h2 className="font-medium mb-4">Top errors — last 7 days</h2>
          {data.events.topErrors.length === 0 ? (
            <p className="text-sm text-[#8aa39a] italic">No errors logged. Either the platform is silent or the events table isn&apos;t wired yet.</p>
          ) : (
            <ul className="space-y-2">
              {data.events.topErrors.map((e, i) => (
                <li key={i} className="rounded-xl border border-[#2a3a35] bg-[#0c1411] p-3 text-xs">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-mono text-[#f4a949]">{e.kind}{e.scope ? ` · ${e.scope}` : ""}</span>
                    <span className="text-[#6b8079]">{new Date(e.created_at).toLocaleString()}</span>
                  </div>
                  <p className="text-[#cfe0d8] line-clamp-2">{e.message || "—"}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Event volume */}
        <section className="rounded-2xl border border-[#2a3a35] bg-[#141d1a] p-6">
          <h2 className="font-medium mb-4">Event volume (last 30 days)</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-[#8aa39a]">
                <tr>
                  <th className="text-left pb-2 pr-3">Kind</th>
                  <th className="text-left pb-2 pr-3">Level</th>
                  <th className="text-right pb-2">Events</th>
                </tr>
              </thead>
              <tbody>
                {rollup(data.events.daily).map((r, i) => (
                  <tr key={i} className="border-t border-[#1f2c28]">
                    <td className="py-1.5 pr-3 font-mono">{r.kind}</td>
                    <td className="py-1.5 pr-3">{r.level}</td>
                    <td className="py-1.5 text-right font-mono">{r.n.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <TelemetrySection />

        <p className="text-[10px] text-[#6b8079] pt-4">
          Admin access via SANKOFA_ADMIN_EMAILS env list or rows in public.admins. RLS still applies — service-role bypass only happens inside trusted /api/admin routes.
        </p>
      </div>
    </div>
  );
}

// UX-event rollup — companion starter source split + per-kind sparklines.
// Lives next to the rest of the admin sections; admin-gated server-side.
type Telemetry = {
  ok: boolean;
  totals: { events: number; kinds: number };
  kinds: { kind: string; total: number }[];
  starterCounts: { graph: number; page: number; other: number };
  dailySeries: Record<string, { day: string; n: number }[]>;
};

function TelemetrySection() {
  const [data, setData] = useState<Telemetry | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { supabaseBrowser } = await import("@/lib/supabase");
        const sb = supabaseBrowser();
        if (!sb) return;
        const { data: { session } } = await sb.auth.getSession();
        if (!session) return;
        const res = await fetch("/api/admin/telemetry", { headers: { Authorization: `Bearer ${session.access_token}` } });
        if (res.status === 403) { setErr("Not admin."); return; }
        const j = await res.json();
        if (j.ok) setData(j);
        else setErr(j.error ?? "Couldn't load telemetry.");
      } catch (e) { setErr((e as Error).message); }
    })();
  }, []);

  if (err) return null; // silently skip; main admin page handles broader auth errors
  if (!data) return (
    <section className="rounded-2xl border border-[#2a3a35] bg-[#141d1a] p-6">
      <h2 className="font-medium mb-2">UX events</h2>
      <div className="text-xs text-[#8aa39a] italic">Loading…</div>
    </section>
  );

  const totalStarters = data.starterCounts.graph + data.starterCounts.page + data.starterCounts.other;
  const graphPct = totalStarters > 0 ? Math.round((data.starterCounts.graph / totalStarters) * 100) : 0;
  const pagePct = totalStarters > 0 ? Math.round((data.starterCounts.page / totalStarters) * 100) : 0;

  return (
    <section className="rounded-2xl border border-[#2a3a35] bg-[#141d1a] p-6">
      <h2 className="font-medium mb-4">UX events — last 30 days</h2>
      <div className="grid sm:grid-cols-3 gap-3 mb-5">
        <Counter label="Total events" value={data.totals.events.toLocaleString()} />
        <Counter label="Distinct kinds" value={String(data.totals.kinds)} tone="indigo" />
        <Counter label="Starter clicks" value={String(totalStarters)} tone="amber" />
      </div>

      {totalStarters > 0 && (
        <div className="rounded-xl border border-[#2a3a35] bg-[#0a0f0d] p-4 mb-5">
          <div className="text-[10px] uppercase tracking-widest text-[#8aa39a] mb-2">Companion starter source split</div>
          <div className="flex h-2 rounded-full overflow-hidden bg-[#1f2c28]">
            {data.starterCounts.graph > 0 && (
              <div style={{ width: `${graphPct}%` }} className="bg-[#2cc295]" title={`graph: ${data.starterCounts.graph}`} />
            )}
            {data.starterCounts.page > 0 && (
              <div style={{ width: `${pagePct}%` }} className="bg-[#6c8cff]" title={`page: ${data.starterCounts.page}`} />
            )}
          </div>
          <div className="flex justify-between mt-2 text-[10px]">
            <span className="text-[#2cc295]">graph · {data.starterCounts.graph} ({graphPct}%)</span>
            <span className="text-[#6c8cff]">page · {data.starterCounts.page} ({pagePct}%)</span>
            {data.starterCounts.other > 0 && <span className="text-[#8aa39a]">other · {data.starterCounts.other}</span>}
          </div>
          <p className="mt-3 text-[10px] text-[#6b8079] leading-relaxed">
            Tune the insightStarter threshold (currently degree ≥ 2) if the graph share is too low — that means the bar is too high and most users don&apos;t qualify for a personalized nudge.
          </p>
        </div>
      )}

      <div className="space-y-2">
        {data.kinds.map((k) => (
          <div key={k.kind} className="flex items-center gap-3 px-3 py-2 rounded-xl border border-[#2a3a35] bg-[#0a0f0d]">
            <div className="flex-1 min-w-0">
              <div className="text-xs font-mono truncate">{k.kind}</div>
              <div className="text-[10px] text-[#8aa39a]">{k.total.toLocaleString()} event{k.total === 1 ? "" : "s"}</div>
            </div>
            <div className="w-48 sm:w-64 shrink-0">
              <SparkBars
                data={(data.dailySeries[k.kind] ?? []).map((d) => ({ day: d.day, v: d.n }))}
                format={(n) => String(n)}
              />
            </div>
          </div>
        ))}
        {data.kinds.length === 0 && (
          <p className="text-xs text-[#8aa39a] italic">No events logged yet.</p>
        )}
      </div>
    </section>
  );
}

function Counter({ label, value, tone = "emerald" }: { label: string; value: string; tone?: "emerald" | "amber" | "indigo" | "rust" }) {
  const colors: Record<string, string> = { emerald: "#2cc295", amber: "#f4a949", indigo: "#6c8cff", rust: "#d96444" };
  return (
    <div className="rounded-2xl border border-[#2a3a35] bg-[#141d1a] p-4">
      <div className="text-[10px] uppercase tracking-widest text-[#8aa39a]">{label}</div>
      <div className="mt-1 font-[family-name:var(--font-display)] text-3xl font-semibold" style={{ color: colors[tone] }}>{value}</div>
    </div>
  );
}

function SparkBars({ data, format }: { data: { day: string; v: number }[]; format: (n: number) => string }) {
  if (data.length === 0) return <div className="text-xs text-[#8aa39a] italic">No data.</div>;
  const max = Math.max(...data.map((d) => d.v), 0.0001);
  return (
    <div className="flex items-end gap-1 h-24">
      {data.map((d) => (
        <div key={d.day} className="flex-1 group relative" style={{ height: "100%" }}>
          <div className="absolute bottom-0 left-0 right-0 bg-[#2cc295]/70 hover:bg-[#2cc295] transition rounded-t" style={{ height: `${(d.v / max) * 100}%`, minHeight: "1px" }} />
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 text-[10px] text-[#cfe0d8] bg-[#0c1411] border border-[#2a3a35] rounded px-1.5 py-0.5 opacity-0 group-hover:opacity-100 transition whitespace-nowrap">
            {d.day.slice(5, 10)}: {format(d.v)}
          </div>
        </div>
      ))}
    </div>
  );
}

function dailyTotals(rows: { day: string; cost_usd: number }[]): { day: string; v: number }[] {
  const map = new Map<string, number>();
  for (const r of rows) {
    const k = String(r.day).slice(0, 10);
    map.set(k, (map.get(k) ?? 0) + Number(r.cost_usd ?? 0));
  }
  return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([day, v]) => ({ day, v }));
}

function rollup(rows: { kind: string; level: string; n: number }[]) {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = `${r.kind}::${r.level}`;
    m.set(k, (m.get(k) ?? 0) + Number(r.n ?? 0));
  }
  return Array.from(m.entries()).map(([k, n]) => {
    const [kind, level] = k.split("::");
    return { kind, level, n };
  }).sort((a, b) => b.n - a.n).slice(0, 25);
}
