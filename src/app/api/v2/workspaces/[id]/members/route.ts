import { z } from "zod";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { authWorkspace, requireWorkspaceRole, bearerToken } from "@/lib/workspace-auth";
import { parseBody } from "@/lib/parse-body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PATCH — change a member's role. Admin+ only; owner cannot be demoted.
//         Body: { userId, role }
// DELETE — remove a member from the workspace. Admin+ only OR the user
//          removing themselves (leaving). Owner cannot be removed by
//          this route — they must transfer ownership or delete the
//          workspace. Query: ?userId=…

const PatchBody = z.object({
  userId: z.string().min(1).max(64),
  role: z.enum(["admin", "editor", "viewer"] as unknown as readonly [string, ...string[]]),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await params;
  const me = await authWorkspace(bearerToken(req), id);
  const forbid = requireWorkspaceRole(me, "admin");
  if (forbid) return forbid;

  const parsed = await parseBody(req, PatchBody);
  if (!parsed.ok) return parsed.response;

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  // Don't allow demoting the owner via this route.
  const { data: target } = await sb
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", id)
    .eq("user_id", parsed.data.userId)
    .maybeSingle();
  if (target?.role === "owner") {
    return Response.json({ ok: false, error: "cannot_modify_owner" }, { status: 400 });
  }

  const { error } = await sb
    .from("workspace_members")
    .update({ role: parsed.data.role })
    .eq("workspace_id", id)
    .eq("user_id", parsed.data.userId);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  return Response.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await params;
  const me = await authWorkspace(bearerToken(req), id);
  if (!me) return Response.json({ ok: false, error: "not_a_member" }, { status: 403 });

  const url = new URL(req.url);
  const targetUserId = url.searchParams.get("userId");
  if (!targetUserId) return Response.json({ ok: false, error: "missing_user_id" }, { status: 400 });

  // Leaving is always allowed for self. Removing someone else needs admin+.
  if (targetUserId !== me.userId) {
    const forbid = requireWorkspaceRole(me, "admin");
    if (forbid) return forbid;
  }

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  // Don't allow removing the owner via this route — protects the
  // invariant that every workspace has exactly one owner.
  const { data: target } = await sb
    .from("workspace_members")
    .select("role, display_name, email")
    .eq("workspace_id", id)
    .eq("user_id", targetUserId)
    .maybeSingle();
  if (target?.role === "owner") {
    return Response.json({ ok: false, error: "cannot_remove_owner" }, { status: 400 });
  }

  const { error } = await sb
    .from("workspace_members")
    .delete()
    .eq("workspace_id", id)
    .eq("user_id", targetUserId);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  await sb.from("workspace_activity").insert({
    workspace_id: id,
    user_id: me.userId,
    kind: targetUserId === me.userId ? "left" : "removed",
    title: targetUserId === me.userId ? "Left the workspace" : `Removed ${target?.display_name || target?.email || "a member"}`,
    body: null,
  });

  return Response.json({ ok: true });
}
