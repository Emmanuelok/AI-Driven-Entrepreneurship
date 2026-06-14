import { z } from "zod";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { authWorkspace, requireWorkspaceRole, bearerToken } from "@/lib/workspace-auth";
import { parseBody } from "@/lib/parse-body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST   — create an invite. Email is optional: omitting it produces a
//          link-only invite that can be redeemed by anyone with the URL
//          up to max_uses times. Admin+ only.
// DELETE — revoke an invite by id. Admin+ only. Query: ?inviteId=…
//
// We deliberately do NOT email the invite from here; the caller gets
// the token back and can hand the user a link. The frontend renders
// /i/<token> as the share URL.

const ROLES = ["admin", "editor", "viewer"] as const;
const InviteBody = z.object({
  email: z.string().email().max(200).optional().nullable(),
  role: z.enum(ROLES as unknown as readonly [string, ...string[]]).optional(),
  maxUses: z.number().int().min(1).max(100).optional(),
  expiresInDays: z.number().int().min(1).max(60).optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await params;
  const me = await authWorkspace(bearerToken(req), id);
  const forbid = requireWorkspaceRole(me, "admin");
  if (forbid) return forbid;

  const parsed = await parseBody(req, InviteBody);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const role = body.role ?? "editor";
  const email = body.email ?? null;
  // Email-targeted invites stay single-use to match the venture flow.
  // Link-only invites default to 25 uses — comfortably more than a
  // small group, low enough to limit blast radius if a link leaks.
  const maxUses = body.maxUses ?? (email ? 1 : 25);
  const expiresAt = new Date(Date.now() + (body.expiresInDays ?? 14) * 86_400_000).toISOString();

  const { data, error } = await sb
    .from("workspace_invites")
    .insert({
      workspace_id: id,
      email,
      role,
      invited_by: me!.userId,
      max_uses: maxUses,
      expires_at: expiresAt,
    })
    .select("id, token, role, email, max_uses, uses, expires_at, created_at")
    .single();
  if (error || !data) return Response.json({ ok: false, error: error?.message ?? "insert_failed" }, { status: 500 });

  await sb.from("workspace_activity").insert({
    workspace_id: id,
    user_id: me!.userId,
    kind: "invite_created",
    title: email ? `Invited ${email}` : "Created a share link",
    body: `role: ${role}`,
  });

  return Response.json({ ok: true, invite: data });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await params;
  const me = await authWorkspace(bearerToken(req), id);
  const forbid = requireWorkspaceRole(me, "admin");
  if (forbid) return forbid;

  const url = new URL(req.url);
  const inviteId = url.searchParams.get("inviteId");
  if (!inviteId) return Response.json({ ok: false, error: "missing_invite_id" }, { status: 400 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const { error } = await sb.from("workspace_invites").delete().eq("id", inviteId).eq("workspace_id", id);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
