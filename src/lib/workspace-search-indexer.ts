import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { embed } from "@/lib/embeddings";

// Workspace-scoped indexer. Mirrors public-search-indexer.ts in shape
// so the write-path wiring feels familiar to anyone who's read the
// other module. The body-composition functions are pure (no DB,
// testable) and the upsert + delete helpers are best-effort: indexer
// failures never block the calling write.

export type IndexableWorkspaceMessage = {
  id: string;
  workspace_id: string;
  body: string;
  author_name: string | null;
  is_agent: boolean;
  created_at: string;
};

export type IndexableWorkspaceDoc = {
  id: string;
  workspace_id: string;
  title: string;
  body: string;
  updated_at: string;
};

export type IndexableWorkspaceTask = {
  id: string;
  workspace_id: string;
  title: string;
  detail: string;
  status: string;
  assignee_name: string | null;
};

export type IndexableWorkspaceDeadline = {
  id: string;
  workspace_id: string;
  title: string;
  detail: string;
  due_at: string;
  status: string;
  set_by_role: string | null;
};

// ─── Pure body composers ────────────────────────────────────────────
//
// Each kind composes a small string that's BOTH the embedded text AND
// what gets shown verbatim in citations. We weave context in (author,
// status, etc.) so a kNN over "what did Achieng decide last week?"
// surfaces messages where Achieng was an author even if the words
// don't appear in the body.

export function composeMessageBody(m: IndexableWorkspaceMessage): string {
  const who = m.is_agent ? "Sage" : (m.author_name || "Member");
  return `${who} said: ${(m.body || "").replace(/\s+/g, " ").trim()}`;
}

export function composeDocBody(d: IndexableWorkspaceDoc): string {
  const parts = [
    d.title && `Doc: ${d.title}`,
    (d.body || "").replace(/\s+/g, " ").trim(),
  ].filter(Boolean);
  return parts.join("\n");
}

export function composeTaskBody(t: IndexableWorkspaceTask): string {
  const parts = [
    `Task: ${t.title}`,
    t.status && `status: ${t.status}`,
    t.assignee_name && `assigned to ${t.assignee_name}`,
    t.detail,
  ].filter(Boolean);
  return parts.join(" · ");
}

export function composeDeadlineBody(d: IndexableWorkspaceDeadline): string {
  const parts = [
    `Deadline: ${d.title}`,
    d.set_by_role && `set by ${d.set_by_role}`,
    d.due_at && `due ${d.due_at.slice(0, 10)}`,
    d.status && `status: ${d.status}`,
    d.detail,
  ].filter(Boolean);
  return parts.join(" · ");
}

// ─── Upsert helpers ────────────────────────────────────────────────
//
// Each one is best-effort. We swallow errors so a slow embed call or a
// transient pgvector hiccup can't fail the calling workspace write.
// The caller never awaits these — they fire-and-forget via void.

async function upsertRow(args: {
  workspace_id: string;
  kind: "message" | "doc" | "task" | "deadline";
  ref_id: string;
  ref_url: string;
  title: string;
  body: string;
}): Promise<void> {
  if (!isSupabaseConfigured()) return;
  if (!args.body || args.body.trim().length < 3) return; // skip tiny content
  const sb = supabaseAdmin();
  if (!sb) return;
  try {
    const [vec] = await embed([args.body]);
    await sb.from("workspace_search_index").upsert(
      {
        workspace_id: args.workspace_id,
        kind: args.kind,
        ref_id: args.ref_id,
        ref_url: args.ref_url,
        title: args.title,
        body: args.body,
        embedding: vec ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "workspace_id,kind,ref_id" },
    );
  } catch {
    // Indexer is best-effort.
  }
}

export async function indexWorkspaceMessage(m: IndexableWorkspaceMessage): Promise<void> {
  if (m.is_agent) return; // skip Sage's own replies — no recursive embed
  await upsertRow({
    workspace_id: m.workspace_id,
    kind: "message",
    ref_id: m.id,
    ref_url: `/studio/workspaces/${m.workspace_id}?tab=discussion`,
    title: composeMessageTitle(m),
    body: composeMessageBody(m),
  });
}

export async function indexWorkspaceDoc(d: IndexableWorkspaceDoc): Promise<void> {
  await upsertRow({
    workspace_id: d.workspace_id,
    kind: "doc",
    ref_id: d.id,
    ref_url: `/studio/workspaces/${d.workspace_id}?tab=notes`,
    title: d.title || "Untitled doc",
    body: composeDocBody(d),
  });
}

export async function indexWorkspaceTask(t: IndexableWorkspaceTask): Promise<void> {
  await upsertRow({
    workspace_id: t.workspace_id,
    kind: "task",
    ref_id: t.id,
    ref_url: `/studio/workspaces/${t.workspace_id}?tab=tasks`,
    title: t.title || "Untitled task",
    body: composeTaskBody(t),
  });
}

export async function indexWorkspaceDeadline(d: IndexableWorkspaceDeadline): Promise<void> {
  await upsertRow({
    workspace_id: d.workspace_id,
    kind: "deadline",
    ref_id: d.id,
    ref_url: `/studio/workspaces/${d.workspace_id}`,
    title: d.title || "Deadline",
    body: composeDeadlineBody(d),
  });
}

// Compose a sensible title for a message row. Messages don't have
// titles natively; we synthesize one from author + first ~80 chars.
function composeMessageTitle(m: IndexableWorkspaceMessage): string {
  const who = m.is_agent ? "Sage" : (m.author_name || "Member");
  const snippet = (m.body || "").replace(/\s+/g, " ").trim().slice(0, 80);
  return `${who}: ${snippet}${m.body.length > 80 ? "…" : ""}`;
}

// Remove one row from the index by kind + ref_id. Used by the delete
// paths so a removed message/doc/task doesn't keep surfacing in Sage.
export async function unindexWorkspaceRow(workspaceId: string, kind: "message" | "doc" | "task" | "deadline", refId: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const sb = supabaseAdmin();
  if (!sb) return;
  try {
    await sb.from("workspace_search_index").delete()
      .eq("workspace_id", workspaceId)
      .eq("kind", kind)
      .eq("ref_id", refId);
  } catch { /* silent */ }
}

// Full reindex for a workspace — pulls every indexable row and
// re-upserts. Used by /api/v2/workspaces/[id]/search/reindex (admin
// gated) so a body-composition change can be backfilled without
// schema changes.
export async function reindexWorkspace(workspaceId: string): Promise<{
  ok: boolean;
  counts: { messages: number; docs: number; tasks: number; deadlines: number };
}> {
  if (!isSupabaseConfigured()) return { ok: false, counts: { messages: 0, docs: 0, tasks: 0, deadlines: 0 } };
  const sb = supabaseAdmin();
  if (!sb) return { ok: false, counts: { messages: 0, docs: 0, tasks: 0, deadlines: 0 } };
  let messages = 0, docs = 0, tasks = 0, deadlines = 0;

  // Pull each kind in batches so a huge workspace doesn't OOM.
  // Caps mirror what Sage's context loader uses — anything older or
  // beyond is unlikely to be relevant.
  const [msgRes, docRes, taskRes, dlRes] = await Promise.all([
    sb.from("workspace_messages")
      .select("id, workspace_id, body, author_name, is_agent, created_at")
      .eq("workspace_id", workspaceId)
      .eq("is_agent", false)
      .order("created_at", { ascending: false })
      .limit(2000),
    sb.from("workspace_docs")
      .select("id, workspace_id, title, body, updated_at")
      .eq("workspace_id", workspaceId)
      .limit(500),
    sb.from("workspace_tasks")
      .select("id, workspace_id, title, detail, status, assignee_name")
      .eq("workspace_id", workspaceId)
      .limit(500),
    sb.from("workspace_deadlines")
      .select("id, workspace_id, title, detail, due_at, status, set_by_role")
      .eq("workspace_id", workspaceId)
      .limit(500),
  ]);

  for (const m of (msgRes.data ?? []) as IndexableWorkspaceMessage[]) {
    await indexWorkspaceMessage(m);
    messages++;
  }
  for (const d of (docRes.data ?? []) as IndexableWorkspaceDoc[]) {
    await indexWorkspaceDoc(d);
    docs++;
  }
  for (const t of (taskRes.data ?? []) as IndexableWorkspaceTask[]) {
    await indexWorkspaceTask(t);
    tasks++;
  }
  for (const d of (dlRes.data ?? []) as IndexableWorkspaceDeadline[]) {
    await indexWorkspaceDeadline(d);
    deadlines++;
  }
  return { ok: true, counts: { messages, docs, tasks, deadlines } };
}
