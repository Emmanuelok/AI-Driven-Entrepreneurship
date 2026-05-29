import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { applicationFeePct } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET   → current pricing on a public build (anyone)
// PATCH → set / clear pricing (owner only). Body: { priceCents, currency? }
//         priceCents=0 deletes the row (build becomes free again).

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: true, mode: "local", pricing: null });
  const { slug } = await ctx.params;
  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const { data } = await sb.from("build_pricing").select("price_cents, currency, application_fee_pct").eq("slug", slug).maybeSingle();
  return Response.json({ ok: true, pricing: data ?? null });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { slug } = await ctx.params;
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ ok: false, error: "missing_token" }, { status: 401 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const { data: u, error: e1 } = await sb.auth.getUser(token);
  if (e1 || !u?.user) return Response.json({ ok: false, error: "auth_failed" }, { status: 401 });

  // Verify the caller owns this build.
  const { data: build } = await sb.from("public_builds").select("owner_id").eq("slug", slug).maybeSingle();
  if (!build) return Response.json({ ok: false, error: "build_not_found" }, { status: 404 });
  if (build.owner_id !== u.user.id) return Response.json({ ok: false, error: "forbidden" }, { status: 403 });

  let body: { priceCents?: number; currency?: string };
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: "invalid_json" }, { status: 400 }); }
  const price = Math.max(0, Math.floor(body.priceCents ?? 0));
  const currency = (body.currency ?? "usd").toLowerCase().slice(0, 3);
  if (!/^[a-z]{3}$/.test(currency)) return Response.json({ ok: false, error: "invalid_currency" }, { status: 400 });

  if (price === 0) {
    await sb.from("build_pricing").delete().eq("slug", slug);
    return Response.json({ ok: true, pricing: null });
  }

  // Seller must have completed Connect onboarding.
  const { data: seller } = await sb.from("sellers").select("charges_enabled").eq("user_id", u.user.id).maybeSingle();
  if (!seller || !seller.charges_enabled) {
    return Response.json({ ok: false, error: "seller_not_ready", message: "Complete Stripe onboarding in Settings before selling builds." }, { status: 412 });
  }

  const { error } = await sb.from("build_pricing").upsert({
    slug,
    seller_id: u.user.id,
    price_cents: price,
    currency,
    application_fee_pct: applicationFeePct(),
  }, { onConflict: "slug" });
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  return Response.json({ ok: true, pricing: { price_cents: price, currency, application_fee_pct: applicationFeePct() } });
}
