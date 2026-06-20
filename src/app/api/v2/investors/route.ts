import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { normalizeThesis, summarizeThesis, formatCheckRange, type InvestorThesis } from "@/lib/investor-thesis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — public directory of published investor theses. No auth.
//
// Query params:
//   sector — single sector slug, matches sectors @> [sector]
//   stage  — single stage, matches stages @> [stage]
//   q      — free-text over headline + statement
//   coldPitch — '1' to only show investors accepting cold pitches
//   limit  — page size 1..48, default 24
//   offset — pagination

export type InvestorCard = {
  userId: string;
  slug: string | null;
  displayName: string;
  avatarUrl: string | null;
  country: string;
  headline: string;
  summary: string;
  checkRange: string | null;
  acceptsColdPitch: boolean;
  sectors: string[];
  stages: string[];
  completeness: number;
};

export async function GET(req: Request) {
  if (!isSupabaseConfigured()) return Response.json({ ok: true, results: [], total: 0, mode: "local" });
  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const url = new URL(req.url);
  const sector = url.searchParams.get("sector");
  const stage = url.searchParams.get("stage");
  const q = url.searchParams.get("q")?.trim();
  const coldPitchOnly = url.searchParams.get("coldPitch") === "1";
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "24", 10) || 24, 1), 48);
  const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0", 10) || 0, 0);

  let rows = sb
    .from("investor_theses")
    .select("user_id, headline, statement, sectors, stages, regions, check_min_usd, check_max_usd, accepts_cold_pitch, is_published, completeness")
    .eq("is_published", true)
    .order("completeness", { ascending: false })
    .order("updated_at", { ascending: false });
  let countQ = sb.from("investor_theses").select("user_id", { count: "exact", head: true }).eq("is_published", true);

  if (sector) { rows = rows.contains("sectors", [sector.toLowerCase()]); countQ = countQ.contains("sectors", [sector.toLowerCase()]); }
  if (stage) { rows = rows.contains("stages", [stage.toLowerCase()]); countQ = countQ.contains("stages", [stage.toLowerCase()]); }
  if (coldPitchOnly) { rows = rows.eq("accepts_cold_pitch", true); countQ = countQ.eq("accepts_cold_pitch", true); }
  if (q) {
    const safe = q.replace(/[%_]/g, (m) => `\\${m}`);
    const ors = `headline.ilike.%${safe}%,statement.ilike.%${safe}%`;
    rows = rows.or(ors); countQ = countQ.or(ors);
  }

  const [{ data, error }, { count }] = await Promise.all([
    rows.range(offset, offset + limit - 1),
    countQ,
  ]);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  const theses = (data ?? []) as Array<Record<string, unknown>>;
  const userIds = theses.map((t) => t.user_id as string);

  // Hydrate profile basics for the card.
  const profileById = new Map<string, { slug: string | null; display_name: string; avatar_url: string | null; country: string }>();
  if (userIds.length > 0) {
    const { data: profiles } = await sb
      .from("user_profiles")
      .select("user_id, slug, display_name, avatar_url, country, is_public")
      .in("user_id", userIds);
    for (const p of (profiles ?? []) as Array<{ user_id: string; slug: string | null; display_name: string; avatar_url: string | null; country: string; is_public: boolean }>) {
      // Only surface investors whose profile is also public.
      if (p.is_public) profileById.set(p.user_id, { slug: p.slug, display_name: p.display_name, avatar_url: p.avatar_url, country: p.country });
    }
  }

  const results: InvestorCard[] = theses
    .filter((t) => profileById.has(t.user_id as string))
    .map((row) => {
      const thesis: InvestorThesis = normalizeThesis({
        headline: row.headline, statement: row.statement, sectors: row.sectors, stages: row.stages,
        regions: row.regions, checkMinUsd: row.check_min_usd, checkMaxUsd: row.check_max_usd,
        acceptsColdPitch: row.accepts_cold_pitch, isPublished: row.is_published,
      });
      const prof = profileById.get(row.user_id as string)!;
      return {
        userId: row.user_id as string,
        slug: prof.slug,
        displayName: prof.display_name,
        avatarUrl: prof.avatar_url,
        country: prof.country,
        headline: thesis.headline,
        summary: summarizeThesis(thesis),
        checkRange: formatCheckRange(thesis),
        acceptsColdPitch: thesis.acceptsColdPitch,
        sectors: thesis.sectors,
        stages: thesis.stages,
        completeness: (row.completeness as number) ?? 0,
      };
    });

  return Response.json({ ok: true, results, total: count ?? 0 });
}
