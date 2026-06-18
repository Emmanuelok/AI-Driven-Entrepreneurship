import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { bearerToken } from "@/lib/workspace-auth";
import { computeWorkspaceInsights, type InsightEvent, type WorkspaceInsights } from "@/lib/workspace-insights";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET ?days=7 — cross-workspace personal insights for the signed-in
// user. Aggregates the same computation as the per-workspace insights
// across every ACTIVE workspace the user belongs to, plus returns the
// per-workspace breakdown so the UI can show a 'where you were active'
// list.

const DAY = 86_400_000;

export type CrossInsights = {
  windowDays: number;
  total: WorkspaceInsights;
  perWorkspace: { workspace_id: string; title: string; accent: string; insights: WorkspaceInsights }[];
};

export async function GET(req: Request) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const token = bearerToken(req);
  if (!token) return Response.json({ ok: false, error: "missing_token" }, { status: 401 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const { data: u, error: e1 } = await sb.auth.getUser(token);
  if (e1 || !u?.user) return Response.json({ ok: false, error: "auth_failed" }, { status: 401 });
  const userId = u.user.id;

  const url = new URL(req.url);
  const days = Math.max(1, Math.min(90, parseInt(url.searchParams.get("days") ?? "7") || 7));
  const now = Date.now();
  const sinceIso = new Date(now - days * DAY).toISOString();

  // 1. Find the user's active workspaces.
  const { data: memberships } = await sb.from("workspace_members").select("workspace_id").eq("user_id", userId);
  const allWsIds = (memberships ?? []).map((m) => (m as { workspace_id: string }).workspace_id);
  if (allWsIds.length === 0) {
    const empty = computeWorkspaceInsights([], now, days);
    return Response.json({ ok: true, insights: { windowDays: days, total: empty, perWorkspace: [] } });
  }

  const { data: ws } = await sb.from("workspaces").select("id, title, accent, archived_at").in("id", allWsIds);
  const meta = new Map<string, { title: string; accent: string }>();
  const activeIds: string[] = [];
  for (const r of ws ?? []) {
    const row = r as { id: string; title: string; accent: string; archived_at: string | null };
    if (row.archived_at) continue;
    meta.set(row.id, { title: row.title, accent: row.accent });
    activeIds.push(row.id);
  }
  if (activeIds.length === 0) {
    const empty = computeWorkspaceInsights([], now, days);
    return Response.json({ ok: true, insights: { windowDays: days, total: empty, perWorkspace: [] } });
  }

  // 2. Pull the caller's events across all active workspaces in 5
  //    bounded parallel queries.
  const [tasksDone, deadlinesDone, messages, files, tasksAdded] = await Promise.all([
    sb.from("workspace_tasks").select("workspace_id, updated_at").in("workspace_id", activeIds).eq("assignee_user_id", userId).eq("status", "done").gte("updated_at", sinceIso).limit(3000),
    sb.from("workspace_deadlines").select("workspace_id, updated_at").in("workspace_id", activeIds).eq("assignee_user_id", userId).eq("status", "done").gte("updated_at", sinceIso).limit(3000),
    sb.from("workspace_messages").select("workspace_id, created_at").in("workspace_id", activeIds).eq("user_id", userId).gte("created_at", sinceIso).limit(8000),
    sb.from("workspace_files").select("workspace_id, created_at").in("workspace_id", activeIds).eq("uploaded_by", userId).gte("created_at", sinceIso).limit(2000),
    sb.from("workspace_tasks").select("workspace_id, created_at").in("workspace_id", activeIds).eq("created_by", userId).gte("created_at", sinceIso).limit(3000),
  ]);

  // 3. Bucket events by workspace_id.
  const eventsByWs = new Map<string, InsightEvent[]>();
  const push = (wsId: string, ev: InsightEvent) => {
    const arr = eventsByWs.get(wsId) ?? [];
    arr.push(ev);
    eventsByWs.set(wsId, arr);
  };
  for (const r of tasksDone.data ?? []) {
    const row = r as { workspace_id: string; updated_at: string };
    push(row.workspace_id, { kind: "task_done", at: new Date(row.updated_at).getTime() });
  }
  for (const r of deadlinesDone.data ?? []) {
    const row = r as { workspace_id: string; updated_at: string };
    push(row.workspace_id, { kind: "deadline_done", at: new Date(row.updated_at).getTime() });
  }
  for (const r of messages.data ?? []) {
    const row = r as { workspace_id: string; created_at: string };
    push(row.workspace_id, { kind: "message", at: new Date(row.created_at).getTime() });
  }
  for (const r of files.data ?? []) {
    const row = r as { workspace_id: string; created_at: string };
    push(row.workspace_id, { kind: "file_added", at: new Date(row.created_at).getTime() });
  }
  for (const r of tasksAdded.data ?? []) {
    const row = r as { workspace_id: string; created_at: string };
    push(row.workspace_id, { kind: "task_added", at: new Date(row.created_at).getTime() });
  }

  // 4. Compute per-workspace insights, then aggregate by passing the
  //    UNION of events to the same pure function — that way the
  //    'total' headline + momentum reads correctly.
  const perWorkspace = activeIds
    .map((wsId) => {
      const m = meta.get(wsId)!;
      const events = eventsByWs.get(wsId) ?? [];
      return { workspace_id: wsId, title: m.title, accent: m.accent, insights: computeWorkspaceInsights(events, now, days) };
    })
    .filter((p) => p.insights.totalEvents > 0) // hide silent rooms
    .sort((a, b) => b.insights.totalEvents - a.insights.totalEvents);

  const allEvents = Array.from(eventsByWs.values()).flat();
  const total = computeWorkspaceInsights(allEvents, now, days);

  const result: CrossInsights = { windowDays: days, total, perWorkspace };
  return Response.json({ ok: true, insights: result });
}
