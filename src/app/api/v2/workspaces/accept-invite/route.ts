import { z } from "zod";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { bearerToken } from "@/lib/workspace-auth";
import { parseBody } from "@/lib/parse-body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Two GET modes for the /i/[token] landing page:
//   GET ?token=…&peek=1 — unauthenticated preview. Returns workspace
//                        title/kind/accent so the landing page can
//                        render the join card before the user signs in.
//                        Reveals NO member list and NO content.
//   GET ?token=…        — authenticated check. Returns the same preview
//                        plus whether the caller is already a member.
//
// POST { token } — claim the seat. Requires Bearer auth. Idempotent
//                  for existing members (returns ok with alreadyMember).

const POST_BODY = z.object({ token: z.string().min(8).max(64) });

type Invite = {
  id: string;
  workspace_id: string;
  email: string | null;
  role: string;
  max_uses: number;
  uses: number;
  expires_at: string;
};

async function fetchActiveInvite(sb: ReturnType<typeof supabaseAdmin>, token: string): Promise<{ invite: Invite; reason: null } | { invite: null; reason: string }> {
  if (!sb) return { invite: null, reason: "admin_unavailable" };
  const { data } = await sb
    .from("workspace_invites")
    .select("id, workspace_id, email, role, max_uses, uses, expires_at")
    .eq("token", token)
    .maybeSingle();
  if (!data) return { invite: null, reason: "not_found" };
  if (new Date(data.expires_at) < new Date()) return { invite: null, reason: "expired" };
  if (data.uses >= data.max_uses) return { invite: null, reason: "exhausted" };
  return { invite: data as Invite, reason: null };
}

async function workspacePreview(sb: ReturnType<typeof supabaseAdmin>, workspaceId: string) {
  if (!sb) return null;
  const { data } = await sb
    .from("workspaces")
    .select("id, title, description, kind, accent, owner_id")
    .eq("id", workspaceId)
    .maybeSingle();
  if (!data) return null;
  const { count } = await sb.from("workspace_members").select("user_id", { count: "exact", head: true }).eq("workspace_id", workspaceId);
  return { ...data, memberCount: count ?? 1 };
}

export async function GET(req: Request) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token) return Response.json({ ok: false, error: "missing_token" }, { status: 400 });

  const sb = supabaseAdmin();
  const { invite, reason } = await fetchActiveInvite(sb, token);
  if (!invite) return Response.json({ ok: false, error: reason }, { status: 410 });

  const preview = await workspacePreview(sb, invite.workspace_id);
  if (!preview) return Response.json({ ok: false, error: "workspace_missing" }, { status: 404 });

  // Optionally check existing membership for an authenticated peek.
  const peek = url.searchParams.get("peek");
  let alreadyMember = false;
  const auth = bearerToken(req);
  if (!peek && auth && sb) {
    const { data: u } = await sb.auth.getUser(auth);
    if (u?.user) {
      const { data: row } = await sb
        .from("workspace_members")
        .select("user_id")
        .eq("workspace_id", invite.workspace_id)
        .eq("user_id", u.user.id)
        .maybeSingle();
      alreadyMember = !!row;
    }
  }

  return Response.json({
    ok: true,
    workspace: preview,
    invite: { role: invite.role, emailTargeted: !!invite.email, expiresAt: invite.expires_at, usesLeft: invite.max_uses - invite.uses },
    alreadyMember,
  });
}

export async function POST(req: Request) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });

  const token = bearerToken(req);
  if (!token) return Response.json({ ok: false, error: "sign_in_required" }, { status: 401 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const { data: u, error: e1 } = await sb.auth.getUser(token);
  if (e1 || !u?.user) return Response.json({ ok: false, error: "auth_failed" }, { status: 401 });
  const userId = u.user.id;
  const userEmail = u.user.email ?? null;
  const displayName = (u.user.user_metadata as { name?: string } | null)?.name ?? null;

  const parsed = await parseBody(req, POST_BODY);
  if (!parsed.ok) return parsed.response;

  const { invite, reason } = await fetchActiveInvite(sb, parsed.data.token);
  if (!invite) return Response.json({ ok: false, error: reason }, { status: 410 });

  // Soft check on email-targeted invites — accept if the redeemer's
  // email matches, otherwise warn but still let them in. This mirrors
  // the venture invite flow (a person may sign up under a different
  // email than they were invited under).
  const emailMismatch = invite.email && userEmail && invite.email.toLowerCase() !== userEmail.toLowerCase();

  // Already a member? Return success without touching uses.
  const { data: existing } = await sb
    .from("workspace_members")
    .select("user_id, role")
    .eq("workspace_id", invite.workspace_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (existing) {
    return Response.json({ ok: true, workspaceId: invite.workspace_id, role: existing.role, alreadyMember: true });
  }

  // Insert membership + bump uses atomically(-ish). If two clicks land
  // at once we accept the over-count by one — the link-only invite's
  // bigger concern is exhaustion, not exactness.
  const { error: insertErr } = await sb.from("workspace_members").insert({
    workspace_id: invite.workspace_id,
    user_id: userId,
    role: invite.role,
    email: userEmail,
    display_name: displayName,
    invited_by: null,
  });
  if (insertErr) return Response.json({ ok: false, error: insertErr.message }, { status: 500 });

  await sb.from("workspace_invites").update({ uses: invite.uses + 1 }).eq("id", invite.id);

  // If this was a single-use email-targeted invite, drop it now —
  // honors the "single use" semantic regardless of clock skew.
  if (invite.email && invite.max_uses === 1) {
    await sb.from("workspace_invites").delete().eq("id", invite.id);
  }

  await sb.from("workspace_activity").insert({
    workspace_id: invite.workspace_id,
    user_id: userId,
    kind: "joined",
    title: `${displayName || userEmail || "A new member"} joined`,
    body: invite.email ? "via email invite" : "via shared link",
  });

  return Response.json({
    ok: true,
    workspaceId: invite.workspace_id,
    role: invite.role,
    alreadyMember: false,
    emailMismatch,
  });
}
