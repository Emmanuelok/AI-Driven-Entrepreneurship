import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET → returns the signed-in user's enrollment row for this cohort
// (or null if they haven't paid / it's free). Driven by the UI to
// decide whether to show the paywall.

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: true, enrollment: null });
  const { id } = await ctx.params;
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ ok: true, enrollment: null });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const { data: u } = await sb.auth.getUser(token);
  if (!u?.user) return Response.json({ ok: true, enrollment: null });

  const { data } = await sb.from("cohort_enrollments")
    .select("paid_at, amount_cents, currency")
    .eq("cohort_id", id).eq("user_id", u.user.id).maybeSingle();

  return Response.json({ ok: true, enrollment: data ?? null });
}
