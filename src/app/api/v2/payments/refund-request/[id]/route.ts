import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { stripe, isStripeConfigured } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PATCH → seller decides on a pending request.
// Body: { decision: 'approved' | 'declined' }
// On 'approved' we call Stripe to refund the payment, revoke access,
// and update the refund_requests row to terminal state.

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  if (!isStripeConfigured()) return Response.json({ ok: false, error: "stripe_not_configured" }, { status: 503 });

  const { id } = await ctx.params;
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ ok: false, error: "missing_token" }, { status: 401 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const { data: u, error: e1 } = await sb.auth.getUser(token);
  if (e1 || !u?.user) return Response.json({ ok: false, error: "auth_failed" }, { status: 401 });
  const sellerId = u.user.id;

  let body: { decision?: string };
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: "invalid_json" }, { status: 400 }); }
  const decision = body.decision === "approved" ? "approved" : body.decision === "declined" ? "declined" : null;
  if (!decision) return Response.json({ ok: false, error: "invalid_decision" }, { status: 400 });

  // Load the request and confirm the caller owns the product.
  const { data: rr } = await sb.from("refund_requests").select("*").eq("id", id).maybeSingle();
  if (!rr) return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  if (rr.status !== "pending") return Response.json({ ok: false, error: "already_decided" }, { status: 409 });

  let isOwner = false;
  if (rr.kind === "cohort") {
    const { data: cohort } = await sb.from("cohorts").select("owner_id").eq("id", rr.ref_id).maybeSingle();
    isOwner = cohort?.owner_id === sellerId;
  } else if (rr.kind === "build") {
    const { data: build } = await sb.from("public_builds").select("owner_id").eq("slug", rr.ref_id).maybeSingle();
    isOwner = build?.owner_id === sellerId;
  }
  if (!isOwner) return Response.json({ ok: false, error: "forbidden" }, { status: 403 });

  if (decision === "declined") {
    await sb.from("refund_requests").update({ status: "declined", decided_by: sellerId }).eq("id", id);
    return Response.json({ ok: true, status: "declined" });
  }

  // Approved — execute the Stripe refund.
  const s = stripe();
  if (!s) return Response.json({ ok: false, error: "stripe_not_configured" }, { status: 503 });

  let refundId: string;
  try {
    // Reverse the application fee so the buyer is whole AND the seller
    // doesn't pay platform fee on a transaction they're not keeping.
    const refund = await s.refunds.create({
      payment_intent: rr.stripe_payment_intent_id,
      reverse_transfer: true,
      refund_application_fee: true,
    });
    refundId = refund.id;
  } catch (e) {
    return Response.json({ ok: false, error: "stripe_refund_failed", message: (e as Error).message }, { status: 502 });
  }

  // Revoke access: remove the enrollment/purchase row + (for cohorts)
  // the cohort_member row so the buyer immediately loses access.
  if (rr.kind === "cohort") {
    await sb.from("cohort_enrollments").delete().eq("cohort_id", rr.ref_id).eq("user_id", rr.buyer_id);
    await sb.from("cohort_members").delete().eq("cohort_id", rr.ref_id).eq("user_id", rr.buyer_id).eq("role", "student");
  } else if (rr.kind === "build") {
    await sb.from("build_purchases").delete().eq("slug", rr.ref_id).eq("user_id", rr.buyer_id);
  }

  await sb.from("refund_requests").update({
    status: "approved",
    decided_by: sellerId,
    stripe_refund_id: refundId,
  }).eq("id", id);

  return Response.json({ ok: true, status: "approved", refundId });
}
