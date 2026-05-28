import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public marketplace browser. Anonymous. Filters: tag, search, sort.
// Code is NOT returned here (too heavy) — get it from /api/marketplace/build/[slug].

type SortKey = "recent" | "forks" | "views";

export async function GET(req: Request) {
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, mode: "local", results: [] });
  }
  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin unavailable" }, { status: 500 });

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const tag = (url.searchParams.get("tag") ?? "").trim().toLowerCase();
  const sort = (url.searchParams.get("sort") ?? "recent") as SortKey;
  const limit = Math.min(60, Math.max(1, parseInt(url.searchParams.get("limit") ?? "30", 10)));

  let query = sb.from("public_builds").select("slug, owner_id, title, description, template_id, tags, forks, views, published_at, updated_at").limit(limit);

  if (tag) query = query.contains("tags", [tag]);
  if (q) query = query.or(`title.ilike.%${q}%,description.ilike.%${q}%`);
  if (sort === "forks") query = query.order("forks", { ascending: false });
  else if (sort === "views") query = query.order("views", { ascending: false });
  else query = query.order("updated_at", { ascending: false });

  const { data, error } = await query;
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  return Response.json({ ok: true, results: data ?? [] });
}
