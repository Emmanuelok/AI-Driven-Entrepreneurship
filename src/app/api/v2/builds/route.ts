import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST — promote a local build to cloud. Body: { id, name, data }

export async function POST(req: Request) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local", error: "Cloud sync required for build collaboration." });
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ ok: false, error: "missing token" }, { status: 401 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin unavailable" }, { status: 500 });

  const { data: u, error: e1 } = await sb.auth.getUser(token);
  if (e1 || !u?.user) return Response.json({ ok: false, error: "auth failed" }, { status: 401 });
  const userId = u.user.id;

  let body: { id?: string; name?: string; data?: unknown };
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: "invalid_json" }, { status: 400 }); }
  if (!body.id || !body.name) return Response.json({ ok: false, error: "missing fields" }, { status: 400 });

  const { data: existing } = await sb.from("cloud_builds").select("id, owner_id").eq("id", body.id).maybeSingle();
  if (existing && existing.owner_id !== userId) {
    return Response.json({ ok: false, error: "id_conflict" }, { status: 409 });
  }
  if (existing) {
    await sb.from("cloud_builds").update({ name: body.name, data: body.data ?? {} }).eq("id", body.id);
    return Response.json({ ok: true, alreadyCloud: true });
  }

  const { error: insertErr } = await sb.from("cloud_builds").insert({
    id: body.id,
    owner_id: userId,
    name: body.name.slice(0, 200),
    data: body.data ?? {},
  });
  if (insertErr) return Response.json({ ok: false, error: insertErr.message }, { status: 500 });

  await sb.from("build_collaborators").insert({
    build_id: body.id,
    user_id: userId,
    role: "owner",
    email: u.user.email,
    display_name: (u.user.user_metadata as { name?: string } | null)?.name ?? null,
  });

  return Response.json({ ok: true, buildId: body.id });
}
