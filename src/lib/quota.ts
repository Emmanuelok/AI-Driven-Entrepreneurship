import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

// Per-user AI spend cap. Routes call this BEFORE hitting Anthropic on
// the platform key — if the student is over their daily or monthly
// budget AND the quota row is set to hard-block, we return a typed
// 402 instead of burning more spend.
//
// Skipped entirely when:
//   - The request used BYOK (it's the student's own key, not ours)
//   - Supabase isn't configured (local-first mode has no quota concept)
//   - The user is anonymous (no token → no spend attribution)
//
// Default quota: $2/day, $50/month, soft-block. Operators can tighten
// or relax per user via the ai_quotas table.

export type QuotaCheck =
  | { ok: true; dailyUsd: number; dailyBudget: number; monthlyUsd: number; monthlyBudget: number }
  | { ok: false; reason: "daily" | "monthly"; dailyUsd: number; dailyBudget: number; monthlyUsd: number; monthlyBudget: number };

export async function checkQuota(authToken: string | undefined): Promise<QuotaCheck | null> {
  if (!authToken || !isSupabaseConfigured()) return null;
  const sb = supabaseAdmin();
  if (!sb) return null;

  const { data: u } = await sb.auth.getUser(authToken);
  if (!u?.user) return null;
  const uid = u.user.id;

  // Pull caps + current spend in parallel — three round trips become one.
  const [q, daily, monthly] = await Promise.all([
    sb.from("ai_quotas").select("daily_budget_usd, monthly_budget_usd, hard_block").eq("user_id", uid).maybeSingle(),
    sb.rpc("daily_spend", { uid }),
    sb.rpc("monthly_spend", { uid }),
  ]);

  const dailyBudget = Number(q.data?.daily_budget_usd ?? 2);
  const monthlyBudget = Number(q.data?.monthly_budget_usd ?? 50);
  const hardBlock = !!q.data?.hard_block;
  const dailyUsd = Number(daily.data ?? 0);
  const monthlyUsd = Number(monthly.data ?? 0);

  if (!hardBlock) return { ok: true, dailyUsd, dailyBudget, monthlyUsd, monthlyBudget };
  if (dailyUsd >= dailyBudget) return { ok: false, reason: "daily", dailyUsd, dailyBudget, monthlyUsd, monthlyBudget };
  if (monthlyUsd >= monthlyBudget) return { ok: false, reason: "monthly", dailyUsd, dailyBudget, monthlyUsd, monthlyBudget };
  return { ok: true, dailyUsd, dailyBudget, monthlyUsd, monthlyBudget };
}

// Convenience wrapper for AI routes. Returns a Response only when the
// caller should bail out; null when they should proceed.
//
// Usage:
//   const block = await enforceQuotaForPlatform(req, keySource);
//   if (block) return block;
//
export async function enforceQuotaForPlatform(req: Request, keySource: "byok" | "platform" | "none"): Promise<Response | null> {
  if (keySource !== "platform") return null; // BYOK spends their own money

  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "") || undefined;
  const check = await checkQuota(token);
  if (!check || check.ok) return null;

  return new Response(
    JSON.stringify({
      error: "quota_exceeded",
      reason: check.reason,
      message: check.reason === "daily"
        ? `Daily AI budget of $${check.dailyBudget.toFixed(2)} reached ($${check.dailyUsd.toFixed(2)} used). Add a personal Anthropic key in Settings to keep going, or wait until the daily counter resets at midnight UTC.`
        : `Monthly AI budget of $${check.monthlyBudget.toFixed(2)} reached. Add a personal Anthropic key in Settings, or contact your admin to raise the cap.`,
      dailyUsd: check.dailyUsd,
      dailyBudget: check.dailyBudget,
      monthlyUsd: check.monthlyUsd,
      monthlyBudget: check.monthlyBudget,
    }),
    { status: 402, headers: { "Content-Type": "application/json", "X-Quota-Reason": check.reason } },
  );
}
