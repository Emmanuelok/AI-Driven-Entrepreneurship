import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { authWorkspace, requireWorkspaceRole, bearerToken } from "@/lib/workspace-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — download a JSON archive of the workspace. Owner only — this is
// effectively a full data dump (members, content, history) and we don't
// want a transient editor pulling everything.
//
// Returns Content-Type: application/json with a Content-Disposition
// attachment header so the browser saves it as a file. File names are
// sanitized from the workspace title.
//
// What's included:
//   workspace (metadata + visibility + accent + data jsonb)
//   members (display_name, email, role, joined_at)
//   tasks (with subtasks, due dates, recurrence)
//   deadlines (with recurrence)
//   notes (full body + version)
//   messages (last 500, oldest-first, no reactions/pins in this v1)
//   files (metadata only — paths kept; no signed URLs since they expire)
//   activity (last 1000)
// What's NOT included:
//   - DMs (private between two members)
//   - Sage threads (private to each member)
//   - Reactions, read receipts, presence

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await params;
  const me = await authWorkspace(bearerToken(req), id);
  const forbid = requireWorkspaceRole(me, "owner");
  if (forbid) return forbid;

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const [ws, members, tasks, deadlines, docs, messages, files, activity] = await Promise.all([
    sb.from("workspaces").select("*").eq("id", id).maybeSingle(),
    sb.from("workspace_members").select("user_id, role, display_name, email, joined_at").eq("workspace_id", id),
    sb.from("workspace_tasks").select("*").eq("workspace_id", id).order("position", { ascending: true }),
    sb.from("workspace_deadlines").select("*").eq("workspace_id", id).order("due_at", { ascending: true }),
    sb.from("workspace_docs").select("*").eq("workspace_id", id).order("updated_at", { ascending: false }),
    sb.from("workspace_messages").select("id, user_id, author_name, body, is_agent, mentions, pinned_at, created_at").eq("workspace_id", id).order("created_at", { ascending: true }).limit(500),
    sb.from("workspace_files").select("id, name, path, size_bytes, content_type, uploaded_by, uploaded_by_name, attached_to_kind, attached_to_id, created_at").eq("workspace_id", id),
    sb.from("workspace_activity").select("user_id, kind, title, body, created_at").eq("workspace_id", id).order("created_at", { ascending: false }).limit(1000),
  ]);

  if (!ws.data) return Response.json({ ok: false, error: "not_found" }, { status: 404 });

  const archive = {
    schema: "sankofa.workspace.v1",
    exported_at: new Date().toISOString(),
    exported_by: me!.userId,
    workspace: ws.data,
    members: members.data ?? [],
    tasks: tasks.data ?? [],
    deadlines: deadlines.data ?? [],
    notes: docs.data ?? [],
    messages: messages.data ?? [],
    files: files.data ?? [],
    activity: (activity.data ?? []).reverse(), // oldest-first in the archive reads more naturally
  };

  const filename = sanitize(((ws.data as { title?: string }).title) ?? "workspace") + "-archive.json";
  return new Response(JSON.stringify(archive, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

function sanitize(name: string): string {
  return (name || "workspace")
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "workspace";
}
