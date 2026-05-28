import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { token } — current user redeems an invite token sent via email.
// On success, they become a collaborator on the venture with the
// invite's role and we delete the invite row.

export async function POST(req: Request) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ ok: false, error: "missing token" }, { status: 401 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin unavailable" }, { status: 500 });

  const { data: u, error: e1 } = await sb.auth.getUser(token);
  if (e1 || !u?.user) return Response.json({ ok: false, error: "auth failed" }, { status: 401 });
  const userId = u.user.id;
  const userEmail = (u.user.email ?? "").toLowerCase();

  let body: { token?: string };
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: "invalid_json" }, { status: 400 }); }
  const inviteToken = (body.token ?? "").trim();
  if (!inviteToken) return Response.json({ ok: false, error: "missing_invite_token" }, { status: 400 });

  const { data: invite } = await sb.from("venture_invites").select("*").eq("token", inviteToken).maybeSingle();
  if (!invite) return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  if (new Date(invite.expires_at) < new Date()) return Response.json({ ok: false, error: "expired" }, { status: 410 });

  // Light check that the redeemer is the invited email. We don't enforce
  // hard — some users sign up with a different email than they were
  // invited with — but warn in dev mode.
  if (process.env.NODE_ENV !== "production" && invite.email !== userEmail) {
    console.log(`[invite] redeemer email mismatch: invited=${invite.email} actual=${userEmail}`);
  }

  // Add as collaborator + delete the invite (single transaction-y flow).
  const { error: addErr } = await sb.from("venture_collaborators").upsert({
    venture_id: invite.venture_id,
    user_id: userId,
    role: invite.role,
    email: userEmail,
    display_name: (u.user.user_metadata as { name?: string } | null)?.name ?? null,
    invited_by: invite.invited_by,
  }, { onConflict: "venture_id,user_id" });
  if (addErr) return Response.json({ ok: false, error: addErr.message }, { status: 500 });

  await sb.from("venture_invites").delete().eq("id", invite.id);

  return Response.json({ ok: true, ventureId: invite.venture_id, role: invite.role });
}
