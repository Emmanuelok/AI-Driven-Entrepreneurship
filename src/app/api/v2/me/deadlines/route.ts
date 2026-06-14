import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { bearerToken } from "@/lib/workspace-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — every workspace deadline the signed-in user should care about,
//       across every workspace they belong to. Returns at most ~60
//       open deadlines (assigned to them OR workspace-wide) sorted by
//       due_at ascending. Closed/missed/cancelled are excluded.
//
// Purpose: powers the dashboard "Deadlines coming up" widget so the
// user doesn't need to open each workspace to see what's looming.

export async function GET(req: Request) {
  if (!isSupabaseConfigured()) return Response.json({ ok: true, mode: "local", results: [] });
  const token = bearerToken(req);
  if (!token) return Response.json({ ok: false, error: "missing_token" }, { status: 401 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const { data: u, error: e1 } = await sb.auth.getUser(token);
  if (e1 || !u?.user) return Response.json({ ok: false, error: "auth_failed" }, { status: 401 });
  const userId = u.user.id;

  // The set of workspaces I belong to.
  const { data: memberships } = await sb
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", userId);
  const wsIds = (memberships ?? []).map((m) => (m as { workspace_id: string }).workspace_id);
  if (wsIds.length === 0) return Response.json({ ok: true, results: [] });

  // Two queries: deadlines explicitly assigned to me + workspace-wide.
  // Postgres can union via OR but the supabase-js builder doesn't make
  // that clean, so we issue both and merge.
  const [mineRes, allRes] = await Promise.all([
    sb
      .from("workspace_deadlines")
      .select("id, workspace_id, title, detail, due_at, status, set_by_role, assignee_user_id")
      .in("workspace_id", wsIds)
      .eq("assignee_user_id", userId)
      .eq("status", "open")
      .order("due_at", { ascending: true })
      .limit(60),
    sb
      .from("workspace_deadlines")
      .select("id, workspace_id, title, detail, due_at, status, set_by_role, assignee_user_id")
      .in("workspace_id", wsIds)
      .is("assignee_user_id", null)
      .eq("status", "open")
      .order("due_at", { ascending: true })
      .limit(60),
  ]);

  // Workspace titles for display.
  const { data: ws } = await sb
    .from("workspaces")
    .select("id, title, accent")
    .in("id", wsIds);
  const wsMeta = new Map<string, { title: string; accent: string }>();
  for (const r of ws ?? []) {
    const row = r as { id: string; title: string; accent: string };
    wsMeta.set(row.id, { title: row.title, accent: row.accent });
  }

  const merged = [...(mineRes.data ?? []), ...(allRes.data ?? [])]
    .map((d) => {
      const row = d as { id: string; workspace_id: string; title: string; detail: string; due_at: string; status: string; set_by_role: string; assignee_user_id: string | null };
      const m = wsMeta.get(row.workspace_id);
      return { ...row, workspace_title: m?.title ?? "Workspace", workspace_accent: m?.accent ?? "emerald" };
    })
    .sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime())
    .slice(0, 60);

  return Response.json({ ok: true, results: merged });
}
