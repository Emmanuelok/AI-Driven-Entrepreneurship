import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ ok: false, error: "missing token" }, { status: 401 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin unavailable" }, { status: 500 });

  const { data: u, error: e1 } = await sb.auth.getUser(token);
  if (e1 || !u?.user) return Response.json({ ok: false, error: "auth failed" }, { status: 401 });

  let body: { token?: string };
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: "invalid_json" }, { status: 400 }); }
  const inviteToken = (body.token ?? "").trim();
  if (!inviteToken) return Response.json({ ok: false, error: "missing_invite_token" }, { status: 400 });

  const { data: invite } = await sb.from("build_invites").select("*").eq("token", inviteToken).maybeSingle();
  if (!invite) return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  if (new Date(invite.expires_at) < new Date()) return Response.json({ ok: false, error: "expired" }, { status: 410 });

  const { error: addErr } = await sb.from("build_collaborators").upsert({
    build_id: invite.build_id,
    user_id: u.user.id,
    role: invite.role,
    email: u.user.email,
    display_name: (u.user.user_metadata as { name?: string } | null)?.name ?? null,
    invited_by: invite.invited_by,
  }, { onConflict: "build_id,user_id" });
  if (addErr) return Response.json({ ok: false, error: addErr.message }, { status: 500 });

  await sb.from("build_invites").delete().eq("id", invite.id);
  return Response.json({ ok: true, buildId: invite.build_id, role: invite.role });
}
