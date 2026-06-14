import { z } from "zod";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { authWorkspace, requireWorkspaceRole, bearerToken } from "@/lib/workspace-auth";
import { parseBody } from "@/lib/parse-body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST   — create a deadline. Any member can create self-deadlines
//          (assigneeUserId = caller). Admin+ can create deadlines for
//          the whole workspace (assigneeUserId = null) or for another
//          member, and may set the setByRole (instructor/funder/
//          investor/journal/mentor) to record the source of authority.
// PATCH  — update title/detail/dueAt/status. Members may update their
//          own self-deadlines or mark them done; admin+ may update any.
//          Body: { id, ...patch }
// DELETE — query: ?deadlineId=…  Self may delete their own; admin+ any.

const SET_BY_ROLES = ["self", "admin", "instructor", "funder", "investor", "journal", "mentor"] as const;
const STATUSES = ["open", "done", "missed", "cancelled"] as const;

const CreateBody = z.object({
  title: z.string().min(1).max(200),
  detail: z.string().max(2000).optional(),
  dueAt: z.string().min(10).max(40), // ISO 8601
  assigneeUserId: z.string().min(1).max(64).optional().nullable(),
  setByRole: z.enum(SET_BY_ROLES as unknown as readonly [string, ...string[]]).optional(),
});

const PatchBody = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(200).optional(),
  detail: z.string().max(2000).optional(),
  dueAt: z.string().min(10).max(40).optional(),
  status: z.enum(STATUSES as unknown as readonly [string, ...string[]]).optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await params;
  const me = await authWorkspace(bearerToken(req), id);
  if (!me) return Response.json({ ok: false, error: "not_a_member" }, { status: 403 });

  const parsed = await parseBody(req, CreateBody);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const isAdmin = me.role === "owner" || me.role === "admin";
  // Setting a deadline for someone else (or workspace-wide) is admin+.
  const isSelfAssigned = body.assigneeUserId === me.userId || body.assigneeUserId === undefined;
  if (!isSelfAssigned && !isAdmin) {
    return Response.json({ ok: false, error: "forbidden", note: "Only admins assign deadlines to others." }, { status: 403 });
  }

  // Authority labels (instructor/funder/investor/journal/mentor) are
  // admin-only — a viewer can't unilaterally tag a self-deadline as
  // "instructor-imposed" to spoof an authority signal.
  const setByRole = body.setByRole ?? "self";
  if (setByRole !== "self" && !isAdmin) {
    return Response.json({ ok: false, error: "forbidden", note: "Only admins may stamp non-self setByRole." }, { status: 403 });
  }

  // dueAt sanity — refuse far-past entries.
  const due = new Date(body.dueAt);
  if (isNaN(due.getTime())) return Response.json({ ok: false, error: "invalid_due_at" }, { status: 400 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const { data, error } = await sb
    .from("workspace_deadlines")
    .insert({
      workspace_id: id,
      assignee_user_id: body.assigneeUserId ?? (isSelfAssigned ? me.userId : null),
      title: body.title,
      detail: body.detail ?? "",
      due_at: due.toISOString(),
      set_by_user_id: me.userId,
      set_by_role: setByRole,
    })
    .select("*")
    .single();
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  await sb.from("workspace_activity").insert({
    workspace_id: id,
    user_id: me.userId,
    kind: "deadline_added",
    title: `Deadline: ${body.title}`,
    body: `due ${due.toISOString()} · set by ${setByRole}`,
  });

  return Response.json({ ok: true, deadline: data });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await params;
  const me = await authWorkspace(bearerToken(req), id);
  if (!me) return Response.json({ ok: false, error: "not_a_member" }, { status: 403 });

  const parsed = await parseBody(req, PatchBody);
  if (!parsed.ok) return parsed.response;
  const { id: deadlineId, ...patch } = parsed.data;

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const { data: existing } = await sb
    .from("workspace_deadlines")
    .select("assignee_user_id, set_by_role")
    .eq("id", deadlineId)
    .eq("workspace_id", id)
    .maybeSingle();
  if (!existing) return Response.json({ ok: false, error: "not_found" }, { status: 404 });

  const isAdmin = me.role === "owner" || me.role === "admin";
  const ownsRow = existing.assignee_user_id === me.userId && existing.set_by_role === "self";
  if (!isAdmin && !ownsRow) {
    return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const update: Record<string, unknown> = {};
  if (patch.title !== undefined) update.title = patch.title;
  if (patch.detail !== undefined) update.detail = patch.detail;
  if (patch.dueAt !== undefined) update.due_at = new Date(patch.dueAt).toISOString();
  if (patch.status !== undefined) update.status = patch.status;

  const { error } = await sb.from("workspace_deadlines").update(update).eq("id", deadlineId);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  if (patch.status === "done") {
    await sb.from("workspace_activity").insert({
      workspace_id: id,
      user_id: me.userId,
      kind: "deadline_done",
      title: `Closed a deadline`,
      body: null,
    });
  }

  return Response.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await params;
  const me = await authWorkspace(bearerToken(req), id);
  if (!me) return Response.json({ ok: false, error: "not_a_member" }, { status: 403 });

  const url = new URL(req.url);
  const deadlineId = url.searchParams.get("deadlineId");
  if (!deadlineId) return Response.json({ ok: false, error: "missing_deadline_id" }, { status: 400 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const { data: existing } = await sb
    .from("workspace_deadlines")
    .select("assignee_user_id, set_by_role")
    .eq("id", deadlineId)
    .eq("workspace_id", id)
    .maybeSingle();
  if (!existing) return Response.json({ ok: false, error: "not_found" }, { status: 404 });

  const isAdmin = me.role === "owner" || me.role === "admin";
  const ownsRow = existing.assignee_user_id === me.userId && existing.set_by_role === "self";
  if (!isAdmin && !ownsRow) return Response.json({ ok: false, error: "forbidden" }, { status: 403 });

  const { error } = await sb.from("workspace_deadlines").delete().eq("id", deadlineId);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
