import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public venture marketplace browse. Reads from public_ventures (the
// owner-published table) with structured filters powered by the
// columns added in 0043. Used by the investor portal AND by anyone
// browsing /ventures publicly — no auth required because every row
// here is opt-in public by the founder.
//
// Query params:
//   sector   — single sector slug, matches via ANY(sectors[])
//   stage    — exact stage filter (idea | discover | mvp | launch | scale)
//   raising  — '1' to filter to actively-raising rows only
//   region   — exact region match
//   q        — free-text on slug + payload's title/tagline (jsonb ->>)
//   sort     — 'recent' (default) | 'views' | 'raising'
//   limit    — page size 1..60, default 24
//   offset   — pagination
//
// Returns lightweight cards (no full payload) plus a count for the
// pagination UI.

export type VentureCard = {
  slug: string;
  venture_id: string;
  title: string;
  tagline: string;
  sectors: string[];
  stage: string | null;
  is_raising: boolean;
  raising_amount_usd: number | null;
  region: string | null;
  views: number;
  published_at: string;
  updated_at: string;
};

export async function GET(req: Request) {
  if (!isSupabaseConfigured()) return Response.json({ ok: true, results: [], total: 0, mode: "local" });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const url = new URL(req.url);
  const sector = url.searchParams.get("sector");
  const stage = url.searchParams.get("stage");
  const raising = url.searchParams.get("raising") === "1";
  const region = url.searchParams.get("region");
  const q = url.searchParams.get("q")?.trim();
  const sort = url.searchParams.get("sort") ?? "recent";
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "24"), 1), 60);
  const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0"), 0);

  // Pull only the columns we surface in the card to keep payload light;
  // /v/[slug] still serves the full payload when someone opens a row.
  let rows = sb
    .from("public_ventures")
    .select("slug, venture_id, payload, sectors, stage, is_raising, raising_amount_usd, region, views, published_at, updated_at");
  let countQ = sb.from("public_ventures").select("slug", { count: "exact", head: true });

  if (sector) {
    // contains-any: rows whose sectors[] includes this value.
    rows = rows.contains("sectors", [sector]);
    countQ = countQ.contains("sectors", [sector]);
  }
  if (stage) {
    rows = rows.eq("stage", stage);
    countQ = countQ.eq("stage", stage);
  }
  if (raising) {
    rows = rows.eq("is_raising", true);
    countQ = countQ.eq("is_raising", true);
  }
  if (region) {
    rows = rows.eq("region", region);
    countQ = countQ.eq("region", region);
  }
  if (q) {
    // Slug substring + payload->>title + payload->>tagline.
    const safe = q.replace(/[%_]/g, (m) => `\\${m}`);
    const ors = `slug.ilike.%${safe}%,payload->>title.ilike.%${safe}%,payload->>tagline.ilike.%${safe}%`;
    rows = rows.or(ors);
    countQ = countQ.or(ors);
  }

  // Sort: recent (updated_at), views (desc), raising (raising_amount desc
  // then updated_at) — "raising" pushes ventures asking for bigger
  // rounds higher when filtering raisers, which matches what an
  // investor browsing actually wants.
  if (sort === "views") rows = rows.order("views", { ascending: false });
  else if (sort === "raising") rows = rows.order("raising_amount_usd", { ascending: false, nullsFirst: false }).order("updated_at", { ascending: false });
  else rows = rows.order("updated_at", { ascending: false });

  const [{ data, error }, { count }] = await Promise.all([
    rows.range(offset, offset + limit - 1),
    countQ,
  ]);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  const results: VentureCard[] = (data ?? []).map((r) => {
    const row = r as {
      slug: string; venture_id: string; payload: Record<string, unknown>;
      sectors: string[]; stage: string | null; is_raising: boolean;
      raising_amount_usd: number | null; region: string | null;
      views: number; published_at: string; updated_at: string;
    };
    return {
      slug: row.slug,
      venture_id: row.venture_id,
      title: String(row.payload?.title ?? row.slug),
      tagline: String(row.payload?.tagline ?? ""),
      sectors: row.sectors ?? [],
      stage: row.stage,
      is_raising: row.is_raising,
      raising_amount_usd: row.raising_amount_usd,
      region: row.region,
      views: row.views,
      published_at: row.published_at,
      updated_at: row.updated_at,
    };
  });

  return Response.json({ ok: true, results, total: count ?? 0 });
}
