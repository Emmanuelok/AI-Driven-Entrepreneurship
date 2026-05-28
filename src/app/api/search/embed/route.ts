import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { embed } from "@/lib/embeddings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Indexes one or more artifacts into search_index. Upserts by
// (user_id, kind, ref_id) — so re-indexing an edited artifact just
// updates its embedding.
//
// Body: { items: [{ kind, refId, title, body, refUrl? }] }

type Item = { kind: string; refId: string; refUrl?: string; title?: string; body: string };
type Body = { items: Item[] };

export async function POST(req: Request) {
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, mode: "local" });
  }
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
  const items = (body.items ?? []).filter((i) => i.body && i.refId && i.kind).slice(0, 100);
  if (items.length === 0) return Response.json({ ok: true, indexed: 0 });

  const vectors = await embed(items.map((i) => i.body));
  const rows = items.map((it, i) => ({
    user_id: userId,
    kind: it.kind,
    ref_id: it.refId,
    ref_url: it.refUrl ?? null,
    title: it.title ?? null,
    body: it.body.slice(0, 4000),
    embedding: vectors[i],
    updated_at: new Date().toISOString(),
  }));

  const { error } = await sb.from("search_index").upsert(rows, { onConflict: "user_id,kind,ref_id" });
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true, indexed: rows.length });
}
