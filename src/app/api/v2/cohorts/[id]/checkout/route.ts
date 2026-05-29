import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { stripe, isStripeConfigured, applicationFeePct } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Start a Stripe Checkout session to pay for cohort enrollment.
// Body: { cohortId } (path also has it; we ignore body if both provided)
//
// Returns a session URL. The client redirects the student there; on
// success Stripe redirects them back to /studio/cohorts/[id]?paid=1.
// The webhook is the ONLY thing that writes cohort_enrollments — we
// don't trust the redirect to be tamper-proof.

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
  const studentId = u.user.id;
  const studentEmail = u.user.email ?? undefined;

  // Already paid? Skip the round trip.
  const { data: enrollment } = await sb.from("cohort_enrollments").select("paid_at").eq("cohort_id", id).eq("user_id", studentId).maybeSingle();
  if (enrollment) return Response.json({ ok: true, alreadyPaid: true });

  const { data: pricing } = await sb.from("cohort_pricing").select("price_cents, currency, application_fee_pct, seller_id").eq("cohort_id", id).maybeSingle();
  if (!pricing || pricing.price_cents <= 0) return Response.json({ ok: false, error: "free_cohort" }, { status: 400 });

  const { data: seller } = await sb.from("sellers").select("stripe_account_id, charges_enabled").eq("user_id", pricing.seller_id).maybeSingle();
  if (!seller || !seller.charges_enabled) return Response.json({ ok: false, error: "seller_not_ready" }, { status: 412 });

  const { data: cohort } = await sb.from("cohorts").select("name").eq("id", id).maybeSingle();
  if (!cohort) return Response.json({ ok: false, error: "cohort_not_found" }, { status: 404 });

  const s = stripe();
  if (!s) return Response.json({ ok: false, error: "stripe_not_configured" }, { status: 503 });

  const origin = new URL(req.url).origin;
  const feePct = Number(pricing.application_fee_pct ?? applicationFeePct());
  const applicationFeeAmount = Math.floor((pricing.price_cents * feePct) / 100);

  const session = await s.checkout.sessions.create({
    mode: "payment",
    customer_email: studentEmail,
    line_items: [{
      price_data: {
        currency: pricing.currency,
        product_data: { name: `${cohort.name} — Sankofa cohort enrollment` },
        unit_amount: pricing.price_cents,
      },
      quantity: 1,
    }],
    payment_intent_data: {
      application_fee_amount: applicationFeeAmount,
      transfer_data: { destination: seller.stripe_account_id },
      metadata: { sankofa_cohort_id: id, sankofa_student_id: studentId },
    },
    metadata: { sankofa_cohort_id: id, sankofa_student_id: studentId },
    success_url: `${origin}/studio/cohorts/${id}?paid=1`,
    cancel_url: `${origin}/studio/cohorts/${id}?paid=0`,
  });

  return Response.json({ ok: true, url: session.url, sessionId: session.id });
}
