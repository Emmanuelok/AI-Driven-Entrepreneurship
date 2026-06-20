import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { bearerToken } from "@/lib/workspace-auth";
import {
  normalizeThesis, thesisMatchesVenture, thesisMatchScore, summarizeThesis, formatCheckRange,
  type InvestorThesis,
} from "@/lib/investor-thesis";
import type { MatchableVenture, Stage } from "@/lib/saved-search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — published investor theses that match a given venture, ranked
//       by relevance. Owner-only (the founder of the venture), so a
//       competitor can't enumerate which investors fit someone else's
//       deal. Powers the "investors to pitch" surface on the venture.

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: true, mode: "local", results: [] });
  const { slug } = await params;
  const token = bearerToken(req);
  if (!token) return Response.json({ ok: false, error: "missing_token" }, { status: 401 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });
  const { data: u } = await sb.auth.getUser(token);
  if (!u?.user) return Response.json({ ok: false, error: "auth_failed" }, { status: 401 });

  // Venture must exist + be owned by the caller.
  const { data: vrow } = await sb
    .from("public_ventures")
    .select("slug, owner_id, payload, sectors, stage, is_raising, raising_amount_usd, region, updated_at")
    .eq("slug", slug)
    .maybeSingle();
  if (!vrow) return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  const v = vrow as { slug: string; owner_id: string; payload: Record<string, unknown>; sectors: string[] | null; stage: string | null; is_raising: boolean; raising_amount_usd: number | null; region: string | null; updated_at: string };
  if (v.owner_id !== u.user.id) return Response.json({ ok: false, error: "forbidden" }, { status: 403 });

  const venture: MatchableVenture = {
    slug: v.slug,
    title: String(v.payload?.title ?? v.slug),
    tagline: String(v.payload?.tagline ?? ""),
    sectors: v.sectors ?? [],
    stage: (v.stage ?? null) as Stage | null,
    is_raising: v.is_raising,
    raising_amount_usd: v.raising_amount_usd,
    region: v.region,
    updated_at: v.updated_at,
  };

  // All published theses.
  const { data: theses } = await sb
    .from("investor_theses")
    .select("user_id, headline, statement, sectors, stages, regions, check_min_usd, check_max_usd, accepts_cold_pitch, is_published")
    .eq("is_published", true)
    .limit(2000);

  const matched = ((theses ?? []) as Array<Record<string, unknown>>)
    .map((row) => {
      const thesis: InvestorThesis = normalizeThesis({
        headline: row.headline, statement: row.statement, sectors: row.sectors, stages: row.stages,
        regions: row.regions, checkMinUsd: row.check_min_usd, checkMaxUsd: row.check_max_usd,
        acceptsColdPitch: row.accepts_cold_pitch, isPublished: row.is_published,
      });
      return { userId: row.user_id as string, thesis };
    })
    .filter((m) => thesisMatchesVenture(m.thesis, venture))
    .map((m) => ({ ...m, score: thesisMatchScore(m.thesis, venture) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 24);

  // Hydrate profiles.
  const userIds = matched.map((m) => m.userId);
  const profileById = new Map<string, { slug: string | null; display_name: string; avatar_url: string | null; country: string }>();
  if (userIds.length > 0) {
    const { data: profiles } = await sb
      .from("user_profiles")
      .select("user_id, slug, display_name, avatar_url, country, is_public")
      .in("user_id", userIds);
    for (const p of (profiles ?? []) as Array<{ user_id: string; slug: string | null; display_name: string; avatar_url: string | null; country: string; is_public: boolean }>) {
      if (p.is_public) profileById.set(p.user_id, { slug: p.slug, display_name: p.display_name, avatar_url: p.avatar_url, country: p.country });
    }
  }

  const results = matched
    .filter((m) => profileById.has(m.userId))
    .map((m) => {
      const prof = profileById.get(m.userId)!;
      return {
        slug: prof.slug,
        displayName: prof.display_name,
        avatarUrl: prof.avatar_url,
        country: prof.country,
        headline: m.thesis.headline,
        summary: summarizeThesis(m.thesis),
        checkRange: formatCheckRange(m.thesis),
        acceptsColdPitch: m.thesis.acceptsColdPitch,
        score: m.score,
      };
    });

  return Response.json({ ok: true, venture: { slug: v.slug, title: venture.title }, results });
}
