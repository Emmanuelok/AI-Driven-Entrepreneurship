import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public read of the top-clapped artifacts. World-read RLS means we
// don't need auth — the public_builds + public_ventures rows are
// already public by design.
//
// Query params:
//   ?kind=build|venture     filter to one type (default: both)
//   ?range=7|30|all         time window for claps (default: 30 days)
//   ?limit=N                max rows per type (default: 20, max 50)

type Row = {
  kind: "build" | "venture";
  slug: string;
  title: string;
  description: string | null;
  claps: number;
  views: number;
  forks?: number;
  updated_at: string;
};

export async function GET(req: Request) {
  if (!isSupabaseConfigured()) return Response.json({ ok: true, mode: "local", builds: [], ventures: [] });
  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin unavailable" }, { status: 500 });

  const url = new URL(req.url);
  const kindFilter = (url.searchParams.get("kind") as "build" | "venture" | null);
  const range = url.searchParams.get("range") ?? "30";
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") ?? "20") || 20));

  let sinceIso: string | null = null;
  if (range === "7") sinceIso = new Date(Date.now() - 7 * 86_400_000).toISOString();
  else if (range === "30") sinceIso = new Date(Date.now() - 30 * 86_400_000).toISOString();
  // range=all → no time filter

  // Fetch claps grouped by (kind, slug). The data is small enough that
  // pulling and aggregating in JS is simpler than a server-side group-by
  // through Supabase. (At scale this becomes a materialized view.)
  let clapsQuery = sb.from("claps").select("kind, slug");
  if (sinceIso) clapsQuery = clapsQuery.gte("created_at", sinceIso);
  if (kindFilter) clapsQuery = clapsQuery.eq("kind", kindFilter);
  const { data: clapsRows, error: clapsErr } = await clapsQuery.limit(20_000);
  if (clapsErr) return Response.json({ ok: false, error: clapsErr.message }, { status: 500 });

  const tally = new Map<string, number>();
  for (const r of clapsRows ?? []) {
    const k = `${(r as { kind: string }).kind}::${(r as { slug: string }).slug}`;
    tally.set(k, (tally.get(k) ?? 0) + 1);
  }

  const buildSlugs: string[] = [];
  const ventureSlugs: string[] = [];
  for (const k of tally.keys()) {
    const [kind, slug] = k.split("::");
    if (kind === "build") buildSlugs.push(slug);
    else if (kind === "venture") ventureSlugs.push(slug);
  }

  // Pull artifact metadata for any artifact that has at least one clap.
  const [buildsRes, venturesRes] = await Promise.all([
    buildSlugs.length === 0 ? Promise.resolve({ data: [] }) : sb.from("public_builds").select("slug, title, description, views, forks, updated_at").in("slug", buildSlugs),
    ventureSlugs.length === 0 ? Promise.resolve({ data: [] }) : sb.from("public_ventures").select("slug, payload, views, updated_at").in("slug", ventureSlugs),
  ]);

  const builds: Row[] = (buildsRes.data ?? []).map((b): Row => {
    const x = b as { slug: string; title: string; description: string | null; views: number; forks: number; updated_at: string };
    return {
      kind: "build",
      slug: x.slug,
      title: x.title,
      description: x.description,
      claps: tally.get(`build::${x.slug}`) ?? 0,
      views: x.views,
      forks: x.forks,
      updated_at: x.updated_at,
    };
  }).sort((a, b) => b.claps - a.claps).slice(0, limit);

  const ventures: Row[] = (venturesRes.data ?? []).map((v): Row => {
    const x = v as { slug: string; payload: { name?: string; tagline?: string; publicLaunch?: { headline?: string; subhead?: string } }; views: number; updated_at: string };
    return {
      kind: "venture",
      slug: x.slug,
      title: x.payload?.publicLaunch?.headline || x.payload?.name || x.slug,
      description: x.payload?.publicLaunch?.subhead || x.payload?.tagline || null,
      claps: tally.get(`venture::${x.slug}`) ?? 0,
      views: x.views,
      updated_at: x.updated_at,
    };
  }).sort((a, b) => b.claps - a.claps).slice(0, limit);

  return Response.json({ ok: true, range, builds, ventures });
}
