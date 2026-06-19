import { z } from "zod";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { bearerToken } from "@/lib/workspace-auth";
import { parseBody } from "@/lib/parse-body";
import { createNotification } from "@/lib/notifications-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PATCH — respond to a contact request the caller RECEIVED. Only the
// recipient may change status (RLS enforces this too). Accepting or
// declining stamps responded_at and may carry a reply_body that the
// sender then sees. Archiving just hides it from the active inbox.
//
// On accept, the recipient can OPTIONALLY attach a workspace invite —
// passing inviteWorkspaceId mints a fresh single-use email-targeted
// invite (via the same workspace_invites pipeline the room UI uses),
// and the sender's inbox renders a "Join {workspace} →" CTA wired to
// the existing /i/[token] flow.

const Body = z.object({
  status: z.enum(["accepted", "declined", "archived"]),
  reply_body: z.string().max(2000).optional(),
  inviteWorkspaceId: z.string().uuid().optional(),
  inviteRole: z.enum(["admin", "editor", "viewer"]).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await params;

  const token = bearerToken(req);
  if (!token) return Response.json({ ok: false, error: "missing_token" }, { status: 401 });
  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const { data: u, error: authErr } = await sb.auth.getUser(token);
  if (authErr || !u?.user) return Response.json({ ok: false, error: "auth_failed" }, { status: 401 });
  const me = u.user.id;

  const parsed = await parseBody(req, Body);
  if (!parsed.ok) return parsed.response;
  const { status, reply_body, inviteWorkspaceId, inviteRole } = parsed.data;

  // Guard: the row must exist and be addressed to the caller. We also
  // need the sender's user_id to look up their email for the invite.
  const { data: existing } = await sb
    .from("profile_contacts")
    .select("id, to_user_id, from_user_id, status")
    .eq("id", id)
    .maybeSingle();
  if (!existing || (existing as { to_user_id: string }).to_user_id !== me) {
    return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  const row = existing as { id: string; from_user_id: string; status: string };

  const patch: Record<string, unknown> = { status, read_by_recipient: true };
  if (status === "accepted" || status === "declined") patch.responded_at = new Date().toISOString();
  if (reply_body !== undefined) patch.reply_body = reply_body;

  // Optional workspace invite — only on accept, only if the caller is
  // admin+ on the named workspace. Membership is checked via the same
  // RPC the workspace API uses; viewer/editor can't mint invites so we
  // fail clean with a hint instead of a 500.
  let mintedInvite: { id: string; token: string; workspaceId: string } | null = null;
  if (status === "accepted" && inviteWorkspaceId) {
    const { data: role } = await sb.rpc("is_workspace_member", { _workspace_id: inviteWorkspaceId, _user_id: me });
    if (role !== "owner" && role !== "admin") {
      return Response.json({ ok: false, error: "invite_forbidden", message: "You need to be admin or owner of that workspace to invite." }, { status: 403 });
    }
    // Look up sender's email to target the invite. We send a single-use
    // 14-day email-targeted invite so it auto-cleans up on redemption.
    const { data: senderAuth } = await sb.auth.admin.getUserById(row.from_user_id);
    const senderEmail = senderAuth?.user?.email ?? null;
    const expiresAt = new Date(Date.now() + 14 * 86_400_000).toISOString();
    const { data: inviteRow, error: inviteErr } = await sb
      .from("workspace_invites")
      .insert({
        workspace_id: inviteWorkspaceId,
        email: senderEmail,
        role: inviteRole ?? "editor",
        invited_by: me,
        max_uses: 1,
        expires_at: expiresAt,
      })
      .select("id, token")
      .single();
    if (inviteErr || !inviteRow) {
      return Response.json({ ok: false, error: "invite_failed", message: inviteErr?.message }, { status: 500 });
    }
    mintedInvite = { id: inviteRow.id, token: inviteRow.token, workspaceId: inviteWorkspaceId };
    patch.invite_id = inviteRow.id;
    patch.invite_workspace_id = inviteWorkspaceId;

    // Activity entry so the workspace owner sees who minted this invite.
    await sb.from("workspace_activity").insert({
      workspace_id: inviteWorkspaceId,
      user_id: me,
      kind: "invite_created",
      title: senderEmail ? `Invited ${senderEmail}` : "Invited a member",
      body: `via contact acceptance`,
    });
  }

  const { data, error } = await sb
    .from("profile_contacts")
    .update(patch)
    .eq("id", id)
    .eq("to_user_id", me)
    .select("id, status, reply_body, responded_at, invite_id, invite_workspace_id")
    .single();
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  // Notify the sender about the response — accepted/declined only.
  // Archive is silent (the sender doesn't need to know you cleared
  // your inbox). When a workspace invite was attached, we surface that
  // in the body so the bell preview itself hints at the next step.
  if (status === "accepted" || status === "declined") {
    // Look up the recipient's display_name once so the notification
    // says "Ama Lovelace accepted your request" rather than the email
    // fallback we'd otherwise show.
    const { data: meProfile } = await sb
      .from("user_profiles")
      .select("display_name")
      .eq("user_id", me)
      .maybeSingle();
    const recipientName = (meProfile as { display_name?: string } | null)?.display_name || "A member";
    const verb = status === "accepted" ? "accepted" : "declined";
    const inviteHint = mintedInvite ? " — and invited you to a workspace" : "";
    void createNotification({
      userId: row.from_user_id,
      actorId: me,
      actorName: recipientName,
      kind: "contact_response",
      targetKind: "contact",
      title: `${recipientName} ${verb} your request${inviteHint}`,
      body: reply_body ? reply_body.slice(0, 200) : undefined,
      url: mintedInvite ? `/i/${mintedInvite.token}` : "/studio/inbox",
    });
  }

  return Response.json({ ok: true, request: data, invite: mintedInvite });
}
