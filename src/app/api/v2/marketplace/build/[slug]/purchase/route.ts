import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET → whether the current user has purchased this build.
// Drives the fork-button paywall on the marketplace detail page.

export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: true, purchase: null });
  const { slug } = await ctx.params;
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ ok: true, purchase: null });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const { data: u } = await sb.auth.getUser(token);
  if (!u?.user) return Response.json({ ok: true, purchase: null });

  // Owner of the build counts as "purchased" — they always have fork access.
  const { data: build } = await sb.from("public_builds").select("owner_id").eq("slug", slug).maybeSingle();
  if (build?.owner_id === u.user.id) {
    return Response.json({ ok: true, purchase: { isOwner: true } });
  }

  const { data } = await sb.from("build_purchases")
    .select("paid_at, amount_cents, currency")
    .eq("slug", slug).eq("user_id", u.user.id).maybeSingle();

  return Response.json({ ok: true, purchase: data ?? null });
}
