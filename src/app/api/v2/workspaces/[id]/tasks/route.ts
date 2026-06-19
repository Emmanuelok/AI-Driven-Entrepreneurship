import { z } from "zod";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { authWorkspace, requireWorkspaceRole, bearerToken } from "@/lib/workspace-auth";
import { parseBody } from "@/lib/parse-body";
import { pushToUser } from "@/lib/push-to-user";
import { nextOccurrence, validateRule, type RecurrenceRule } from "@/lib/recurrence";
import { indexWorkspaceTask, unindexWorkspaceRow } from "@/lib/workspace-search-indexer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET    — all tasks for a workspace (any member).
// POST   — create a task. Editor+. Lands at the bottom of its column.
// PATCH  — edit / move / (re)assign a task. Editor+, or the assignee
//          moving their own task. Body: { id, ...patch }.
// DELETE — ?taskId=…  Editor+.

const STATUSES = ["todo", "doing", "done", "blocked"] as const;

const CreateBody = z.object({
  title: z.string().min(1).max(200),
  detail: z.string().max(2000).optional(),
  status: z.enum(STATUSES as unknown as readonly [string, ...string[]]).optional(),
  assigneeUserId: z.string().max(64).optional().nullable(),
  dueAt: z.string().min(10).max(40).optional().nullable(),
  parentTaskId: z.string().max(64).optional().nullable(),
  recurrenceRule: z.record(z.string(), z.unknown()).optional().nullable(),
});

const PatchBody = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(200).optional(),
  detail: z.string().max(2000).optional(),
  status: z.enum(STATUSES as unknown as readonly [string, ...string[]]).optional(),
  assigneeUserId: z.string().max(64).optional().nullable(),
  position: z.number().optional(),
  dueAt: z.string().min(10).max(40).optional().nullable(),
  recurrenceRule: z.record(z.string(), z.unknown()).optional().nullable(),
});

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await params;
  const me = await authWorkspace(bearerToken(req), id);
  if (!me) return Response.json({ ok: false, error: "not_a_member" }, { status: 403 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const { data, error } = await sb
    .from("workspace_tasks")
    .select("*")
    .eq("workspace_id", id)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true, results: data ?? [] });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await params;
  const me = await authWorkspace(bearerToken(req), id);
  const forbid = requireWorkspaceRole(me, "editor");
  if (forbid) return forbid;

  const parsed = await parseBody(req, CreateBody);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const status = body.status ?? "todo";

  // Subtask rules: parent must exist in the same workspace and itself
  // be a top-level task — we cap nesting at one level (parent→child),
  // which matches every real project-management tool worth using.
  let parentTaskId: string | null = null;
  if (body.parentTaskId) {
    const { data: parent } = await sb.from("workspace_tasks").select("id, parent_task_id, workspace_id").eq("id", body.parentTaskId).maybeSingle();
    if (!parent || parent.workspace_id !== id) return Response.json({ ok: false, error: "parent_not_found" }, { status: 400 });
    if (parent.parent_task_id) return Response.json({ ok: false, error: "nesting_too_deep", note: "Subtasks can't have subtasks." }, { status: 400 });
    parentTaskId = body.parentTaskId;
  }

  const position = await nextPosition(sb, id, status, parentTaskId);
  const assigneeName = body.assigneeUserId ? await memberName(sb, id, body.assigneeUserId) : null;
  const dueAt = parseDue(body.dueAt);
  if (body.dueAt && dueAt === undefined) return Response.json({ ok: false, error: "invalid_due_at" }, { status: 400 });

  // Recurring tasks require a due_at to anchor the series. Validate
  // the rule with the same pure validator the deadline route uses.
  let rule: RecurrenceRule | null = null;
  if (body.recurrenceRule) {
    if (!dueAt) return Response.json({ ok: false, error: "recurring_requires_due_at" }, { status: 400 });
    const v = validateRule(body.recurrenceRule);
    if (!v.ok) return Response.json({ ok: false, error: v.error }, { status: 400 });
    rule = v.rule;
  }

  const { data, error } = await sb
    .from("workspace_tasks")
    .insert({
      workspace_id: id,
      title: body.title,
      detail: body.detail ?? "",
      status,
      assignee_user_id: body.assigneeUserId ?? null,
      assignee_name: assigneeName,
      position,
      created_by: me!.userId,
      due_at: dueAt ?? null,
      parent_task_id: parentTaskId,
      recurrence_rule: rule,
    })
    .select("*")
    .single();
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  await sb.from("workspace_activity").insert({
    workspace_id: id,
    user_id: me!.userId,
    kind: "task_added",
    title: `Task: ${body.title}`,
    body: null,
  });

  // Notify the assignee if it's someone other than the creator.
  if (body.assigneeUserId && body.assigneeUserId !== me!.userId) {
    await notifyAssignment(sb, id, body.assigneeUserId, body.title, dueAt ?? null);
  }

  // Phase 63: index for semantic search.
  void indexWorkspaceTask({
    id: data.id,
    workspace_id: data.workspace_id,
    title: data.title,
    detail: data.detail ?? "",
    status: data.status,
    assignee_name: data.assignee_name ?? null,
  });

  return Response.json({ ok: true, task: data });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await params;
  const me = await authWorkspace(bearerToken(req), id);
  if (!me) return Response.json({ ok: false, error: "not_a_member" }, { status: 403 });

  const parsed = await parseBody(req, PatchBody);
  if (!parsed.ok) return parsed.response;
  const { id: taskId, ...patch } = parsed.data;

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const { data: existing } = await sb
    .from("workspace_tasks")
    .select("assignee_user_id, status, due_at, recurrence_rule, occurrences_completed, title")
    .eq("id", taskId)
    .eq("workspace_id", id)
    .maybeSingle();
  if (!existing) return Response.json({ ok: false, error: "not_found" }, { status: 404 });

  // Editors+ can change anything; a plain member may move/edit a task
  // assigned to them (so people can manage their own work).
  const isEditor = me.role === "owner" || me.role === "admin" || me.role === "editor";
  const ownsTask = existing.assignee_user_id === me.userId;
  if (!isEditor && !ownsTask) return Response.json({ ok: false, error: "forbidden" }, { status: 403 });

  const update: Record<string, unknown> = {};
  if (patch.title !== undefined) update.title = patch.title;
  if (patch.detail !== undefined) update.detail = patch.detail;
  if (patch.position !== undefined) update.position = patch.position;

  // Recurring tasks: closing one advances its due_at to the next
  // occurrence and resets status to todo. The series stays alive until
  // the rule is exhausted (COUNT / UNTIL).
  let advancedTo: string | null = null;
  let seriesEnded = false;
  if (patch.status === "done" && existing.recurrence_rule && existing.due_at) {
    const rule = existing.recurrence_rule as RecurrenceRule;
    const completed = ((existing.occurrences_completed as number) ?? 0) + 1;
    const next = nextOccurrence(rule, new Date(existing.due_at as string), completed);
    if (next) {
      update.status = "todo";
      update.due_at = next.toISOString();
      update.occurrences_completed = completed;
      // Land at the bottom of the todo column for the new instance.
      if (patch.position === undefined) update.position = await nextPosition(sb, id, "todo");
      advancedTo = next.toISOString();
    } else {
      update.status = "done";
      update.occurrences_completed = completed;
      seriesEnded = true;
    }
  } else if (patch.status !== undefined) {
    update.status = patch.status;
    // Moving columns → land at the bottom of the target column unless an
    // explicit position was supplied.
    if (patch.position === undefined && patch.status !== existing.status) {
      update.position = await nextPosition(sb, id, patch.status);
    }
  }
  if (patch.assigneeUserId !== undefined) {
    update.assignee_user_id = patch.assigneeUserId;
    update.assignee_name = patch.assigneeUserId ? await memberName(sb, id, patch.assigneeUserId) : null;
  }
  if (patch.dueAt !== undefined) {
    if (patch.dueAt === null) update.due_at = null;
    else {
      const d = parseDue(patch.dueAt);
      if (d === undefined) return Response.json({ ok: false, error: "invalid_due_at" }, { status: 400 });
      update.due_at = d;
    }
  }
  if (patch.recurrenceRule !== undefined) {
    if (patch.recurrenceRule === null) {
      update.recurrence_rule = null;
      update.occurrences_completed = 0;
    } else {
      const v = validateRule(patch.recurrenceRule);
      if (!v.ok) return Response.json({ ok: false, error: v.error }, { status: 400 });
      // Recurring tasks need a due_at to anchor the series — either the
      // existing one stays, or one is being set in this same patch.
      const willHaveDue = patch.dueAt !== undefined ? patch.dueAt !== null : !!existing.due_at;
      if (!willHaveDue) return Response.json({ ok: false, error: "recurring_requires_due_at" }, { status: 400 });
      update.recurrence_rule = v.rule;
    }
  }

  const { data, error } = await sb.from("workspace_tasks").update(update).eq("id", taskId).select("*").single();
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  // Phase 63: re-index after edit.
  void indexWorkspaceTask({
    id: (data as { id: string }).id,
    workspace_id: (data as { workspace_id: string }).workspace_id,
    title: (data as { title: string }).title,
    detail: ((data as { detail?: string }).detail ?? ""),
    status: (data as { status: string }).status,
    assignee_name: (data as { assignee_name?: string | null }).assignee_name ?? null,
  });

  if (patch.status === "done" && existing.status !== "done") {
    const note = advancedTo
      ? `Completed "${data!.title}" — next occurrence ${new Date(advancedTo).toUTCString()}`
      : seriesEnded
        ? `Completed "${data!.title}" — recurring series complete`
        : `Completed: ${data!.title}`;
    await sb.from("workspace_activity").insert({ workspace_id: id, user_id: me.userId, kind: "task_done", title: note, body: null });
  }

  // Note: advancedTo/seriesEnded flow through the return below.

  // Notify on a NEW assignment to someone other than the editor making it.
  if (patch.assigneeUserId !== undefined && patch.assigneeUserId && patch.assigneeUserId !== existing.assignee_user_id && patch.assigneeUserId !== me.userId) {
    await notifyAssignment(sb, id, patch.assigneeUserId, data!.title as string, (data!.due_at as string | null) ?? null);
  }

  return Response.json({ ok: true, task: data, advancedTo, seriesEnded });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await params;
  const me = await authWorkspace(bearerToken(req), id);
  const forbid = requireWorkspaceRole(me, "editor");
  if (forbid) return forbid;

  const url = new URL(req.url);
  const taskId = url.searchParams.get("taskId");
  if (!taskId) return Response.json({ ok: false, error: "missing_task_id" }, { status: 400 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const { error } = await sb.from("workspace_tasks").delete().eq("id", taskId).eq("workspace_id", id);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  // Phase 63: drop from index.
  void unindexWorkspaceRow(id, "task", taskId);
  return Response.json({ ok: true });
}

// ── helpers ─────────────────────────────────────────────────────────────
async function nextPosition(sb: NonNullable<ReturnType<typeof supabaseAdmin>>, workspaceId: string, status: string, parentTaskId: string | null = null): Promise<number> {
  // Position is scoped per (workspace, status, parent). Top-level rows
  // pass parent=null; subtasks order within their parent's checklist.
  let q = sb
    .from("workspace_tasks")
    .select("position")
    .eq("workspace_id", workspaceId)
    .eq("status", status);
  q = parentTaskId === null ? q.is("parent_task_id", null) : q.eq("parent_task_id", parentTaskId);
  const { data } = await q.order("position", { ascending: false }).limit(1).maybeSingle();
  return ((data?.position as number | undefined) ?? 0) + 1;
}

async function memberName(sb: NonNullable<ReturnType<typeof supabaseAdmin>>, workspaceId: string, userId: string): Promise<string | null> {
  const { data } = await sb
    .from("workspace_members")
    .select("display_name, email")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  return (data?.display_name as string | null) ?? (data?.email as string | null) ?? null;
}

// Returns an ISO string for a valid date, undefined for an unparseable
// one (so the caller can 400), or null when explicitly clearing.
function parseDue(v: string | null | undefined): string | null | undefined {
  if (v === null || v === undefined) return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

// In-app + push notification when a task is assigned to someone.
async function notifyAssignment(
  sb: NonNullable<ReturnType<typeof supabaseAdmin>>,
  workspaceId: string,
  assigneeId: string,
  taskTitle: string,
  dueAt: string | null,
) {
  const { data: ws } = await sb.from("workspaces").select("title").eq("id", workspaceId).maybeSingle();
  const wsTitle = (ws?.title as string | undefined) ?? "a workspace";
  const dueLine = dueAt ? ` · due ${new Date(dueAt).toUTCString().replace(":00 GMT", " UTC")}` : "";
  const href = `/studio/workspaces/${workspaceId}`;
  const title = `You were assigned a task`;
  const body = `${taskTitle} — in ${wsTitle}${dueLine}`;

  await sb.from("notifications").insert({
    user_id: assigneeId,
    kind: "system",
    actor_name: "Task board",
    target_kind: "workspace",
    target_slug: workspaceId,
    title,
    body,
    url: href,
    read: false,
  });
  // Best-effort push (respects the user's "system" preference).
  await pushToUser(assigneeId, { title, body, url: href, tag: `wstask:${workspaceId}` }, { category: "system" }).catch(() => {});
}
