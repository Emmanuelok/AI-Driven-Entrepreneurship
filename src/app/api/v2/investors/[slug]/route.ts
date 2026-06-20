import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { normalizeThesis, summarizeThesis, formatCheckRange, type InvestorThesis } from "@/lib/investor-thesis";
import { normalizeCriteria, summarizeCriteria } from "@/lib/saved-search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — one investor's PUBLIC thesis by their profile slug, plus the
//       saved searches they've marked public ("active mandates").
//       Returns 404 when the thesis isn't published or the profile
//       isn't public. No auth required.

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { slug } = await params;
  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  // Resolve the investor by profile slug.
  const { data: profile } = await sb
    .from("user_profiles")
    .select("user_id, slug, display_name, avatar_url, country, city, headline, bio, account_type, is_public, contact_policy")
    .eq("slug", slug)
    .maybeSingle();
  const p = profile as {
    user_id: string; slug: string | null; display_name: string; avatar_url: string | null;
    country: string; city: string; headline: string; bio: string;
    account_type: string; is_public: boolean; contact_policy: string;
  } | null;
  if (!p || !p.is_public) return Response.json({ ok: false, error: "not_found" }, { status: 404 });

  const { data: thesisRow } = await sb.from("investor_theses").select("*").eq("user_id", p.user_id).maybeSingle();
  const row = thesisRow as Record<string, unknown> | null;
  if (!row || row.is_published !== true) return Response.json({ ok: false, error: "not_found" }, { status: 404 });

  const thesis: InvestorThesis = normalizeThesis({
    headline: row.headline, statement: row.statement, sectors: row.sectors, stages: row.stages,
    regions: row.regions, checkMinUsd: row.check_min_usd, checkMaxUsd: row.check_max_usd,
    acceptsColdPitch: row.accepts_cold_pitch, isPublished: row.is_published,
  });

  // Public mandates: saved searches this investor marked is_public.
  const { data: mandates } = await sb
    .from("investor_saved_searches")
    .select("id, title, criteria, updated_at")
    .eq("user_id", p.user_id)
    .eq("is_public", true)
    .order("updated_at", { ascending: false })
    .limit(8);

  const publicMandates = ((mandates ?? []) as Array<{ id: string; title: string; criteria: unknown; updated_at: string }>)
    .map((m) => ({ id: m.id, title: m.title, summary: summarizeCriteria(normalizeCriteria(m.criteria)) }));

  return Response.json({
    ok: true,
    investor: {
      userId: p.user_id,
      slug: p.slug,
      displayName: p.display_name,
      avatarUrl: p.avatar_url,
      country: p.country,
      city: p.city,
      profileHeadline: p.headline,
      bio: p.bio,
      contactPolicy: p.contact_policy,
    },
    thesis,
    summary: summarizeThesis(thesis),
    checkRange: formatCheckRange(thesis),
    publicMandates,
  });
}
