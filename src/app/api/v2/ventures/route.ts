import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — list every cloud venture the authenticated user has access to
//      (owned + collaborator). Returns minimal metadata; full venture
//      data fetched per-id with the next route.
// POST — promote a local venture into the cloud. Body: { id, name, data }
//        id is the existing local nanoid so subpages don't need re-routing.

export async function GET(req: Request) {
  if (!isSupabaseConfigured()) return Response.json({ ok: true, mode: "local", results: [] });
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ ok: false, error: "missing token" }, { status: 401 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin unavailable" }, { status: 500 });

  const { data: u, error: e1 } = await sb.auth.getUser(token);
  if (e1 || !u?.user) return Response.json({ ok: false, error: "auth failed" }, { status: 401 });
  const userId = u.user.id;

  // Owned ventures + ventures where the user is a collaborator.
  const [ownedRes, collabRes] = await Promise.all([
    sb.from("cloud_ventures").select("id, name, updated_at, owner_id").eq("owner_id", userId),
    sb.from("venture_collaborators").select("venture_id, role").eq("user_id", userId),
  ]);
  if (ownedRes.error) return Response.json({ ok: false, error: ownedRes.error.message }, { status: 500 });

  const collabIds = (collabRes.data ?? []).map((c) => (c as { venture_id: string }).venture_id);
  const collabMeta = collabIds.length === 0 ? { data: [] as Array<{ id: string; name: string; updated_at: string; owner_id: string }> } :
    await sb.from("cloud_ventures").select("id, name, updated_at, owner_id").in("id", collabIds);

  const results = [
    ...((ownedRes.data ?? []).map((v) => ({ ...(v as { id: string; name: string; updated_at: string; owner_id: string }), role: "owner" as const }))),
    ...((collabMeta.data ?? []).map((v) => {
      const meta = v as { id: string; name: string; updated_at: string; owner_id: string };
      const role = (collabRes.data ?? []).find((c) => (c as { venture_id: string }).venture_id === meta.id);
      return { ...meta, role: ((role as { role: string } | undefined)?.role ?? "editor") as "editor" | "viewer" };
    })),
  ];

  return Response.json({ ok: true, results });
}

export async function POST(req: Request) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local", error: "Cloud sync required to make a venture collaborative." });
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ ok: false, error: "missing token" }, { status: 401 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin unavailable" }, { status: 500 });

  const { data: u, error: e1 } = await sb.auth.getUser(token);
  if (e1 || !u?.user) return Response.json({ ok: false, error: "auth failed" }, { status: 401 });
  const userId = u.user.id;

  let body: { id?: string; name?: string; data?: unknown };
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: "invalid_json" }, { status: 400 }); }
  if (!body.id || !body.name) return Response.json({ ok: false, error: "missing fields" }, { status: 400 });

  // Insert (or no-op if it already exists owned by this user).
  const { data: existing } = await sb.from("cloud_ventures").select("id, owner_id").eq("id", body.id).maybeSingle();
  if (existing) {
    if (existing.owner_id !== userId) {
      return Response.json({ ok: false, error: "id_conflict", message: "That venture id is already taken by another user. Make sure you generated it locally." }, { status: 409 });
    }
    // Already exists for this user — just refresh the payload.
    const { error: upErr } = await sb.from("cloud_ventures").update({ name: body.name, data: body.data ?? {} }).eq("id", body.id);
    if (upErr) return Response.json({ ok: false, error: upErr.message }, { status: 500 });
    return Response.json({ ok: true, alreadyCloud: true });
  }

  const { error: insertErr } = await sb.from("cloud_ventures").insert({
    id: body.id,
    owner_id: userId,
    name: body.name.slice(0, 200),
    data: body.data ?? {},
  });
  if (insertErr) return Response.json({ ok: false, error: insertErr.message }, { status: 500 });

  // Owner is automatically a collaborator with role 'owner' so the
  // realtime channel + listing logic doesn't need to special-case owners.
  await sb.from("venture_collaborators").insert({
    venture_id: body.id,
    user_id: userId,
    role: "owner",
    email: u.user.email,
    display_name: (u.user.user_metadata as { name?: string } | null)?.name ?? null,
  });

  return Response.json({ ok: true, ventureId: body.id });
}
