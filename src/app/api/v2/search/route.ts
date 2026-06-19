import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { embed } from "@/lib/embeddings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public semantic search. Natural-language query over the
// public_search_index (currently profiles + ventures). Returns kNN
// matches with similarity scores so the UI can dim weaker hits.
//
// Query: ?q=<text> [&kind=profile|venture] [&limit=12]
//
// No auth required to read — every row indexed here is public by
// definition (is_public profiles + public_ventures). We still go
// through the service-role to call the RPC because anonymous users
// don't have a JWT to pass through PostgREST RLS.

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const kind = url.searchParams.get("kind");
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "12"), 1), 30);

  if (!q || q.length < 2) {
    return Response.json({ ok: true, query: q, results: [] });
  }
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: true, query: q, results: [], mode: "local" });
  }

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  // Embed the query. Voyage's input_type for queries differs slightly
  // from documents; if VOYAGE_KEY is missing, we still get a
  // deterministic pseudo-vector so the route always responds.
  let queryVec: number[];
  try {
    const [v] = await embed([q]);
    if (!v || v.length === 0) return Response.json({ ok: true, query: q, results: [] });
    queryVec = v;
  } catch {
    return Response.json({ ok: true, query: q, results: [] });
  }

  const { data, error } = await sb.rpc("public_search_match", {
    query_embedding: queryVec,
    match_count: limit,
    kind_filter: kind ?? null,
  });
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  return Response.json({ ok: true, query: q, results: data ?? [] });
}
