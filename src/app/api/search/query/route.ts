import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { embed } from "@/lib/embeddings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Semantic search over the user's own indexed artifacts.
// Body: { q: string, kind?: string, limit?: number }
// Returns: { results: [{ kind, refId, refUrl, title, body, similarity }] }

type Body = { q: string; kind?: string; limit?: number };

export async function POST(req: Request) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local", results: [] });

  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ ok: false, error: "missing token" }, { status: 401 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin unavailable" }, { status: 500 });

  const { data: u, error: e1 } = await sb.auth.getUser(token);
  if (e1 || !u?.user) return Response.json({ ok: false, error: "auth failed" }, { status: 401 });
  const userId = u.user.id;

  let body: Body;
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: "invalid_json" }, { status: 400 }); }
  const q = (body.q ?? "").trim();
  if (!q) return Response.json({ ok: true, results: [] });

  const [queryEmbedding] = await embed([q]);
  const { data, error } = await sb.rpc("search_artifacts", {
    uid: userId,
    query_embedding: queryEmbedding,
    match_count: Math.min(50, body.limit ?? 10),
    kind_filter: body.kind ?? null,
  });
  if (error) return Response.json({ ok: false, error: error.message, results: [] }, { status: 500 });
  return Response.json({ ok: true, results: data ?? [] });
}
