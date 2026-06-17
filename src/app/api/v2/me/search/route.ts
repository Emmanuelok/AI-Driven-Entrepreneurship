import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { bearerToken } from "@/lib/workspace-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET ?q=<query> — global search across every (non-archived) workspace
// the caller is a member of. Five ILIKE queries scoped via .in() over
// the workspace_id list, so cost stays roughly constant regardless of
// how many workspaces the user has.
//
// Returns hits enriched with workspace_id + title + accent so the
// client can render a badge per hit and deep-link to the right
// workspace.

const MIN_QUERY = 2;
const PER_SURFACE = 12;

export type GlobalSearchHit = {
  kind: "message" | "note" | "task" | "deadline" | "file";
  id: string;
  workspace_id: string;
  workspace_title: string;
  workspace_accent: string;
  title: string;
  snippet: string;
  meta: string;
  ts: string;
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
  const raw = (url.searchParams.get("q") ?? "").trim();
  if (raw.length < MIN_QUERY) return Response.json({ ok: true, q: raw, results: [] });

  // Active workspaces only — archived ones intentionally fall silent
  // from global search the same way they do from the calendar/digest.
  const { data: memberships } = await sb.from("workspace_members").select("workspace_id").eq("user_id", userId);
  const allWsIds = (memberships ?? []).map((m) => (m as { workspace_id: string }).workspace_id);
  if (allWsIds.length === 0) return Response.json({ ok: true, q: raw, results: [] });

  const { data: ws } = await sb.from("workspaces").select("id, title, accent, archived_at").in("id", allWsIds);
  const meta = new Map<string, { title: string; accent: string }>();
  const activeIds: string[] = [];
  for (const r of ws ?? []) {
    const row = r as { id: string; title: string; accent: string; archived_at: string | null };
    if (row.archived_at) continue;
    meta.set(row.id, { title: row.title, accent: row.accent });
    activeIds.push(row.id);
  }
  if (activeIds.length === 0) return Response.json({ ok: true, q: raw, results: [] });

  const safe = raw.replace(/([%_])/g, "\\$1");
  const pat = `%${safe}%`;

  const [msgRes, docRes, taskRes, dlRes, fileRes] = await Promise.all([
    sb.from("workspace_messages").select("id, workspace_id, body, author_name, created_at").in("workspace_id", activeIds).ilike("body", pat).order("created_at", { ascending: false }).limit(PER_SURFACE),
    sb.from("workspace_docs").select("id, workspace_id, title, body, updated_at").in("workspace_id", activeIds).or(`title.ilike.${pat},body.ilike.${pat}`).order("updated_at", { ascending: false }).limit(PER_SURFACE),
    sb.from("workspace_tasks").select("id, workspace_id, title, detail, status, updated_at").in("workspace_id", activeIds).or(`title.ilike.${pat},detail.ilike.${pat}`).order("updated_at", { ascending: false }).limit(PER_SURFACE),
    sb.from("workspace_deadlines").select("id, workspace_id, title, detail, due_at, status").in("workspace_id", activeIds).or(`title.ilike.${pat},detail.ilike.${pat}`).order("due_at", { ascending: false }).limit(PER_SURFACE),
    sb.from("workspace_files").select("id, workspace_id, name, content_type, uploaded_by_name, created_at").in("workspace_id", activeIds).ilike("name", pat).order("created_at", { ascending: false }).limit(PER_SURFACE),
  ]);

  const hits: GlobalSearchHit[] = [];
  const m = (id: string) => meta.get(id) ?? { title: "Workspace", accent: "emerald" };

  for (const r of msgRes.data ?? []) {
    const row = r as { id: string; workspace_id: string; body: string; author_name: string | null; created_at: string };
    const wm = m(row.workspace_id);
    hits.push({ kind: "message", id: row.id, workspace_id: row.workspace_id, workspace_title: wm.title, workspace_accent: wm.accent, title: `${row.author_name ?? "Member"}`, snippet: snippet(row.body, raw), meta: new Date(row.created_at).toLocaleString(), ts: row.created_at });
  }
  for (const r of docRes.data ?? []) {
    const row = r as { id: string; workspace_id: string; title: string; body: string; updated_at: string };
    const wm = m(row.workspace_id);
    hits.push({ kind: "note", id: row.id, workspace_id: row.workspace_id, workspace_title: wm.title, workspace_accent: wm.accent, title: row.title || "Untitled note", snippet: snippet(row.body, raw) || row.title, meta: `Note · updated ${new Date(row.updated_at).toLocaleDateString()}`, ts: row.updated_at });
  }
  for (const r of taskRes.data ?? []) {
    const row = r as { id: string; workspace_id: string; title: string; detail: string; status: string; updated_at: string };
    const wm = m(row.workspace_id);
    hits.push({ kind: "task", id: row.id, workspace_id: row.workspace_id, workspace_title: wm.title, workspace_accent: wm.accent, title: row.title, snippet: snippet(row.detail, raw), meta: `Task · ${row.status}`, ts: row.updated_at });
  }
  for (const r of dlRes.data ?? []) {
    const row = r as { id: string; workspace_id: string; title: string; detail: string; due_at: string; status: string };
    const wm = m(row.workspace_id);
    hits.push({ kind: "deadline", id: row.id, workspace_id: row.workspace_id, workspace_title: wm.title, workspace_accent: wm.accent, title: row.title, snippet: snippet(row.detail, raw), meta: `Deadline · ${row.status} · ${new Date(row.due_at).toLocaleDateString()}`, ts: row.due_at });
  }
  for (const r of fileRes.data ?? []) {
    const row = r as { id: string; workspace_id: string; name: string; content_type: string; uploaded_by_name: string | null; created_at: string };
    const wm = m(row.workspace_id);
    hits.push({ kind: "file", id: row.id, workspace_id: row.workspace_id, workspace_title: wm.title, workspace_accent: wm.accent, title: row.name, snippet: `${row.content_type} · uploaded by ${row.uploaded_by_name ?? "Member"}`, meta: new Date(row.created_at).toLocaleDateString(), ts: row.created_at });
  }

  return Response.json({ ok: true, q: raw, results: hits });
}

function snippet(text: string | null | undefined, query: string): string {
  if (!text) return "";
  const lower = text.toLowerCase();
  const i = lower.indexOf(query.toLowerCase());
  if (i < 0) return text.slice(0, 120) + (text.length > 120 ? "…" : "");
  const start = Math.max(0, i - 30);
  const end = Math.min(text.length, i + query.length + 60);
  return (start > 0 ? "…" : "") + text.slice(start, end) + (end < text.length ? "…" : "");
}
