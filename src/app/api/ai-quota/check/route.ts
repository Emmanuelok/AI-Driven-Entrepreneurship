import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Returns the signed-in user's current AI spend vs their quota. Used by
// the topbar badge in cloud mode (local mode falls back to its own
// usage store). Will block AI calls when over the hard quota.

export async function GET(req: Request) {
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, mode: "local" });
  }
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ ok: false, error: "missing token" }, { status: 401 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin client unavailable" }, { status: 500 });

  const { data: u, error: e1 } = await sb.auth.getUser(token);
  if (e1 || !u?.user) return Response.json({ ok: false, error: "auth failed" }, { status: 401 });
  const userId = u.user.id;

  const { data: q } = await sb.from("ai_quotas").select("daily_budget_usd, monthly_budget_usd, hard_block").eq("user_id", userId).maybeSingle();
  const daily = q?.daily_budget_usd ?? 2;
  const monthly = q?.monthly_budget_usd ?? 50;
  const hardBlock = !!q?.hard_block;

  const { data: dailySpend } = await sb.rpc("daily_spend", { uid: userId });
  const { data: monthlySpend } = await sb.rpc("monthly_spend", { uid: userId });

  const dailyUsd = Number(dailySpend ?? 0);
  const monthlyUsd = Number(monthlySpend ?? 0);

  const blocked = hardBlock && (dailyUsd >= daily || monthlyUsd >= monthly);
  return Response.json({
    ok: true,
    daily: { spent: dailyUsd, budget: daily, pct: daily > 0 ? Math.min(100, (dailyUsd / daily) * 100) : 0 },
    monthly: { spent: monthlyUsd, budget: monthly, pct: monthly > 0 ? Math.min(100, (monthlyUsd / monthly) * 100) : 0 },
    blocked,
  });
}
