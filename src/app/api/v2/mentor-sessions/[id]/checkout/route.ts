import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { stripe, isStripeConfigured } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST — start a Stripe Connect Checkout session for an accepted
// mentor session. Body is empty (path provides the id).
//
// Auth: founder only. Status must be 'accepted'. Returns a hosted
// Checkout URL the client redirects to. The Stripe webhook is the
// ONLY thing that flips status='paid' — we never trust the redirect.
//
// The session row already has price_cents + application_fee_pct
// locked in from the request endpoint, so we just compute the fee
// amount and hand both to Stripe.

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!isStripeConfigured()) return Response.json({ ok: false, error: "stripe_not_configured" }, { status: 503 });
  if (!isSupabaseConfigured()) return Response.json({ ok: false, error: "supabase_required" }, { status: 503 });

  const { id } = await ctx.params;
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ ok: false, error: "missing_token" }, { status: 401 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const { data: u, error: e1 } = await sb.auth.getUser(token);
  if (e1 || !u?.user) return Response.json({ ok: false, error: "auth_failed" }, { status: 401 });
  const founderId = u.user.id;
  const founderEmail = u.user.email ?? undefined;

  const { data: session } = await sb.from("mentor_sessions").select("*").eq("id", id).maybeSingle();
  const row = session as {
    id: string; mentor_user_id: string; founder_user_id: string;
    status: string; topic: string; duration_minutes: number;
    price_cents: number; currency: string; application_fee_pct: number;
    paid_at: string | null;
  } | null;
  if (!row) return Response.json({ ok: false, error: "not_found" }, { status: 404 });

  // Only the founder can pay (sanity), and only when in 'accepted'.
  if (row.founder_user_id !== founderId) return Response.json({ ok: false, error: "only_founder_pays" }, { status: 403 });
  if (row.paid_at) return Response.json({ ok: true, alreadyPaid: true });
  if (row.status !== "accepted") {
    return Response.json({ ok: false, error: "wrong_status", message: "Session must be accepted before payment." }, { status: 400 });
  }

  // Mentor's Stripe Connect account.
  const { data: seller } = await sb
    .from("sellers")
    .select("stripe_account_id, charges_enabled")
    .eq("user_id", row.mentor_user_id)
    .maybeSingle();
  const s = seller as { stripe_account_id: string | null; charges_enabled: boolean } | null;
  if (!s || !s.charges_enabled || !s.stripe_account_id) {
    return Response.json({ ok: false, error: "mentor_not_ready" }, { status: 412 });
  }

  // Mentor's display name for the line item label.
  const { data: mentorProfile } = await sb
    .from("user_profiles")
    .select("display_name")
    .eq("user_id", row.mentor_user_id)
    .maybeSingle();
  const mentorName = (mentorProfile as { display_name?: string } | null)?.display_name ?? "Mentor";

  const stripeClient = stripe();
  if (!stripeClient) return Response.json({ ok: false, error: "stripe_not_configured" }, { status: 503 });

  const applicationFeeAmount = Math.floor((row.price_cents * row.application_fee_pct) / 100);
  const origin = new URL(req.url).origin;

  const checkoutSession = await stripeClient.checkout.sessions.create({
    mode: "payment",
    customer_email: founderEmail,
    line_items: [{
      price_data: {
        currency: row.currency,
        product_data: {
          name: `${row.duration_minutes}-min session with ${mentorName}`,
          description: row.topic.slice(0, 200),
        },
        unit_amount: row.price_cents,
      },
      quantity: 1,
    }],
    payment_intent_data: {
      application_fee_amount: applicationFeeAmount,
      transfer_data: { destination: s.stripe_account_id },
      metadata: {
        sankofa_mentor_session_id: row.id,
        sankofa_mentor_id: row.mentor_user_id,
        sankofa_founder_id: founderId,
      },
    },
    metadata: {
      sankofa_mentor_session_id: row.id,
      sankofa_mentor_id: row.mentor_user_id,
      sankofa_founder_id: founderId,
    },
    success_url: `${origin}/studio/mentor-sessions/${row.id}?paid=1`,
    cancel_url: `${origin}/studio/mentor-sessions/${row.id}?paid=0`,
  });

  // Persist the stripe_session_id immediately so even if the webhook
  // is delayed we can match it on the return.
  await sb
    .from("mentor_sessions")
    .update({ stripe_session_id: checkoutSession.id })
    .eq("id", row.id);

  return Response.json({ ok: true, url: checkoutSession.url, sessionId: checkoutSession.id });
}
