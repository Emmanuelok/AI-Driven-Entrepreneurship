import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { stripe, isStripeConfigured } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Seller payouts dashboard data. Combines:
//   - Recent sales (from public.seller_sales view — local DB)
//   - Stripe Balance (available + pending)
//   - Last 5 payouts (Stripe API on the connected account)
//
// Gracefully degrades: returns just the local sales when Stripe is
// reachable but the connected account isn't ready, or just an empty
// shape when neither is configured.

export async function GET(req: Request) {
  if (!isStripeConfigured() || !isSupabaseConfigured()) {
    return Response.json({ ok: true, configured: false, sales: [], totals: emptyTotals() });
  }
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ ok: false, error: "missing_token" }, { status: 401 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const { data: u, error: e1 } = await sb.auth.getUser(token);
  if (e1 || !u?.user) return Response.json({ ok: false, error: "auth_failed" }, { status: 401 });
  const userId = u.user.id;

  // Local sales — newest first, capped to 50.
  const { data: sales } = await sb.from("seller_sales")
    .select("kind, ref_id, ref_name, buyer_id, amount_cents, currency, ts")
    .eq("seller_id", userId)
    .order("ts", { ascending: false })
    .limit(50);

  const totals = aggregateTotals(sales ?? []);

  // Stripe Balance + recent payouts — only when the seller's account
  // is reachable. Failures fall through gracefully.
  let balance: { available: { amount: number; currency: string }[]; pending: { amount: number; currency: string }[] } | null = null;
  let payouts: Array<{ id: string; amount: number; currency: string; status: string; arrival_date: number }> = [];
  const { data: seller } = await sb.from("sellers").select("stripe_account_id, charges_enabled").eq("user_id", userId).maybeSingle();
  if (seller?.stripe_account_id) {
    const s = stripe();
    if (s) {
      try {
        const bal = await s.balance.retrieve({}, { stripeAccount: seller.stripe_account_id });
        balance = {
          available: (bal.available ?? []).map((b) => ({ amount: b.amount, currency: b.currency })),
          pending: (bal.pending ?? []).map((b) => ({ amount: b.amount, currency: b.currency })),
        };
        const ps = await s.payouts.list({ limit: 5 }, { stripeAccount: seller.stripe_account_id });
        payouts = ps.data.map((p) => ({ id: p.id, amount: p.amount, currency: p.currency, status: p.status, arrival_date: p.arrival_date }));
      } catch {
        // Network or auth error — leave balance/payouts empty.
      }
    }
  }

  return Response.json({
    ok: true,
    configured: true,
    sellerReady: !!seller?.charges_enabled,
    sales: sales ?? [],
    totals,
    balance,
    payouts,
  });
}

function emptyTotals() {
  return { allTime: 0, last30d: 0, salesCount: 0, currency: "usd" };
}

function aggregateTotals(rows: Array<{ amount_cents: number; currency: string; ts: string }>) {
  const since30 = Date.now() - 30 * 86_400_000;
  let allTime = 0;
  let last30d = 0;
  let currency = "usd";
  for (const r of rows) {
    allTime += r.amount_cents;
    if (new Date(r.ts).getTime() >= since30) last30d += r.amount_cents;
    currency = r.currency || currency;
  }
  return { allTime, last30d, salesCount: rows.length, currency };
}
