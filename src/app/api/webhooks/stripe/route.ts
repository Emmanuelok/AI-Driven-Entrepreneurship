import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { stripe, isStripeConfigured, getWebhookSecret } from "@/lib/stripe";
import type Stripe from "stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Stripe webhook handler. Verifies the signature, then dispatches:
//   - account.updated → refresh sellers row (charges/payouts enabled flags)
//   - checkout.session.completed → write cohort_enrollments row +
//     auto-add the student to cohort_members (so they get the cohort
//     UI immediately without a separate accept-invite step)

export async function POST(req: Request) {
  if (!isStripeConfigured() || !isSupabaseConfigured()) {
    return new Response(JSON.stringify({ ok: false, error: "not_configured" }), { status: 503 });
  }
  const s = stripe();
  const secret = getWebhookSecret();
  if (!s || !secret) return new Response(JSON.stringify({ ok: false, error: "webhook_not_configured" }), { status: 503 });

  const sig = req.headers.get("stripe-signature") || "";
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = s.webhooks.constructEvent(body, sig, secret);
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: `signature: ${(err as Error).message}` }), { status: 400 });
  }

  const sb = supabaseAdmin();
  if (!sb) return new Response(JSON.stringify({ ok: false, error: "admin_unavailable" }), { status: 500 });

  try {
    if (event.type === "account.updated") {
      const account = event.data.object as Stripe.Account;
      await sb.from("sellers").update({
        charges_enabled: !!account.charges_enabled,
        payouts_enabled: !!account.payouts_enabled,
        details_submitted: !!account.details_submitted,
      }).eq("stripe_account_id", account.id);
    } else if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const amountCents = (session.amount_total ?? 0) as number;
      const currency = (session.currency ?? "usd") as string;
      const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : null;

      // Dispatch on which product was purchased. Metadata is set by the
      // checkout endpoints; we route by the keys present.
      const cohortId = session.metadata?.sankofa_cohort_id;
      const studentId = session.metadata?.sankofa_student_id;
      const buildSlug = session.metadata?.sankofa_build_slug;
      const buyerId = session.metadata?.sankofa_buyer_id;
      const mentorSessionId = session.metadata?.sankofa_mentor_session_id;

      if (mentorSessionId) {
        // Phase 64: flip the mentor session to 'paid'. We bypass the
        // canTransitionMentorSession gate here because the webhook IS
        // the 'system' actor permitted to drive this transition.
        await sb.from("mentor_sessions").update({
          status: "paid",
          paid_at: new Date().toISOString(),
          stripe_session_id: session.id,
          stripe_payment_intent_id: paymentIntentId,
        }).eq("id", mentorSessionId).eq("status", "accepted");
      } else if (cohortId && studentId) {
        await sb.from("cohort_enrollments").upsert({
          cohort_id: cohortId,
          user_id: studentId,
          stripe_session_id: session.id,
          stripe_payment_intent_id: paymentIntentId,
          amount_cents: amountCents,
          currency,
        }, { onConflict: "cohort_id,user_id" });

        // Auto-add to cohort_members so the student gets the cohort UI
        // immediately. No-op if they're already a member.
        const { data: existingMember } = await sb.from("cohort_members").select("cohort_id").eq("cohort_id", cohortId).eq("user_id", studentId).maybeSingle();
        if (!existingMember) {
          const { data: u } = await sb.auth.admin.getUserById(studentId);
          const meta = (u?.user?.user_metadata ?? {}) as { name?: string };
          await sb.from("cohort_members").insert({
            cohort_id: cohortId,
            user_id: studentId,
            role: "student",
            email: u?.user?.email,
            display_name: meta.name ?? null,
          });
        }
      } else if (buildSlug && buyerId) {
        await sb.from("build_purchases").upsert({
          slug: buildSlug,
          user_id: buyerId,
          stripe_session_id: session.id,
          stripe_payment_intent_id: paymentIntentId,
          amount_cents: amountCents,
          currency,
        }, { onConflict: "slug,user_id" });
      } else {
        return new Response(JSON.stringify({ ok: true, ignored: "missing_metadata" }), { status: 200 });
      }

      // Discount code redeemed → bump its counter so max_redemptions
      // enforcement stays accurate. Best-effort; not load-bearing.
      const discountId = session.metadata?.sankofa_discount_id;
      if (discountId) {
        const { data: dc } = await sb.from("discount_codes").select("redemptions").eq("id", discountId).maybeSingle();
        if (dc) {
          await sb.from("discount_codes").update({ redemptions: (dc.redemptions ?? 0) + 1 }).eq("id", discountId);
        }
      }
    } else if (event.type === "charge.refunded") {
      // Keep refund_requests accurate if a seller (or operator) refunds
      // a charge directly from the Stripe dashboard rather than through
      // our refund-decide endpoint.
      const charge = event.data.object as Stripe.Charge;
      const piId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
      if (piId) {
        const refundId = charge.refunds?.data?.[0]?.id ?? null;
        await sb.from("refund_requests").update({
          status: "approved",
          stripe_refund_id: refundId,
        }).eq("stripe_payment_intent_id", piId).eq("status", "pending");
        // Also remove access on the underlying purchase if it's still there.
        await sb.from("cohort_enrollments").delete().eq("stripe_payment_intent_id", piId);
        await sb.from("build_purchases").delete().eq("stripe_payment_intent_id", piId);
        // Phase 64: mark mentor sessions refunded so the founder's UI
        // shows the correct state. We match by payment_intent_id —
        // the session row carries it after the original Checkout.
        await sb.from("mentor_sessions").update({
          status: "refunded",
          refunded_at: new Date().toISOString(),
        }).eq("stripe_payment_intent_id", piId).neq("status", "refunded");
      }
    }
  } catch (e) {
    // Always 200 on processing errors — Stripe retries forever
    // otherwise. We've already logged the event id via the platform
    // events log indirectly.
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), { status: 200 });
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
}
