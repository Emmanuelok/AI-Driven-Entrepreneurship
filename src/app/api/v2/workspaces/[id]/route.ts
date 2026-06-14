import { z } from "zod";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { authWorkspace, requireWorkspaceRole, bearerToken } from "@/lib/workspace-auth";
import { parseBody } from "@/lib/parse-body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET    — full workspace + members + deadlines + recent activity for any member.
// PATCH  — edit title/description/accent/visibility/data; any editor+ may.
// DELETE — owner-only.

const PatchBody = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  accent: z.enum(["emerald", "amber", "indigo", "rust"] as unknown as readonly [string, ...string[]]).optional(),
  visibility: z.enum(["private", "link", "public"] as unknown as readonly [string, ...string[]]).optional(),
  data: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await params;
  const me = await authWorkspace(bearerToken(req), id);
  if (!me) return Response.json({ ok: false, error: "not_a_member" }, { status: 403 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const [wsRes, membersRes, deadlinesRes, activityRes, invitesRes] = await Promise.all([
    sb.from("workspaces").select("*").eq("id", id).maybeSingle(),
    sb.from("workspace_members").select("*").eq("workspace_id", id).order("joined_at", { ascending: true }),
    sb.from("workspace_deadlines").select("*").eq("workspace_id", id).order("due_at", { ascending: true }),
    sb.from("workspace_activity").select("*").eq("workspace_id", id).order("created_at", { ascending: false }).limit(40),
    // Invites only for admin+.
    me.role === "owner" || me.role === "admin"
      ? sb.from("workspace_invites").select("*").eq("workspace_id", id).order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as unknown[], error: null }),
  ]);

  if (wsRes.error || !wsRes.data) {
    return Response.json({ ok: false, error: wsRes.error?.message || "not_found" }, { status: 404 });
  }

  return Response.json({
    ok: true,
    workspace: wsRes.data,
    members: membersRes.data ?? [],
    deadlines: deadlinesRes.data ?? [],
    activity: activityRes.data ?? [],
    invites: invitesRes.data ?? [],
    myRole: me.role,
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await params;
  const me = await authWorkspace(bearerToken(req), id);
  const forbid = requireWorkspaceRole(me, "editor");
  if (forbid) return forbid;

  const parsed = await parseBody(req, PatchBody);
  if (!parsed.ok) return parsed.response;
  const patch = parsed.data;

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  // Sensitive fields (visibility) gated to admin+.
  if ((patch.visibility || patch.accent) && !["owner", "admin"].includes(me!.role)) {
    return Response.json({ ok: false, error: "forbidden", note: "accent/visibility are admin-only" }, { status: 403 });
  }

  const { error } = await sb.from("workspaces").update(patch).eq("id", id);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  await sb.from("workspace_activity").insert({
    workspace_id: id,
    user_id: me!.userId,
    kind: "content_edit",
    title: patch.title ? "Renamed workspace" : "Updated workspace",
    body: patch.title ?? null,
  });

  return Response.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await params;
  const me = await authWorkspace(bearerToken(req), id);
  const forbid = requireWorkspaceRole(me, "owner");
  if (forbid) return forbid;

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const { error } = await sb.from("workspaces").delete().eq("id", id);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
