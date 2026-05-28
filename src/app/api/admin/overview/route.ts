import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { isAdmin } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Operator overview. Aggregates:
//   - last 30d AI spend rolled up daily + by scope
//   - last 30d event volume by kind/level
//   - count of users, ventures, builds, sketches, public_ventures, public_builds
//   - top error events (level ∈ ('error','fatal')) last 7d
//
// Strictly admin-gated.

export async function GET(req: Request) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" });

  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  const me = await isAdmin(token);
  if (!me.ok) return Response.json({ ok: false, error: "forbidden" }, { status: 403 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin unavailable" }, { status: 500 });

  const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const since7 = new Date(Date.now() - 7 * 86_400_000).toISOString();

  // AI cost roll-up (last 30 days)
  const { data: aiDaily } = await sb.from("daily_ai_cost").select("*").gte("day", since30).order("day", { ascending: true });
  const aiByScope = new Map<string, number>();
  let totalUsd = 0;
  for (const row of aiDaily ?? []) {
    const usd = Number((row as { cost_usd?: number }).cost_usd ?? 0);
    aiByScope.set((row as { scope?: string }).scope ?? "unknown", (aiByScope.get((row as { scope?: string }).scope ?? "unknown") ?? 0) + usd);
    totalUsd += usd;
  }

  // Event roll-up
  const { data: eventsDaily } = await sb.from("daily_events").select("*").gte("day", since30);

  // Top errors last 7d
  const { data: topErrors } = await sb.from("events")
    .select("kind, scope, message, level, created_at, ctx")
    .gte("created_at", since7)
    .in("level", ["error", "fatal"])
    .order("created_at", { ascending: false })
    .limit(30);

  // User + content counts (rough).
  const counts = await Promise.all([
    sb.from("sankofa_main").select("*", { count: "exact", head: true }),
    sb.from("public_ventures").select("*", { count: "exact", head: true }),
    sb.from("public_builds").select("*", { count: "exact", head: true }),
    sb.from("ai_usage").select("*", { count: "exact", head: true }).gte("created_at", since30),
  ]);

  return Response.json({
    ok: true,
    me: { userId: me.userId, email: me.email },
    spend: {
      last30dUsd: Number(totalUsd.toFixed(2)),
      byScope: Array.from(aiByScope.entries()).map(([scope, usd]) => ({ scope, usd: Number(usd.toFixed(4)) })).sort((a, b) => b.usd - a.usd),
      daily: aiDaily ?? [],
    },
    events: { daily: eventsDaily ?? [], topErrors: topErrors ?? [] },
    counts: {
      users: counts[0].count ?? 0,
      publicVentures: counts[1].count ?? 0,
      publicBuilds: counts[2].count ?? 0,
      aiCalls30d: counts[3].count ?? 0,
    },
  });
}
