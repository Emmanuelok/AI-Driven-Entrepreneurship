import { z } from "zod";
import { nanoid } from "nanoid";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { authWorkspace, bearerToken } from "@/lib/workspace-auth";
import { parseBody } from "@/lib/parse-body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST — clone this workspace into a fresh one owned by the caller.
//
// What's copied:
//   - title (with optional override) + description + kind + accent
//   - the task board: top-level tasks AND their subtasks. Status is
//     RESET to 'todo' so the new workspace starts from zero. Assignees
//     are cleared (they belong to the source's roster). Due dates are
//     cleared (they're relative to the original schedule).
//   - notes: TITLES copied; bodies start empty so stale content from
//     the source doesn't sneak in. Each note carries the same "fill in"
//     scaffold a fresh user would expect.
//   - deadlines: by default NOT copied (they're tied to the original
//     schedule); body.copyDeadlines=true copies titles only (status
//     reset to open, due_at shifted forward by N days = inDays
//     parameter, default 7).
//
// What's NOT copied:
//   - messages (discussion is conversational; replaying would be noise)
//   - files (storage objects; cross-bucket copy is a future job)
//   - members (the new owner can re-invite)
//   - activity stream + invites
//
// Any member of the source can duplicate it — owning the source isn't
// required (this is "spin up a new room based on what I see").

const Body = z.object({
  title: z.string().min(1).max(200).optional(),
  copyDeadlines: z.boolean().optional(),
  shiftDeadlinesDays: z.number().int().min(0).max(365).optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id: sourceId } = await params;
  const me = await authWorkspace(bearerToken(req), sourceId);
  if (!me) return Response.json({ ok: false, error: "not_a_member" }, { status: 403 });

  const parsed = await parseBody(req, Body);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  // Load the source.
  const { data: source } = await sb
    .from("workspaces")
    .select("title, description, kind, accent, data")
    .eq("id", sourceId)
    .maybeSingle();
  if (!source) return Response.json({ ok: false, error: "source_not_found" }, { status: 404 });

  const newId = nanoid(12);
  const newTitle = (body.title?.trim() || `${source.title} (copy)`).slice(0, 200);

  // 1. Create the new workspace. The insert trigger from migration 0023
  //    auto-adds the owner as a member, so we don't have to.
  const { error: wErr } = await sb.from("workspaces").insert({
    id: newId,
    owner_id: me.userId,
    title: newTitle,
    description: source.description,
    kind: source.kind,
    accent: source.accent,
    visibility: "private",
    data: source.data ?? {},
  });
  if (wErr) return Response.json({ ok: false, error: wErr.message }, { status: 500 });

  // Keep the cached email/display_name on the owner row fresh — same as
  // the create route does.
  await sb
    .from("workspace_members")
    .update({ email: me.email ?? null })
    .eq("workspace_id", newId)
    .eq("user_id", me.userId);

  // 2. Clone tasks. Build a parent→new-id map so subtasks point at the
  //    cloned parent, not the original.
  const { data: tasks } = await sb
    .from("workspace_tasks")
    .select("id, parent_task_id, title, detail, position")
    .eq("workspace_id", sourceId)
    .order("position", { ascending: true });
  const parentMap = new Map<string, string>();
  let clonedTasks = 0;
  if (tasks && tasks.length > 0) {
    // First pass: top-level tasks.
    const topLevels = (tasks as Array<{ id: string; parent_task_id: string | null; title: string; detail: string; position: number }>).filter((t) => !t.parent_task_id);
    for (const t of topLevels) {
      const { data: ins } = await sb
        .from("workspace_tasks")
        .insert({ workspace_id: newId, title: t.title, detail: t.detail, status: "todo", position: t.position, created_by: me.userId })
        .select("id")
        .single();
      if (ins) { parentMap.set(t.id, ins.id as string); clonedTasks++; }
    }
    // Second pass: subtasks, remapping parent_task_id to the freshly
    // inserted parent.
    const subs = (tasks as Array<{ id: string; parent_task_id: string | null; title: string; detail: string; position: number }>).filter((t) => t.parent_task_id);
    for (const s of subs) {
      const newParent = parentMap.get(s.parent_task_id!);
      if (!newParent) continue;
      const { error: subErr } = await sb
        .from("workspace_tasks")
        .insert({ workspace_id: newId, parent_task_id: newParent, title: s.title, detail: s.detail, status: "todo", position: s.position, created_by: me.userId });
      if (!subErr) clonedTasks++;
    }
  }

  // 3. Clone notes (titles + empty bodies).
  const { data: notes } = await sb.from("workspace_docs").select("title").eq("workspace_id", sourceId);
  let clonedNotes = 0;
  for (const n of notes ?? []) {
    const row = n as { title: string };
    const { error: nErr } = await sb.from("workspace_docs").insert({ workspace_id: newId, title: row.title, body: "", updated_by: me.userId });
    if (!nErr) clonedNotes++;
  }

  // 4. Optionally clone deadlines (shifted forward).
  let clonedDeadlines = 0;
  if (body.copyDeadlines) {
    const shift = (body.shiftDeadlinesDays ?? 7) * 86_400_000;
    const { data: deadlines } = await sb
      .from("workspace_deadlines")
      .select("title, detail, due_at, set_by_role, assignee_user_id, recurrence_rule")
      .eq("workspace_id", sourceId)
      .eq("status", "open");
    for (const d of deadlines ?? []) {
      const row = d as { title: string; detail: string; due_at: string; set_by_role: string; assignee_user_id: string | null; recurrence_rule: unknown };
      const newDue = new Date(new Date(row.due_at).getTime() + shift);
      // Workspace-wide deadlines stay workspace-wide; per-person deadlines
      // are reassigned to the new owner (the original assignees aren't in
      // the new workspace yet).
      const { error: dErr } = await sb.from("workspace_deadlines").insert({
        workspace_id: newId,
        title: row.title,
        detail: row.detail,
        due_at: newDue.toISOString(),
        set_by_user_id: me.userId,
        set_by_role: row.set_by_role,
        assignee_user_id: row.assignee_user_id === null ? null : me.userId,
        recurrence_rule: row.recurrence_rule ?? null,
      });
      if (!dErr) clonedDeadlines++;
    }
  }

  await sb.from("workspace_activity").insert({
    workspace_id: newId,
    user_id: me.userId,
    kind: "duplicated",
    title: `Duplicated from "${source.title}"`,
    body: `${clonedTasks} tasks · ${clonedNotes} notes${body.copyDeadlines ? ` · ${clonedDeadlines} deadlines (shifted +${body.shiftDeadlinesDays ?? 7}d)` : ""}`,
  });

  return Response.json({ ok: true, id: newId, clonedTasks, clonedNotes, clonedDeadlines });
}
