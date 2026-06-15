import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { authWorkspace, bearerToken } from "@/lib/workspace-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET ?q=<query> — search across the workspace's five collaboration
// surfaces (discussion, notes, tasks, deadlines, files) for any member.
// Returns up to 8 hits per surface, ranked newest-first within each.
// Substring + case-insensitive; cheap enough at workspace scale and
// trivially upgradable to tsvector if we ever need it.

const MIN_QUERY = 2;
const PER_SURFACE = 8;

export type SearchHit = {
  kind: "message" | "note" | "task" | "deadline" | "file";
  id: string;
  title: string;
  snippet: string;
  meta: string;
  ts: string;
};

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await params;
  const me = await authWorkspace(bearerToken(req), id);
  if (!me) return Response.json({ ok: false, error: "not_a_member" }, { status: 403 });

  const url = new URL(req.url);
  const raw = (url.searchParams.get("q") ?? "").trim();
  if (raw.length < MIN_QUERY) return Response.json({ ok: true, q: raw, results: [] });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  // ILIKE pattern — escape % and _ in the user input so a query like
  // "100%" doesn't blow up to a no-op match-all.
  const safe = raw.replace(/([%_])/g, "\\$1");
  const pat = `%${safe}%`;

  const [msgRes, docRes, taskRes, dlRes, fileRes] = await Promise.all([
    sb.from("workspace_messages").select("id, body, author_name, created_at").eq("workspace_id", id).ilike("body", pat).order("created_at", { ascending: false }).limit(PER_SURFACE),
    sb.from("workspace_docs").select("id, title, body, updated_at").eq("workspace_id", id).or(`title.ilike.${pat},body.ilike.${pat}`).order("updated_at", { ascending: false }).limit(PER_SURFACE),
    sb.from("workspace_tasks").select("id, title, detail, status, updated_at").eq("workspace_id", id).or(`title.ilike.${pat},detail.ilike.${pat}`).order("updated_at", { ascending: false }).limit(PER_SURFACE),
    sb.from("workspace_deadlines").select("id, title, detail, due_at, status").eq("workspace_id", id).or(`title.ilike.${pat},detail.ilike.${pat}`).order("due_at", { ascending: false }).limit(PER_SURFACE),
    sb.from("workspace_files").select("id, name, content_type, uploaded_by_name, created_at").eq("workspace_id", id).ilike("name", pat).order("created_at", { ascending: false }).limit(PER_SURFACE),
  ]);

  const hits: SearchHit[] = [];

  for (const m of msgRes.data ?? []) {
    const row = m as { id: string; body: string; author_name: string | null; created_at: string };
    hits.push({ kind: "message", id: row.id, title: `Discussion · ${row.author_name ?? "Member"}`, snippet: snippet(row.body, raw), meta: new Date(row.created_at).toLocaleString(), ts: row.created_at });
  }
  for (const d of docRes.data ?? []) {
    const row = d as { id: string; title: string; body: string; updated_at: string };
    const sn = snippet(row.body, raw) || row.title;
    hits.push({ kind: "note", id: row.id, title: row.title || "Untitled note", snippet: sn, meta: `Note · updated ${new Date(row.updated_at).toLocaleDateString()}`, ts: row.updated_at });
  }
  for (const t of taskRes.data ?? []) {
    const row = t as { id: string; title: string; detail: string; status: string; updated_at: string };
    hits.push({ kind: "task", id: row.id, title: row.title, snippet: snippet(row.detail, raw), meta: `Task · ${row.status}`, ts: row.updated_at });
  }
  for (const d of dlRes.data ?? []) {
    const row = d as { id: string; title: string; detail: string; due_at: string; status: string };
    hits.push({ kind: "deadline", id: row.id, title: row.title, snippet: snippet(row.detail, raw), meta: `Deadline · ${row.status} · ${new Date(row.due_at).toLocaleDateString()}`, ts: row.due_at });
  }
  for (const f of fileRes.data ?? []) {
    const row = f as { id: string; name: string; content_type: string; uploaded_by_name: string | null; created_at: string };
    hits.push({ kind: "file", id: row.id, title: row.name, snippet: `${row.content_type} · uploaded by ${row.uploaded_by_name ?? "Member"}`, meta: new Date(row.created_at).toLocaleDateString(), ts: row.created_at });
  }

  return Response.json({ ok: true, q: raw, results: hits });
}

// Surround the first match with up to 60 chars context, ellipsing as
// needed. Returns "" when text is null/empty so the UI can fall back.
function snippet(text: string | null | undefined, query: string): string {
  if (!text) return "";
  const lower = text.toLowerCase();
  const i = lower.indexOf(query.toLowerCase());
  if (i < 0) return text.slice(0, 120) + (text.length > 120 ? "…" : "");
  const start = Math.max(0, i - 30);
  const end = Math.min(text.length, i + query.length + 60);
  return (start > 0 ? "…" : "") + text.slice(start, end) + (end < text.length ? "…" : "");
}
