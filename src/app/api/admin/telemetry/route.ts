import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { isAdmin } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// UX telemetry rollups for the operator dashboard. Pulls the last 30
// days of ux_events and aggregates:
//   - total count per kind
//   - companion_starter_clicked source split (graph vs page)
//   - 14-day daily series per kind for sparklines
//
// Admin-gated. We do the rollup in JS because the table is small —
// even at a few hundred events/day that's only 30k rows to scan
// per request. When that breaks down we add a materialized view.

const DAY = 86_400_000;

export async function GET(req: Request) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" });
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  const me = await isAdmin(token);
  if (!me.ok) return Response.json({ ok: false, error: "forbidden" }, { status: 403 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const since30 = new Date(Date.now() - 30 * DAY).toISOString();
  const { data: rows } = await sb.from("ux_events")
    .select("kind, meta, created_at")
    .gte("created_at", since30)
    .order("created_at", { ascending: false })
    .limit(20_000);

  const list = (rows ?? []) as Array<{ kind: string; meta: Record<string, unknown> | null; created_at: string }>;

  // Totals + 14-day series per kind.
  const byKind = new Map<string, number>();
  const dailyByKind = new Map<string, Map<string, number>>();
  const since14 = Date.now() - 14 * DAY;
  for (const r of list) {
    byKind.set(r.kind, (byKind.get(r.kind) ?? 0) + 1);
    const ts = new Date(r.created_at).getTime();
    if (ts < since14) continue;
    const day = r.created_at.slice(0, 10);
    const m = dailyByKind.get(r.kind) ?? new Map<string, number>();
    m.set(day, (m.get(day) ?? 0) + 1);
    dailyByKind.set(r.kind, m);
  }

  // Companion starter source split.
  const starterCounts = { graph: 0, page: 0, other: 0 };
  for (const r of list) {
    if (r.kind !== "companion_starter_clicked") continue;
    const src = typeof r.meta?.source === "string" ? (r.meta.source as string) : "other";
    if (src === "graph") starterCounts.graph++;
    else if (src === "page") starterCounts.page++;
    else starterCounts.other++;
  }

  // Pad the 14-day series for each kind so the sparkline doesn't skip
  // zero days.
  const dailySeries: Record<string, { day: string; n: number }[]> = {};
  for (const [kind, m] of dailyByKind.entries()) {
    const series: { day: string; n: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * DAY).toISOString().slice(0, 10);
      series.push({ day: d, n: m.get(d) ?? 0 });
    }
    dailySeries[kind] = series;
  }

  const kinds = Array.from(byKind.entries())
    .map(([kind, total]) => ({ kind, total }))
    .sort((a, b) => b.total - a.total);

  return Response.json({
    ok: true,
    totals: { events: list.length, kinds: kinds.length },
    kinds,
    starterCounts,
    dailySeries,
  });
}
