import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public profile read by slug. Anyone signed in can read; the RLS
// policy enforces is_public = true. We do the read with the service
// role (consistent with our other public-read patterns) and re-check
// is_public here so an authenticated caller doesn't see private rows
// just because they were authenticated.

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { slug } = await params;
  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const { data } = await sb
    .from("user_profiles")
    .select("user_id, slug, account_type, display_name, headline, bio, country, city, primary_language, avatar_url, website_url, linkedin_url, twitter_url, persona_data, contact_policy, is_public, created_at")
    .eq("slug", slug)
    .maybeSingle();
  if (!data || !(data as { is_public: boolean }).is_public) {
    return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  return Response.json({ ok: true, profile: data });
}
