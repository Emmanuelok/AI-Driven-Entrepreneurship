import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { applyDiscount, type DiscountRow } from "@/lib/discount";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public validation endpoint — buyers paste a code into the checkout
// input; we look it up server-side (so we don't leak the codes table)
// and return either the discounted price preview or a typed reason.
//
// Body: { code, kind: 'cohort'|'build', refId }

export async function POST(req: Request) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });

  let body: { code?: string; kind?: string; refId?: string };
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: "invalid_json" }, { status: 400 }); }
  const code = (body.code ?? "").trim().toUpperCase();
  const kind = body.kind === "cohort" || body.kind === "build" ? body.kind : null;
  const refId = (body.refId ?? "").trim();
  if (!code || !kind || !refId) return Response.json({ ok: false, error: "missing_fields" }, { status: 400 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  // The code must belong to the seller of the product (whether the
  // discount is product-scoped or seller-global). We look up the
  // product's seller first, then search that seller's codes.
  let sellerId: string | null = null;
  let baseCents: number | null = null;
  let currency: string | null = null;

  if (kind === "cohort") {
    const { data: pricing } = await sb.from("cohort_pricing").select("seller_id, price_cents, currency").eq("cohort_id", refId).maybeSingle();
    if (pricing) { sellerId = pricing.seller_id; baseCents = pricing.price_cents; currency = pricing.currency; }
  } else {
    const { data: pricing } = await sb.from("build_pricing").select("seller_id, price_cents, currency").eq("slug", refId).maybeSingle();
    if (pricing) { sellerId = pricing.seller_id; baseCents = pricing.price_cents; currency = pricing.currency; }
  }
  if (!sellerId || baseCents == null) return Response.json({ ok: false, error: "product_not_priced" }, { status: 404 });

  // Case-insensitive lookup via upper(code).
  const { data: discount } = await sb.from("discount_codes")
    .select("id, code, kind, value, applies_to_kind, applies_to_ref, max_redemptions, redemptions, expires_at")
    .eq("seller_id", sellerId)
    .ilike("code", code)
    .maybeSingle();

  const result = applyDiscount(baseCents, (discount as DiscountRow | null) ?? null, { kind, refId, sellerId });
  if (!result.ok) return Response.json({ ok: false, reason: result.reason, message: result.message }, { status: 200 });

  return Response.json({
    ok: true,
    code,
    label: result.label,
    originalCents: result.originalCents,
    discountedCents: result.discountedCents,
    savingsCents: result.savingsCents,
    currency,
  });
}
