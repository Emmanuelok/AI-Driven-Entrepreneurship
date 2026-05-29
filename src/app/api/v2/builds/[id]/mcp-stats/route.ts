import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { authBuild } from "@/lib/build-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// MCP usage stats for a build. Pulled from mcp_invocations + the
// canonical Sonnet pricing.
//
// Returns: totals (calls, tokens, cost, unique callers), per-tool
// rollup, last 20 invocations, and a 14-day daily series for the
// sparkline. Only build members see this — owners care most, but
// editors get visibility too.

const PRICE_IN_PER_TOKEN = 3 / 1_000_000;             // Sonnet 4.6 input
const PRICE_OUT_PER_TOKEN = 15 / 1_000_000;           // Sonnet 4.6 output

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await ctx.params;
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const me = await authBuild(token, id);
  if (!me) return Response.json({ ok: false, error: "not_a_member" }, { status: 403 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const since14 = new Date(Date.now() - 14 * 86_400_000).toISOString();

  // Pull everything in the 30-day window — we aggregate in JS to stay
  // simple. At MCP-scale this is fine.
  const { data: rows } = await sb.from("mcp_invocations")
    .select("caller_user_id, tool_name, tokens_in, tokens_out, ok, error, duration_ms, created_at")
    .eq("build_slug", id)
    .gte("created_at", since30)
    .order("created_at", { ascending: false })
    .limit(2000);

  const list = (rows ?? []) as Array<{ caller_user_id: string; tool_name: string; tokens_in: number; tokens_out: number; ok: boolean; error: string | null; duration_ms: number | null; created_at: string }>;

  // Totals.
  const totals = {
    calls: list.length,
    okCalls: list.filter((r) => r.ok).length,
    tokensIn: 0,
    tokensOut: 0,
    costUsd: 0,
    uniqueCallers: new Set(list.map((r) => r.caller_user_id)).size,
  };
  for (const r of list) {
    totals.tokensIn += r.tokens_in;
    totals.tokensOut += r.tokens_out;
    totals.costUsd += r.tokens_in * PRICE_IN_PER_TOKEN + r.tokens_out * PRICE_OUT_PER_TOKEN;
  }

  // Per-tool rollup.
  const byTool = new Map<string, { calls: number; tokensIn: number; tokensOut: number; costUsd: number; errors: number }>();
  for (const r of list) {
    const cur = byTool.get(r.tool_name) ?? { calls: 0, tokensIn: 0, tokensOut: 0, costUsd: 0, errors: 0 };
    cur.calls++;
    cur.tokensIn += r.tokens_in;
    cur.tokensOut += r.tokens_out;
    cur.costUsd += r.tokens_in * PRICE_IN_PER_TOKEN + r.tokens_out * PRICE_OUT_PER_TOKEN;
    if (!r.ok) cur.errors++;
    byTool.set(r.tool_name, cur);
  }
  const tools = Array.from(byTool.entries())
    .map(([name, v]) => ({ name, ...v, costUsd: Number(v.costUsd.toFixed(4)) }))
    .sort((a, b) => b.calls - a.calls);

  // 14-day daily series for a sparkline.
  const byDay = new Map<string, number>();
  for (const r of list) {
    const ts = new Date(r.created_at).getTime();
    if (ts < new Date(since14).getTime()) continue;
    const k = r.created_at.slice(0, 10);
    byDay.set(k, (byDay.get(k) ?? 0) + 1);
  }
  // Fill missing days with zero so the sparkline looks correct.
  const daily: { day: string; n: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    daily.push({ day: d, n: byDay.get(d) ?? 0 });
  }

  // Recent invocations (last 20). Drop the caller id and report it as
  // an anonymous "caller_id" prefix so authors can group repeat callers
  // without seeing identity.
  const recent = list.slice(0, 20).map((r) => ({
    callerHandle: r.caller_user_id.slice(0, 8),
    tool: r.tool_name,
    tokensIn: r.tokens_in,
    tokensOut: r.tokens_out,
    ok: r.ok,
    error: r.error,
    durationMs: r.duration_ms,
    ts: r.created_at,
  }));

  return Response.json({
    ok: true,
    totals: { ...totals, costUsd: Number(totals.costUsd.toFixed(4)) },
    tools,
    daily,
    recent,
  });
}
