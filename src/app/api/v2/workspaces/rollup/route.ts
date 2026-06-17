import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { bearerToken } from "@/lib/workspace-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — roll-up of every workspace the caller OWNS (i.e. is the
// instructor/admin of). Returns per-workspace metrics + member counts
// for an instructor analytics page. We don't aggregate across workspaces
// where the caller is just a member — that would be a different surface
// (their personal workspace dashboard, already on /studio/workspaces).
//
// Designed to run in a single round-trip: ~6 bulk queries grouped in
// memory, regardless of how many workspaces the caller owns.

const DAY = 86_400_000;

type WsRollupRow = {
  id: string;
  title: string;
  accent: string;
  kind: string;
  member_count: number;
  open_tasks: number;
  done_tasks_7d: number;
  open_deadlines: number;
  overdue_deadlines: number;
  last_activity_at: string | null;
};

export async function GET(req: Request) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const token = bearerToken(req);
  if (!token) return Response.json({ ok: false, error: "missing_token" }, { status: 401 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const { data: u, error: e1 } = await sb.auth.getUser(token);
  if (e1 || !u?.user) return Response.json({ ok: false, error: "auth_failed" }, { status: 401 });
  const ownerId = u.user.id;

  const { data: workspaces } = await sb
    .from("workspaces")
    .select("id, title, accent, kind")
    .eq("owner_id", ownerId)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(200);

  if (!workspaces || workspaces.length === 0) {
    return Response.json({ ok: true, results: [] });
  }

  const wsIds = workspaces.map((w) => (w as { id: string }).id);
  const since7d = new Date(Date.now() - 7 * DAY).toISOString();
  const nowIso = new Date().toISOString();

  // Parallel bulk queries.
  const [membersRes, tasksRes, deadlinesRes, activityRes] = await Promise.all([
    sb.from("workspace_members").select("workspace_id, user_id").in("workspace_id", wsIds),
    sb.from("workspace_tasks").select("workspace_id, status, updated_at").in("workspace_id", wsIds),
    sb.from("workspace_deadlines").select("workspace_id, due_at, status").in("workspace_id", wsIds).eq("status", "open"),
    sb.from("workspace_activity").select("workspace_id, created_at").in("workspace_id", wsIds).order("created_at", { ascending: false }).limit(4000),
  ]);

  const memberCount = new Map<string, number>();
  for (const m of membersRes.data ?? []) {
    const row = m as { workspace_id: string };
    memberCount.set(row.workspace_id, (memberCount.get(row.workspace_id) ?? 0) + 1);
  }

  const openTasks = new Map<string, number>();
  const doneTasks7d = new Map<string, number>();
  for (const t of tasksRes.data ?? []) {
    const row = t as { workspace_id: string; status: string; updated_at: string };
    if (row.status !== "done") {
      openTasks.set(row.workspace_id, (openTasks.get(row.workspace_id) ?? 0) + 1);
    } else if (row.updated_at >= since7d) {
      doneTasks7d.set(row.workspace_id, (doneTasks7d.get(row.workspace_id) ?? 0) + 1);
    }
  }

  const openDeadlines = new Map<string, number>();
  const overdueDeadlines = new Map<string, number>();
  for (const d of deadlinesRes.data ?? []) {
    const row = d as { workspace_id: string; due_at: string };
    openDeadlines.set(row.workspace_id, (openDeadlines.get(row.workspace_id) ?? 0) + 1);
    if (row.due_at < nowIso) overdueDeadlines.set(row.workspace_id, (overdueDeadlines.get(row.workspace_id) ?? 0) + 1);
  }

  // Activity is ordered desc, so the first row per workspace is the latest.
  const lastActivity = new Map<string, string>();
  for (const a of activityRes.data ?? []) {
    const row = a as { workspace_id: string; created_at: string };
    if (!lastActivity.has(row.workspace_id)) lastActivity.set(row.workspace_id, row.created_at);
  }

  const results: WsRollupRow[] = workspaces.map((w) => {
    const ws = w as { id: string; title: string; accent: string; kind: string };
    return {
      id: ws.id,
      title: ws.title,
      accent: ws.accent,
      kind: ws.kind,
      member_count: memberCount.get(ws.id) ?? 0,
      open_tasks: openTasks.get(ws.id) ?? 0,
      done_tasks_7d: doneTasks7d.get(ws.id) ?? 0,
      open_deadlines: openDeadlines.get(ws.id) ?? 0,
      overdue_deadlines: overdueDeadlines.get(ws.id) ?? 0,
      last_activity_at: lastActivity.get(ws.id) ?? null,
    };
  });

  return Response.json({ ok: true, results });
}
