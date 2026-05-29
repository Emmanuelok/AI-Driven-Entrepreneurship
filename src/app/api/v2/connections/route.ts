import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { CONNECTION_KINDS, type ConnectionKind } from "@/lib/connections";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Universal connections layer — see migration 0016.
//
// GET   ?kind=&id=          → both directions: edges where this entity is from OR to
//        ?all=1             → every edge the user has created (used by the Atlas / brain UI)
// POST                       → create an edge { fromKind, fromId, toKind, toId, label? }
//
// We trust user_id from the supabase access token; never accept a
// client-supplied user_id field.

async function authedUser(req: Request): Promise<{ id: string } | null> {
  if (!isSupabaseConfigured()) return null;
  const sb = supabaseAdmin();
  if (!sb) return null;
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) return null;
  return { id: data.user.id };
}

function isKind(x: unknown): x is ConnectionKind {
  return typeof x === "string" && (CONNECTION_KINDS as readonly string[]).includes(x);
}

export async function GET(req: Request) {
  if (!isSupabaseConfigured()) return Response.json({ ok: true, mode: "local", incoming: [], outgoing: [] });
  const me = await authedUser(req);
  if (!me) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const url = new URL(req.url);
  const kind = url.searchParams.get("kind");
  const id = url.searchParams.get("id");
  const all = url.searchParams.get("all");

  if (all === "1") {
    const { data, error } = await sb.from("connections")
      .select("id, from_kind, from_id, to_kind, to_id, label, created_at")
      .eq("user_id", me.id)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
    return Response.json({ ok: true, results: data ?? [] });
  }

  if (!isKind(kind) || !id) {
    return Response.json({ ok: false, error: "missing_kind_or_id" }, { status: 400 });
  }

  const [outgoing, incoming] = await Promise.all([
    sb.from("connections")
      .select("id, from_kind, from_id, to_kind, to_id, label, created_at")
      .eq("user_id", me.id).eq("from_kind", kind).eq("from_id", id)
      .order("created_at", { ascending: false }),
    sb.from("connections")
      .select("id, from_kind, from_id, to_kind, to_id, label, created_at")
      .eq("user_id", me.id).eq("to_kind", kind).eq("to_id", id)
      .order("created_at", { ascending: false }),
  ]);

  return Response.json({
    ok: true,
    outgoing: outgoing.data ?? [],
    incoming: incoming.data ?? [],
  });
}

export async function POST(req: Request) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const me = await authedUser(req);
  if (!me) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });

  let body: { fromKind?: unknown; fromId?: unknown; toKind?: unknown; toId?: unknown; label?: unknown };
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: "invalid_json" }, { status: 400 }); }

  if (!isKind(body.fromKind) || !isKind(body.toKind)) {
    return Response.json({ ok: false, error: "invalid_kind" }, { status: 400 });
  }
  const fromId = typeof body.fromId === "string" ? body.fromId.trim() : "";
  const toId = typeof body.toId === "string" ? body.toId.trim() : "";
  if (!fromId || !toId) return Response.json({ ok: false, error: "missing_ids" }, { status: 400 });
  if (body.fromKind === body.toKind && fromId === toId) {
    return Response.json({ ok: false, error: "self_link" }, { status: 400 });
  }

  const label = typeof body.label === "string" ? body.label.trim().slice(0, 80) || null : null;

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const { data, error } = await sb.from("connections").insert({
    user_id: me.id,
    from_kind: body.fromKind,
    from_id: fromId,
    to_kind: body.toKind,
    to_id: toId,
    label,
  }).select("id").maybeSingle();

  if (error) {
    // Duplicate edge — unique index. Treat as success-idempotent.
    if (error.code === "23505") return Response.json({ ok: true, duplicate: true });
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true, id: data?.id });
}
