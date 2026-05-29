import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { stripe, isStripeConfigured, applicationFeePct } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Start Checkout for a paid build. Returns the session URL. The
// webhook writes build_purchases on successful payment. Skip-path
// if the user has already bought.

export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  if (!isStripeConfigured()) return Response.json({ ok: false, error: "stripe_not_configured" }, { status: 503 });
  if (!isSupabaseConfigured()) return Response.json({ ok: false, error: "supabase_required" }, { status: 503 });

  const { slug } = await ctx.params;
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ ok: false, error: "missing_token" }, { status: 401 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const { data: u, error: e1 } = await sb.auth.getUser(token);
  if (e1 || !u?.user) return Response.json({ ok: false, error: "auth_failed" }, { status: 401 });
  const buyerId = u.user.id;
  const buyerEmail = u.user.email ?? undefined;

  const { data: build } = await sb.from("public_builds").select("title, owner_id").eq("slug", slug).maybeSingle();
  if (!build) return Response.json({ ok: false, error: "build_not_found" }, { status: 404 });
  if (build.owner_id === buyerId) {
    return Response.json({ ok: false, error: "own_build", message: "You own this build — forks are free for you." }, { status: 400 });
  }

  // Already paid? Short-circuit.
  const { data: existing } = await sb.from("build_purchases").select("paid_at").eq("slug", slug).eq("user_id", buyerId).maybeSingle();
  if (existing) return Response.json({ ok: true, alreadyPaid: true });

  const { data: pricing } = await sb.from("build_pricing").select("price_cents, currency, application_fee_pct, seller_id").eq("slug", slug).maybeSingle();
  if (!pricing || pricing.price_cents <= 0) return Response.json({ ok: false, error: "free_build" }, { status: 400 });

  const { data: seller } = await sb.from("sellers").select("stripe_account_id, charges_enabled").eq("user_id", pricing.seller_id).maybeSingle();
  if (!seller || !seller.charges_enabled) return Response.json({ ok: false, error: "seller_not_ready" }, { status: 412 });

  const s = stripe();
  if (!s) return Response.json({ ok: false, error: "stripe_not_configured" }, { status: 503 });

  const origin = new URL(req.url).origin;
  const feePct = Number(pricing.application_fee_pct ?? applicationFeePct());
  const applicationFeeAmount = Math.floor((pricing.price_cents * feePct) / 100);

  const session = await s.checkout.sessions.create({
    mode: "payment",
    customer_email: buyerEmail,
    line_items: [{
      price_data: {
        currency: pricing.currency,
        product_data: { name: `${build.title} — Sankofa build` },
        unit_amount: pricing.price_cents,
      },
      quantity: 1,
    }],
    payment_intent_data: {
      application_fee_amount: applicationFeeAmount,
      transfer_data: { destination: seller.stripe_account_id },
      metadata: { sankofa_build_slug: slug, sankofa_buyer_id: buyerId },
    },
    metadata: { sankofa_build_slug: slug, sankofa_buyer_id: buyerId },
    success_url: `${origin}/studio/marketplace/${slug}?paid=1`,
    cancel_url: `${origin}/studio/marketplace/${slug}?paid=0`,
  });

  return Response.json({ ok: true, url: session.url, sessionId: session.id });
}
