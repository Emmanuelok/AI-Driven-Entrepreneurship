import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { bearerToken } from "@/lib/workspace-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — a unified calendar feed for the signed-in user: every OPEN
// workspace deadline (assigned to them OR workspace-wide) plus every
// open task with a due date that is assigned to them, across all their
// workspaces. Each item carries a `kind` discriminator ("deadline" |
// "task") so the calendar can style them distinctly. Also powers the
// .ics export route (which calls this logic via a shared collector).

export type CalendarItemRow = {
  kind: "deadline" | "task";
  id: string;
  workspace_id: string;
  workspace_title: string;
  workspace_accent: string;
  title: string;
  detail: string;
  due_at: string;
  set_by_role: string | null;
  status: string;
};

// Shared collector so the .ics route and this JSON route agree exactly.
export async function collectCalendarItems(sb: NonNullable<ReturnType<typeof supabaseAdmin>>, userId: string): Promise<CalendarItemRow[]> {
  const { data: memberships } = await sb.from("workspace_members").select("workspace_id").eq("user_id", userId);
  const wsIds = (memberships ?? []).map((m) => (m as { workspace_id: string }).workspace_id);
  if (wsIds.length === 0) return [];

  const { data: ws } = await sb.from("workspaces").select("id, title, accent").in("id", wsIds);
  const meta = new Map<string, { title: string; accent: string }>();
  for (const r of ws ?? []) {
    const row = r as { id: string; title: string; accent: string };
    meta.set(row.id, { title: row.title, accent: row.accent });
  }

  const [mineDeadlines, wideDeadlines, tasks] = await Promise.all([
    sb.from("workspace_deadlines").select("id, workspace_id, title, detail, due_at, status, set_by_role").in("workspace_id", wsIds).eq("assignee_user_id", userId).eq("status", "open").limit(500),
    sb.from("workspace_deadlines").select("id, workspace_id, title, detail, due_at, status, set_by_role").in("workspace_id", wsIds).is("assignee_user_id", null).eq("status", "open").limit(500),
    sb.from("workspace_tasks").select("id, workspace_id, title, detail, due_at, status").in("workspace_id", wsIds).eq("assignee_user_id", userId).neq("status", "done").not("due_at", "is", null).limit(500),
  ]);

  const items: CalendarItemRow[] = [];
  for (const d of [...(mineDeadlines.data ?? []), ...(wideDeadlines.data ?? [])]) {
    const row = d as { id: string; workspace_id: string; title: string; detail: string; due_at: string; status: string; set_by_role: string };
    const m = meta.get(row.workspace_id);
    items.push({ kind: "deadline", id: row.id, workspace_id: row.workspace_id, workspace_title: m?.title ?? "Workspace", workspace_accent: m?.accent ?? "emerald", title: row.title, detail: row.detail ?? "", due_at: row.due_at, set_by_role: row.set_by_role, status: row.status });
  }
  for (const t of tasks.data ?? []) {
    const row = t as { id: string; workspace_id: string; title: string; detail: string; due_at: string; status: string };
    const m = meta.get(row.workspace_id);
    items.push({ kind: "task", id: row.id, workspace_id: row.workspace_id, workspace_title: m?.title ?? "Workspace", workspace_accent: m?.accent ?? "emerald", title: row.title, detail: row.detail ?? "", due_at: row.due_at, set_by_role: null, status: row.status });
  }

  items.sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime());
  return items;
}

export async function GET(req: Request) {
  if (!isSupabaseConfigured()) return Response.json({ ok: true, mode: "local", results: [] });
  const token = bearerToken(req);
  if (!token) return Response.json({ ok: false, error: "missing_token" }, { status: 401 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const { data: u, error: e1 } = await sb.auth.getUser(token);
  if (e1 || !u?.user) return Response.json({ ok: false, error: "auth_failed" }, { status: 401 });

  const results = await collectCalendarItems(sb, u.user.id);
  return Response.json({ ok: true, results });
}
