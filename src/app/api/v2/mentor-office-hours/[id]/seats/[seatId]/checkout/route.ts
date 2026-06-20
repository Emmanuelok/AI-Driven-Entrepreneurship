import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { stripe, isStripeConfigured } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST — start a Stripe Connect Checkout for a pending office-hours
// seat. Same destination-charge pattern as 1:1 mentor sessions
// (/api/v2/mentor-sessions/[id]/checkout). Webhook flips the seat to
// 'paid' via metadata.sankofa_office_hours_seat_id.

export async function POST(req: Request, ctx: { params: Promise<{ id: string; seatId: string }> }) {
  if (!isStripeConfigured()) return Response.json({ ok: false, error: "stripe_not_configured" }, { status: 503 });
  if (!isSupabaseConfigured()) return Response.json({ ok: false, error: "supabase_required" }, { status: 503 });

  const { id, seatId } = await ctx.params;
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ ok: false, error: "missing_token" }, { status: 401 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const { data: u } = await sb.auth.getUser(token);
  if (!u?.user) return Response.json({ ok: false, error: "auth_failed" }, { status: 401 });
  const founderId = u.user.id;
  const founderEmail = u.user.email ?? undefined;

  // Seat + offering in one round trip via foreign-key shape.
  const { data: seat } = await sb
    .from("mentor_office_hours_seats")
    .select("id, office_hours_id, founder_user_id, status, paid_at, stripe_session_id")
    .eq("id", seatId)
    .eq("office_hours_id", id)
    .maybeSingle();
  if (!seat) return Response.json({ ok: false, error: "seat_not_found" }, { status: 404 });
  const seatRow = seat as { id: string; office_hours_id: string; founder_user_id: string; status: string; paid_at: string | null; stripe_session_id: string | null };
  if (seatRow.founder_user_id !== founderId) return Response.json({ ok: false, error: "only_founder_pays" }, { status: 403 });
  if (seatRow.paid_at) return Response.json({ ok: true, alreadyPaid: true });
  if (seatRow.status !== "pending") {
    return Response.json({ ok: false, error: "wrong_status" }, { status: 400 });
  }

  const { data: offering } = await sb
    .from("mentor_office_hours")
    .select("id, mentor_user_id, title, scheduled_at, duration_minutes, capacity, price_per_seat_cents, currency, application_fee_pct, status")
    .eq("id", id)
    .maybeSingle();
  if (!offering) return Response.json({ ok: false, error: "offering_not_found" }, { status: 404 });
  const o = offering as { id: string; mentor_user_id: string; title: string; scheduled_at: string; duration_minutes: number; capacity: number; price_per_seat_cents: number; currency: string; application_fee_pct: number; status: string };
  if (o.status !== "open") return Response.json({ ok: false, error: "offering_not_open" }, { status: 400 });
  if (o.price_per_seat_cents === 0) {
    // Free offering — shouldn't have hit checkout. Flip the seat just
    // in case the caller raced.
    await sb.from("mentor_office_hours_seats").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", seatId);
    return Response.json({ ok: true, alreadyPaid: true });
  }

  // Mentor's Stripe Connect account.
  const { data: seller } = await sb
    .from("sellers")
    .select("stripe_account_id, charges_enabled")
    .eq("user_id", o.mentor_user_id)
    .maybeSingle();
  const s = seller as { stripe_account_id: string | null; charges_enabled: boolean } | null;
  if (!s || !s.charges_enabled || !s.stripe_account_id) {
    return Response.json({ ok: false, error: "mentor_not_ready" }, { status: 412 });
  }

  // Mentor display name.
  const { data: mentorProfile } = await sb
    .from("user_profiles")
    .select("display_name")
    .eq("user_id", o.mentor_user_id)
    .maybeSingle();
  const mentorName = (mentorProfile as { display_name?: string } | null)?.display_name ?? "Mentor";

  const stripeClient = stripe();
  if (!stripeClient) return Response.json({ ok: false, error: "stripe_not_configured" }, { status: 503 });

  const applicationFeeAmount = Math.floor((o.price_per_seat_cents * o.application_fee_pct) / 100);
  const origin = new URL(req.url).origin;

  const checkoutSession = await stripeClient.checkout.sessions.create({
    mode: "payment",
    customer_email: founderEmail,
    line_items: [{
      price_data: {
        currency: o.currency,
        product_data: {
          name: `Office hours seat: ${o.title}`,
          description: `${o.duration_minutes}-min with ${mentorName} · ${new Date(o.scheduled_at).toLocaleString()}`,
        },
        unit_amount: o.price_per_seat_cents,
      },
      quantity: 1,
    }],
    payment_intent_data: {
      application_fee_amount: applicationFeeAmount,
      transfer_data: { destination: s.stripe_account_id },
      metadata: {
        sankofa_office_hours_seat_id: seatRow.id,
        sankofa_office_hours_id: o.id,
        sankofa_mentor_id: o.mentor_user_id,
        sankofa_founder_id: founderId,
      },
    },
    metadata: {
      sankofa_office_hours_seat_id: seatRow.id,
      sankofa_office_hours_id: o.id,
      sankofa_mentor_id: o.mentor_user_id,
      sankofa_founder_id: founderId,
    },
    success_url: `${origin}/studio/office-hours/${o.id}?paid=1`,
    cancel_url: `${origin}/studio/office-hours/${o.id}?paid=0`,
  });

  await sb
    .from("mentor_office_hours_seats")
    .update({ stripe_session_id: checkoutSession.id })
    .eq("id", seatRow.id);

  return Response.json({ ok: true, url: checkoutSession.url, sessionId: checkoutSession.id });
}
