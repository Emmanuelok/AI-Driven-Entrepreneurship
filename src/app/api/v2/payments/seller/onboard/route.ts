import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { stripe, isStripeConfigured } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Create or resume Stripe Connect Express onboarding for the
// authenticated seller. Returns a URL the client opens to land on
// Stripe's hosted onboarding flow. On completion, Stripe redirects
// back to /studio/settings — webhook later confirms readiness.
//
// Body: { country?: 'GH' | 'KE' | 'US' | ... } (only used for first-time creation)

export async function POST(req: Request) {
  if (!isStripeConfigured()) return Response.json({ ok: false, error: "stripe_not_configured" }, { status: 503 });
  if (!isSupabaseConfigured()) return Response.json({ ok: false, error: "supabase_required" }, { status: 503 });

  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ ok: false, error: "missing_token" }, { status: 401 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const { data: u, error: e1 } = await sb.auth.getUser(token);
  if (e1 || !u?.user) return Response.json({ ok: false, error: "auth_failed" }, { status: 401 });
  const userId = u.user.id;
  const userEmail = u.user.email ?? undefined;

  let body: { country?: string };
  try { body = await req.json(); } catch { body = {}; }
  const country = (body.country ?? "US").toUpperCase().slice(0, 2);

  const s = stripe();
  if (!s) return Response.json({ ok: false, error: "stripe_not_configured" }, { status: 503 });

  // Reuse an existing seller row if there is one — Stripe Account links
  // expire after a few minutes; we re-generate them, not the account.
  const { data: existing } = await sb.from("sellers").select("stripe_account_id").eq("user_id", userId).maybeSingle();
  let accountId = existing?.stripe_account_id as string | undefined;

  if (!accountId) {
    const account = await s.accounts.create({
      type: "express",
      country,
      email: userEmail,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      metadata: { sankofa_user_id: userId },
    });
    accountId = account.id;
    await sb.from("sellers").insert({
      user_id: userId,
      stripe_account_id: accountId,
      country,
    });
  }

  const origin = new URL(req.url).origin;
  const link = await s.accountLinks.create({
    account: accountId,
    refresh_url: `${origin}/studio/settings?stripe=refresh`,
    return_url: `${origin}/studio/settings?stripe=done`,
    type: "account_onboarding",
  });

  return Response.json({ ok: true, url: link.url, accountId });
}
