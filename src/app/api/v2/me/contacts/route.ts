import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { bearerToken } from "@/lib/workspace-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — the caller's contact inbox. Returns two lists:
//   received — requests sent TO the caller (the ones they act on)
//   sent     — requests the caller sent (to track responses)
// plus an unread count of received requests not yet viewed.
//
// Also opportunistically marks received pending requests as read when
// ?markRead=1 is passed (the inbox page calls this on mount so the
// badge clears once the user actually looks).

export async function GET(req: Request) {
  if (!isSupabaseConfigured()) return Response.json({ ok: true, received: [], sent: [], unread: 0, mode: "local" });
  const token = bearerToken(req);
  if (!token) return Response.json({ ok: false, error: "missing_token" }, { status: 401 });
  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const { data: u, error } = await sb.auth.getUser(token);
  if (error || !u?.user) return Response.json({ ok: false, error: "auth_failed" }, { status: 401 });
  const me = u.user.id;

  const url = new URL(req.url);
  const markRead = url.searchParams.get("markRead") === "1";

  const cols = "id, from_user_id, to_user_id, from_name, from_account_type, context, subject, body, status, reply_body, created_at, responded_at, read_by_recipient, invite_id, invite_workspace_id";
  const [received, sent] = await Promise.all([
    sb.from("profile_contacts").select(cols).eq("to_user_id", me).order("created_at", { ascending: false }).limit(200),
    sb.from("profile_contacts").select(cols).eq("from_user_id", me).order("created_at", { ascending: false }).limit(200),
  ]);

  const receivedRows = received.data ?? [];
  const sentRows = sent.data ?? [];
  const unread = receivedRows.filter((r) => !(r as { read_by_recipient: boolean }).read_by_recipient).length;

  // For SENT requests where the recipient attached a workspace invite,
  // hydrate the invite token + workspace title so the sender's card
  // can render a one-click "Join {Workspace} →" CTA. We only hydrate
  // for the sender (the recipient already has full workspace context).
  const inviteIds = sentRows
    .map((r) => (r as { invite_id: string | null }).invite_id)
    .filter((x): x is string => !!x);
  const inviteTokens = new Map<string, string>();
  const inviteWorkspaces = new Map<string, { id: string; title: string; accent: string }>();
  if (inviteIds.length > 0) {
    const { data: invites } = await sb
      .from("workspace_invites")
      .select("id, token, workspace_id")
      .in("id", inviteIds);
    for (const inv of invites ?? []) {
      const row = inv as { id: string; token: string; workspace_id: string };
      inviteTokens.set(row.id, row.token);
    }
    const wsIds = Array.from(new Set((invites ?? []).map((i) => (i as { workspace_id: string }).workspace_id)));
    if (wsIds.length > 0) {
      const { data: workspaces } = await sb
        .from("workspaces")
        .select("id, title, accent")
        .in("id", wsIds);
      for (const w of workspaces ?? []) {
        const row = w as { id: string; title: string; accent: string };
        inviteWorkspaces.set(row.id, row);
      }
    }
  }

  const hydratedSent = sentRows.map((r) => {
    const row = r as Record<string, unknown> & { invite_id: string | null; invite_workspace_id: string | null };
    const token = row.invite_id ? inviteTokens.get(row.invite_id) ?? null : null;
    const ws = row.invite_workspace_id ? inviteWorkspaces.get(row.invite_workspace_id) ?? null : null;
    return { ...row, invite_token: token, invite_workspace: ws };
  });

  if (markRead && unread > 0) {
    // Clear the recipient watermark for everything in the inbox.
    await sb.from("profile_contacts").update({ read_by_recipient: true }).eq("to_user_id", me).eq("read_by_recipient", false);
  }

  return Response.json({ ok: true, received: receivedRows, sent: hydratedSent, unread });
}
