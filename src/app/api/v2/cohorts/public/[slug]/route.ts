import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — public read of a cohort by slug. Requires the cohort's
// visibility to be 'public' or 'link' (a link-share is still
// addressable; only 'private' is fully hidden). Returns a public-safe
// projection so /c/[slug] can render without ever leaking the roster
// or instructor identity beyond what the cohort chose to expose.

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { slug } = await params;
  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const { data: cohort } = await sb
    .from("cohorts")
    .select("id, slug, name, description, institution, kind, status, start_date, end_date, capacity, visibility, organization_id, created_at")
    .eq("slug", slug)
    .maybeSingle();
  if (!cohort) return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  const c = cohort as { visibility: string; organization_id: string | null; id: string };

  if (c.visibility === "private") {
    return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  // If attached to an org, surface a minimal org card so the public
  // page can show "Run by KNUST Entrepreneurship Centre" with a link.
  let org: Record<string, unknown> | null = null;
  if (c.organization_id) {
    const { data } = await sb
      .from("organizations")
      .select("id, slug, name, kind, logo_url, is_verified, is_public")
      .eq("id", c.organization_id)
      .maybeSingle();
    org = data ?? null;
  }

  // Count seats taken (invited + active) so the public page can show
  // "8 of 20 seats taken" without exposing individual members.
  const { count } = await sb
    .from("cohort_members")
    .select("user_id", { count: "exact", head: true })
    .eq("cohort_id", c.id)
    .in("state", ["invited", "active"]);

  return Response.json({
    ok: true,
    cohort,
    organization: org && (org as { is_public?: boolean }).is_public ? org : null,
    counts: { occupied: count ?? 0 },
  });
}
