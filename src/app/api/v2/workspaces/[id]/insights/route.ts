import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { authWorkspace, bearerToken } from "@/lib/workspace-auth";
import { computeWorkspaceInsights, type InsightEvent } from "@/lib/workspace-insights";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET ?days=7 — a personal "your week here" summary for the caller in
// this workspace: tasks they closed, deadlines they hit, messages they
// sent, files they added. Built from a handful of bounded queries +
// the pure insights computation.

const DAY = 86_400_000;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await params;
  const me = await authWorkspace(bearerToken(req), id);
  if (!me) return Response.json({ ok: false, error: "not_a_member" }, { status: 403 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const url = new URL(req.url);
  const days = Math.max(1, Math.min(90, parseInt(url.searchParams.get("days") ?? "7") || 7));
  const now = Date.now();
  const sinceIso = new Date(now - days * DAY).toISOString();

  // Gather the caller's own events. Each query is scoped to this user +
  // workspace + window, so the volume is small.
  const [tasksDone, deadlinesDone, messages, files, tasksAdded] = await Promise.all([
    // Tasks the user closed: assigned to them, status done, updated in
    // window. (We approximate "closed by me" as "mine + done"; the
    // board doesn't track who flipped the status, but assignment is the
    // strongest available signal.)
    sb.from("workspace_tasks").select("updated_at").eq("workspace_id", id).eq("assignee_user_id", me.userId).eq("status", "done").gte("updated_at", sinceIso).limit(500),
    // Deadlines they completed: set_by them OR assigned to them, done,
    // updated in window.
    sb.from("workspace_deadlines").select("updated_at").eq("workspace_id", id).eq("assignee_user_id", me.userId).eq("status", "done").gte("updated_at", sinceIso).limit(500),
    sb.from("workspace_messages").select("created_at").eq("workspace_id", id).eq("user_id", me.userId).gte("created_at", sinceIso).limit(2000),
    sb.from("workspace_files").select("created_at").eq("workspace_id", id).eq("uploaded_by", me.userId).gte("created_at", sinceIso).limit(500),
    sb.from("workspace_tasks").select("created_at").eq("workspace_id", id).eq("created_by", me.userId).gte("created_at", sinceIso).limit(500),
  ]);

  const events: InsightEvent[] = [];
  for (const r of tasksDone.data ?? []) events.push({ kind: "task_done", at: new Date((r as { updated_at: string }).updated_at).getTime() });
  for (const r of deadlinesDone.data ?? []) events.push({ kind: "deadline_done", at: new Date((r as { updated_at: string }).updated_at).getTime() });
  for (const r of messages.data ?? []) events.push({ kind: "message", at: new Date((r as { created_at: string }).created_at).getTime() });
  for (const r of files.data ?? []) events.push({ kind: "file_added", at: new Date((r as { created_at: string }).created_at).getTime() });
  for (const r of tasksAdded.data ?? []) events.push({ kind: "task_added", at: new Date((r as { created_at: string }).created_at).getTime() });

  const insights = computeWorkspaceInsights(events, now, days);
  return Response.json({ ok: true, insights });
}
