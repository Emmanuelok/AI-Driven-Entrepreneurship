import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { stripe, isStripeConfigured } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Reports the signed-in user's Stripe Connect status. On every call we
// also refresh from Stripe so the local DB matches reality — webhook
// drives most updates but explicit fetch is more reliable when the
// user just returned from onboarding.

export async function GET(req: Request) {
  if (!isStripeConfigured() || !isSupabaseConfigured()) {
    return Response.json({ ok: true, configured: false, ready: false });
  }
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ ok: false, error: "missing_token" }, { status: 401 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const { data: u, error: e1 } = await sb.auth.getUser(token);
  if (e1 || !u?.user) return Response.json({ ok: false, error: "auth_failed" }, { status: 401 });

  const { data: seller } = await sb.from("sellers").select("*").eq("user_id", u.user.id).maybeSingle();
  if (!seller) return Response.json({ ok: true, configured: true, ready: false, hasAccount: false });

  const s = stripe();
  if (!s) return Response.json({ ok: false, error: "stripe_not_configured" }, { status: 503 });

  // Pull the live Stripe account to refresh local flags. Cheap call,
  // OK on every status check.
  let chargesEnabled = seller.charges_enabled;
  let payoutsEnabled = seller.payouts_enabled;
  let detailsSubmitted = seller.details_submitted;
  try {
    const account = await s.accounts.retrieve(seller.stripe_account_id);
    chargesEnabled = !!account.charges_enabled;
    payoutsEnabled = !!account.payouts_enabled;
    detailsSubmitted = !!account.details_submitted;
    if (chargesEnabled !== seller.charges_enabled || payoutsEnabled !== seller.payouts_enabled || detailsSubmitted !== seller.details_submitted) {
      await sb.from("sellers").update({
        charges_enabled: chargesEnabled,
        payouts_enabled: payoutsEnabled,
        details_submitted: detailsSubmitted,
      }).eq("user_id", u.user.id);
    }
  } catch {
    // Use the stored values when Stripe is unreachable.
  }

  return Response.json({
    ok: true,
    configured: true,
    hasAccount: true,
    accountId: seller.stripe_account_id,
    country: seller.country,
    chargesEnabled,
    payoutsEnabled,
    detailsSubmitted,
    ready: chargesEnabled && payoutsEnabled,
  });
}
