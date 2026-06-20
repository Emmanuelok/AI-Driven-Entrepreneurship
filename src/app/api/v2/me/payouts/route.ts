import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { bearerToken } from "@/lib/workspace-auth";
import { stripe, isStripeConfigured } from "@/lib/stripe";
import {
  categorizeBalance, summarizePayoutSchedule, normalizePayout,
  type BalanceState, type PayoutScheduleSummary, type PayoutRow,
  type RawStripeBalance, type RawSchedule,
} from "@/lib/payouts";
import type Stripe from "stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — the mentor's live Stripe Connect payouts picture: current
//       balance (available / pending / instant-available), the
//       payout schedule on their connected account, recent payouts
//       (default last 10), and whether the account is ready to
//       receive money.
//
// The response degrades gracefully through three states:
//   1. no seller row     → setupRequired: true
//   2. seller, !charges  → setupInProgress: true
//   3. fully onboarded   → live balance + payouts
//
// We tolerate Stripe API failures: if the live call errors, we still
// return what we know from our DB (sellerReady flag + setupRequired
// hints) so the page renders rather than crashing.

export type PayoutsResponse = {
  ok: true;
  sellerReady: boolean;
  setupRequired: boolean;
  setupInProgress: boolean;
  country: string | null;
  // null when Stripe wasn't reachable or charges aren't enabled.
  balance: BalanceState | null;
  schedule: PayoutScheduleSummary | null;
  payouts: PayoutRow[];
  liveError: string | null;
} | { ok: false; error: string; mode?: string };

export async function GET(req: Request): Promise<Response> {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local", error: "supabase_required" }, { status: 503 });
  const token = bearerToken(req);
  if (!token) return Response.json({ ok: false, error: "missing_token" }, { status: 401 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const { data: u, error: e1 } = await sb.auth.getUser(token);
  if (e1 || !u?.user) return Response.json({ ok: false, error: "auth_failed" }, { status: 401 });

  // Seller row?
  const { data: sellerRow } = await sb
    .from("sellers")
    .select("stripe_account_id, charges_enabled, payouts_enabled, details_submitted, country")
    .eq("user_id", u.user.id)
    .maybeSingle();
  const seller = sellerRow as { stripe_account_id: string | null; charges_enabled: boolean; payouts_enabled: boolean; details_submitted: boolean; country: string | null } | null;

  const limit = Math.max(1, Math.min(50, parseInt(new URL(req.url).searchParams.get("limit") ?? "10", 10) || 10));

  if (!seller || !seller.stripe_account_id) {
    return Response.json({
      ok: true,
      sellerReady: false,
      setupRequired: true,
      setupInProgress: false,
      country: null,
      balance: null,
      schedule: null,
      payouts: [],
      liveError: null,
    } satisfies PayoutsResponse);
  }

  if (!seller.charges_enabled) {
    return Response.json({
      ok: true,
      sellerReady: false,
      setupRequired: false,
      setupInProgress: !seller.details_submitted || !seller.payouts_enabled,
      country: seller.country,
      balance: null,
      schedule: null,
      payouts: [],
      liveError: null,
    } satisfies PayoutsResponse);
  }

  if (!isStripeConfigured()) {
    return Response.json({
      ok: true,
      sellerReady: true,
      setupRequired: false,
      setupInProgress: false,
      country: seller.country,
      balance: null,
      schedule: null,
      payouts: [],
      liveError: "stripe_not_configured",
    } satisfies PayoutsResponse);
  }

  const sc = stripe();
  if (!sc) {
    return Response.json({
      ok: true, sellerReady: true, setupRequired: false, setupInProgress: false,
      country: seller.country, balance: null, schedule: null, payouts: [], liveError: "stripe_unavailable",
    } satisfies PayoutsResponse);
  }
  const accountId = seller.stripe_account_id;

  let balance: BalanceState | null = null;
  let schedule: PayoutScheduleSummary | null = null;
  let payouts: PayoutRow[] = [];
  let liveError: string | null = null;

  try {
    const [balRes, payoutsRes, accountRes] = await Promise.all([
      sc.balance.retrieve({}, { stripeAccount: accountId }),
      sc.payouts.list({ limit }, { stripeAccount: accountId }),
      sc.accounts.retrieve(accountId),
    ]);

    const raw: RawStripeBalance = {
      available: balRes.available.map((a) => ({ amount: a.amount, currency: a.currency })),
      pending: balRes.pending.map((a) => ({ amount: a.amount, currency: a.currency })),
      instant_available: (balRes.instant_available ?? []).map((a) => ({ amount: a.amount, currency: a.currency })),
    };
    balance = categorizeBalance(raw);

    const sched = (accountRes as Stripe.Account).settings?.payouts?.schedule as RawSchedule | undefined;
    schedule = summarizePayoutSchedule(sched ?? null, { availableCents: balance.availableCents });

    payouts = payoutsRes.data.map((p) =>
      normalizePayout({
        id: p.id,
        amount: p.amount,
        currency: p.currency,
        status: p.status,
        arrival_date: p.arrival_date,
        created: p.created,
        method: p.method,
        automatic: p.automatic,
        description: p.description,
        failure_message: p.failure_message,
      }),
    );
  } catch (e) {
    liveError = (e as Error).message || "stripe_call_failed";
  }

  return Response.json({
    ok: true,
    sellerReady: true,
    setupRequired: false,
    setupInProgress: false,
    country: seller.country,
    balance,
    schedule,
    payouts,
    liveError,
  } satisfies PayoutsResponse);
}
