import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public-by-slug read of an organization. Returns only the public-safe
// columns + counts (members + cohorts) so /o/[slug] can render
// without ever exposing internal fields like settings or membership
// roles. No auth required.

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { slug } = await params;
  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const { data: org } = await sb
    .from("organizations")
    .select("id, slug, name, kind, description, country, city, logo_url, website_url, institution_domain, is_verified, is_public, created_at")
    .eq("slug", slug)
    .maybeSingle();
  if (!org || !(org as { is_public: boolean }).is_public) {
    return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  const o = org as { id: string };

  // Aggregate counts. Cohorts: only count cohorts attached to this org
  // (excludes orphan v1 cohorts). Members: includes the owner.
  const [memberCountRes, cohortCountRes] = await Promise.all([
    sb.from("organization_members").select("user_id", { count: "exact", head: true }).eq("organization_id", o.id),
    sb.from("cohorts").select("id", { count: "exact", head: true }).eq("organization_id", o.id),
  ]);

  return Response.json({
    ok: true,
    organization: org,
    counts: {
      members: (memberCountRes.count ?? 0) + 1, // +1 for owner
      cohorts: cohortCountRes.count ?? 0,
    },
  });
}
