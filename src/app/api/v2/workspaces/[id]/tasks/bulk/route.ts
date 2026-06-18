import { z } from "zod";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { authWorkspace, requireWorkspaceRole, bearerToken } from "@/lib/workspace-auth";
import { parseBody } from "@/lib/parse-body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST — apply ONE operation to many tasks at once. Editor+ only.
//
// Body: { ids: string[], op: { ... } } where op is one of:
//   { kind: "move",   status: "todo"|"doing"|"done"|"blocked" }
//   { kind: "assign", assigneeUserId: string | null }
//   { kind: "delete" }
//
// We restrict the ids to those that actually belong to THIS workspace
// before applying the operation — defense in depth, even though the
// caller is already gated on workspace membership.
//
// Bulk move + assign run as single UPDATEs scoped to the matching ids;
// delete runs as a single DELETE. Counts are returned so the UI can
// show "Moved 5 tasks" feedback.

const STATUSES = ["todo", "doing", "done", "blocked"] as const;

const Body = z.object({
  ids: z.array(z.string().min(1)).min(1).max(200),
  op: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("move"), status: z.enum(STATUSES as unknown as readonly [string, ...string[]]) }),
    z.object({ kind: z.literal("assign"), assigneeUserId: z.string().max(64).nullable() }),
    z.object({ kind: z.literal("delete") }),
  ]),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await params;
  const me = await authWorkspace(bearerToken(req), id);
  const forbid = requireWorkspaceRole(me, "editor");
  if (forbid) return forbid;

  const parsed = await parseBody(req, Body);
  if (!parsed.ok) return parsed.response;
  const { ids, op } = parsed.data;

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  // Verify every id belongs to this workspace. Returns the SET that
  // actually exists in this workspace — orphan ids are silently
  // ignored rather than failing the whole batch (resilient to a
  // half-stale client view).
  const { data: existing } = await sb
    .from("workspace_tasks")
    .select("id")
    .eq("workspace_id", id)
    .in("id", ids);
  const validIds = (existing ?? []).map((r) => (r as { id: string }).id);
  if (validIds.length === 0) return Response.json({ ok: true, affected: 0 });

  if (op.kind === "delete") {
    const { error } = await sb.from("workspace_tasks").delete().in("id", validIds).eq("workspace_id", id);
    if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
    await sb.from("workspace_activity").insert({ workspace_id: id, user_id: me!.userId, kind: "bulk_delete", title: `Deleted ${validIds.length} task${validIds.length === 1 ? "" : "s"}`, body: null });
    return Response.json({ ok: true, affected: validIds.length });
  }

  if (op.kind === "move") {
    const { error } = await sb
      .from("workspace_tasks")
      .update({ status: op.status })
      .in("id", validIds)
      .eq("workspace_id", id);
    if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
    if (op.status === "done") {
      await sb.from("workspace_activity").insert({ workspace_id: id, user_id: me!.userId, kind: "bulk_done", title: `Closed ${validIds.length} task${validIds.length === 1 ? "" : "s"}`, body: null });
    }
    return Response.json({ ok: true, affected: validIds.length });
  }

  // assign
  let assigneeName: string | null = null;
  if (op.assigneeUserId) {
    const { data: m } = await sb.from("workspace_members").select("display_name, email").eq("workspace_id", id).eq("user_id", op.assigneeUserId).maybeSingle();
    assigneeName = (m?.display_name as string | null) ?? (m?.email as string | null) ?? null;
  }
  const { error } = await sb
    .from("workspace_tasks")
    .update({ assignee_user_id: op.assigneeUserId, assignee_name: assigneeName })
    .in("id", validIds)
    .eq("workspace_id", id);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true, affected: validIds.length });
}
