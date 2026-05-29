import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Buyer initiates a refund request. Looks up the payment intent from
// the cohort_enrollment or build_purchase row, creates a 'pending' row
// the seller can decide on.
//
// Body: { kind: 'cohort'|'build', refId: string, reason?: string }

export async function POST(req: Request) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ ok: false, error: "missing_token" }, { status: 401 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const { data: u, error: e1 } = await sb.auth.getUser(token);
  if (e1 || !u?.user) return Response.json({ ok: false, error: "auth_failed" }, { status: 401 });
  const buyerId = u.user.id;

  let body: { kind?: string; refId?: string; reason?: string };
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: "invalid_json" }, { status: 400 }); }
  const kind = body.kind === "build" ? "build" : body.kind === "cohort" ? "cohort" : null;
  const refId = (body.refId ?? "").trim();
  if (!kind || !refId) return Response.json({ ok: false, error: "missing fields" }, { status: 400 });

  // Find the underlying payment so we can refund the right charge.
  let paymentIntentId: string | null = null;
  let amount = 0;
  let currency = "usd";

  if (kind === "cohort") {
    const { data } = await sb.from("cohort_enrollments")
      .select("stripe_payment_intent_id, amount_cents, currency")
      .eq("cohort_id", refId).eq("user_id", buyerId).maybeSingle();
    if (!data) return Response.json({ ok: false, error: "no_purchase_found" }, { status: 404 });
    paymentIntentId = data.stripe_payment_intent_id;
    amount = data.amount_cents;
    currency = data.currency;
  } else {
    const { data } = await sb.from("build_purchases")
      .select("stripe_payment_intent_id, amount_cents, currency")
      .eq("slug", refId).eq("user_id", buyerId).maybeSingle();
    if (!data) return Response.json({ ok: false, error: "no_purchase_found" }, { status: 404 });
    paymentIntentId = data.stripe_payment_intent_id;
    amount = data.amount_cents;
    currency = data.currency;
  }
  if (!paymentIntentId) return Response.json({ ok: false, error: "no_payment_intent" }, { status: 400 });

  // Dedupe: if a pending request already exists, just return it.
  const { data: existing } = await sb.from("refund_requests")
    .select("id, status")
    .eq("buyer_id", buyerId).eq("kind", kind).eq("ref_id", refId).eq("status", "pending").maybeSingle();
  if (existing) return Response.json({ ok: true, refundRequestId: existing.id, alreadyPending: true });

  const { data: row, error } = await sb.from("refund_requests").insert({
    buyer_id: buyerId,
    kind,
    ref_id: refId,
    stripe_payment_intent_id: paymentIntentId,
    amount_cents: amount,
    currency,
    reason: (body.reason ?? "").slice(0, 2000) || null,
  }).select("id").single();
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  return Response.json({ ok: true, refundRequestId: row.id });
}
