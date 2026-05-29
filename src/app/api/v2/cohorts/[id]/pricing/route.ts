import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { authCohort, requireCohortRole } from "@/lib/cohort-auth";
import { applicationFeePct } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET   → current pricing (anyone in the cohort, or public via RLS).
// PATCH → set or update pricing. Owner only. Body: { priceCents, currency? }
//         Setting priceCents=0 deletes the row (cohort becomes free).

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: true, mode: "local" });
  const { id } = await ctx.params;
  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const { data } = await sb.from("cohort_pricing").select("price_cents, currency, application_fee_pct").eq("cohort_id", id).maybeSingle();
  return Response.json({ ok: true, pricing: data ?? null });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await ctx.params;
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const me = await authCohort(token, id);
  const forbidden = requireCohortRole(me, "owner");
  if (forbidden) return forbidden;

  let body: { priceCents?: number; currency?: string };
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: "invalid_json" }, { status: 400 }); }

  const price = Math.max(0, Math.floor(body.priceCents ?? 0));
  const currency = (body.currency ?? "usd").toLowerCase().slice(0, 3);
  if (!/^[a-z]{3}$/.test(currency)) return Response.json({ ok: false, error: "invalid_currency" }, { status: 400 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  if (price === 0) {
    await sb.from("cohort_pricing").delete().eq("cohort_id", id);
    return Response.json({ ok: true, pricing: null });
  }

  // Verify the owner has finished Stripe onboarding before we let them
  // set a price — students hitting a paywall on an un-onboarded cohort
  // is the worst failure mode.
  const { data: seller } = await sb.from("sellers").select("charges_enabled").eq("user_id", me!.userId).maybeSingle();
  if (!seller || !seller.charges_enabled) {
    return Response.json({ ok: false, error: "seller_not_ready", message: "Complete Stripe onboarding before setting a price." }, { status: 412 });
  }

  const { error } = await sb.from("cohort_pricing").upsert({
    cohort_id: id,
    seller_id: me!.userId,
    price_cents: price,
    currency,
    application_fee_pct: applicationFeePct(),
  }, { onConflict: "cohort_id" });
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  return Response.json({ ok: true, pricing: { price_cents: price, currency, application_fee_pct: applicationFeePct() } });
}
