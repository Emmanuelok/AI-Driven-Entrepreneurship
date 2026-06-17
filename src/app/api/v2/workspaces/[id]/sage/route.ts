import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { authWorkspace, bearerToken } from "@/lib/workspace-auth";
import { parseBodyWithRaw } from "@/lib/parse-body";
import { readSiteContext, siteSystemBlock } from "@/lib/site-brain";
import { aiGuard } from "@/lib/ai-guard";
import { buildTranscript } from "@/lib/workspace-discussion";
import { dueWindow, type DeadlineRow } from "@/lib/deadline-schedule";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Personal Sage advisor chat — one persistent thread per (workspace,
// user). GET returns the thread + every message. POST appends the
// user's turn and streams Sage's reply (non-streaming response wrapping
// the assistant's message), persisting both. DELETE wipes the thread
// so the user can start fresh.
//
// Why a separate thread (not the workspace discussion): this is a
// private back-and-forth. The user doesn't want their teammates to see
// "hey @sage how do I tell Kofi to back off from rewriting my note".
// Same workspace context for Sage; different audience.

const PostBody = z.object({ content: z.string().min(1).max(8000) }).loose();
const MAX_HISTORY = 24; // user+assistant turns retained in context
const CONTEXT_DETAIL_CHARS = 2400;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await params;
  const me = await authWorkspace(bearerToken(req), id);
  if (!me) return Response.json({ ok: false, error: "not_a_member" }, { status: 403 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const thread = await getOrCreateThread(sb, id, me.userId);
  const { data: messages } = await sb
    .from("workspace_sage_messages")
    .select("id, role, content, created_at")
    .eq("thread_id", thread.id)
    .order("created_at", { ascending: true });

  return Response.json({ ok: true, thread, messages: messages ?? [] });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await params;
  const me = await authWorkspace(bearerToken(req), id);
  if (!me) return Response.json({ ok: false, error: "not_a_member" }, { status: 403 });

  const parsed = await parseBodyWithRaw(req, PostBody);
  if (!parsed.ok) return parsed.response;
  const userText = parsed.data.content.trim();
  if (!userText) return Response.json({ ok: false, error: "empty" }, { status: 400 });

  const guard = await aiGuard({ req, scope: "workspace-sage", maxCalls: 30 });
  if (!guard.ok) return guard.response;

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const thread = await getOrCreateThread(sb, id, me.userId);

  // Persist the user's turn FIRST so a failed AI call doesn't lose it.
  const { data: userMsg, error: userErr } = await sb
    .from("workspace_sage_messages")
    .insert({ thread_id: thread.id, role: "user", content: userText })
    .select("id, role, content, created_at")
    .single();
  if (userErr || !userMsg) return Response.json({ ok: false, error: userErr?.message ?? "insert_failed" }, { status: 500 });

  // First user message becomes the thread title (for the future "list
  // of threads" surface — we already have a place to show it on the
  // header).
  if (!thread.title) {
    const titleSnippet = userText.slice(0, 80);
    await sb.from("workspace_sage_threads").update({ title: titleSnippet }).eq("id", thread.id);
    thread.title = titleSnippet;
  }

  // Load conversation history (capped) + workspace state for context.
  const [historyRes, contextStr] = await Promise.all([
    sb.from("workspace_sage_messages")
      .select("role, content")
      .eq("thread_id", thread.id)
      .order("created_at", { ascending: true })
      .limit(MAX_HISTORY + 1),
    buildWorkspaceContext(sb, id),
  ]);

  if (!guard.apiKey) {
    // Graceful degradation when no API key is configured: persist a
    // canned reply so the UI flow still works.
    const fallback = `I'd love to think this through with you, but my AI brain isn't wired up in this environment yet. Once an ANTHROPIC_API_KEY is configured I'll have the full context of "${contextStr.title}" loaded and can help properly.`;
    const { data: agentMsg } = await sb
      .from("workspace_sage_messages")
      .insert({ thread_id: thread.id, role: "assistant", content: fallback })
      .select("id, role, content, created_at")
      .single();
    return Response.json({ ok: true, userMessage: userMsg, assistantMessage: agentMsg, fallback: true });
  }

  const brain = siteSystemBlock(readSiteContext(parsed.raw));
  const systemText = `${brain}You are Sage, a mentor inside the Sankofa workspace "${contextStr.title}" (kind: ${contextStr.kind}). You are speaking PRIVATELY with one member of this team — not in the public discussion. Keep replies focused, specific to this workspace's state, and grounded in the data below. Push back on vague plans, ask sharpening questions, never invent facts. Markdown allowed. Aim for under 250 words unless the user explicitly asks for depth.

[WORKSPACE STATE]
${contextStr.state}
[/WORKSPACE STATE]`;

  // Build the conversation history for Anthropic. Drop the just-inserted
  // user message from history (we'll add it last for clarity).
  const history = (historyRes.data ?? []) as Array<{ role: "user" | "assistant"; content: string }>;
  // Trim oldest if over the cap.
  const trimmed = history.length > MAX_HISTORY ? history.slice(history.length - MAX_HISTORY) : history;

  try {
    const client = new Anthropic({ apiKey: guard.apiKey });
    const res = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1100,
      system: [{ type: "text", text: systemText, cache_control: { type: "ephemeral" } }],
      messages: trimmed.map((m) => ({ role: m.role, content: m.content })),
    });
    const reply = res.content.filter((c) => c.type === "text").map((c) => (c.type === "text" ? c.text : "")).join("").trim();
    if (!reply) return Response.json({ ok: false, error: "empty_reply" }, { status: 502 });

    const { data: agentMsg, error: agentErr } = await sb
      .from("workspace_sage_messages")
      .insert({ thread_id: thread.id, role: "assistant", content: reply })
      .select("id, role, content, created_at")
      .single();
    if (agentErr || !agentMsg) return Response.json({ ok: false, error: agentErr?.message ?? "insert_failed" }, { status: 500 });

    return Response.json({ ok: true, userMessage: userMsg, assistantMessage: agentMsg });
  } catch (e) {
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await params;
  const me = await authWorkspace(bearerToken(req), id);
  if (!me) return Response.json({ ok: false, error: "not_a_member" }, { status: 403 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  // Drop just the messages — keep the thread row so the next POST
  // doesn't have to create one.
  const { data: thread } = await sb
    .from("workspace_sage_threads")
    .select("id")
    .eq("workspace_id", id)
    .eq("user_id", me.userId)
    .maybeSingle();
  if (thread) {
    await sb.from("workspace_sage_messages").delete().eq("thread_id", thread.id);
    await sb.from("workspace_sage_threads").update({ title: "" }).eq("id", thread.id);
  }
  return Response.json({ ok: true });
}

// ── Helpers ─────────────────────────────────────────────────────────────
type Thread = { id: string; workspace_id: string; user_id: string; title: string; created_at: string; updated_at: string };

async function getOrCreateThread(sb: NonNullable<ReturnType<typeof supabaseAdmin>>, workspaceId: string, userId: string): Promise<Thread> {
  const { data: existing } = await sb
    .from("workspace_sage_threads")
    .select("id, workspace_id, user_id, title, created_at, updated_at")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (existing) return existing as Thread;
  const { data: created } = await sb
    .from("workspace_sage_threads")
    .insert({ workspace_id: workspaceId, user_id: userId })
    .select("id, workspace_id, user_id, title, created_at, updated_at")
    .single();
  return created as Thread;
}

// Pull the workspace's state into a tight context string Sage sees on
// every turn. We don't put the whole history in — the system prompt
// would balloon — just enough recent state to keep advice grounded.
async function buildWorkspaceContext(sb: NonNullable<ReturnType<typeof supabaseAdmin>>, workspaceId: string): Promise<{ title: string; kind: string; state: string }> {
  const now = Date.now();
  const [wsRes, msgRes, docRes, deadlineRes, taskRes] = await Promise.all([
    sb.from("workspaces").select("title, kind, description").eq("id", workspaceId).maybeSingle(),
    sb.from("workspace_messages").select("author_name, is_agent, body").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(15),
    sb.from("workspace_docs").select("title, body").eq("workspace_id", workspaceId).order("updated_at", { ascending: false }).limit(5),
    sb.from("workspace_deadlines").select("id, workspace_id, assignee_user_id, title, due_at, status, set_by_role, last_reminded_at").eq("workspace_id", workspaceId).eq("status", "open").order("due_at", { ascending: true }).limit(20),
    sb.from("workspace_tasks").select("title, status, assignee_name").eq("workspace_id", workspaceId).order("position", { ascending: true }).limit(40),
  ]);

  const ws = wsRes.data as { title: string; kind: string; description: string | null } | null;
  const transcript = buildTranscript(((msgRes.data ?? []).reverse()) as { author_name: string | null; is_agent: boolean; body: string }[], CONTEXT_DETAIL_CHARS);
  const notesBlock = (docRes.data ?? []).map((d) => `### ${(d as { title: string }).title}\n${((d as { body: string }).body).slice(0, 700)}`).join("\n\n").slice(0, CONTEXT_DETAIL_CHARS);
  const deadlineBlock = (deadlineRes.data ?? []).map((d) => {
    const row = d as DeadlineRow;
    const w = dueWindow(row, now);
    return `- ${row.title} (due ${new Date(row.due_at).toUTCString()}; set by ${row.set_by_role}${w ? `; ${w}` : ""})`;
  }).join("\n");
  const taskRows = (taskRes.data ?? []) as Array<{ title: string; status: string; assignee_name: string | null }>;
  const taskBlock = (["todo", "doing", "blocked", "done"] as const)
    .map((s) => {
      const items = taskRows.filter((t) => t.status === s);
      if (items.length === 0) return "";
      return `${s.toUpperCase()} (${items.length}): ${items.slice(0, 12).map((t) => `${t.title}${t.assignee_name ? ` [${t.assignee_name}]` : ""}`).join("; ")}`;
    })
    .filter(Boolean)
    .join("\n");

  const state = [
    ws?.description ? `Description: ${ws.description}` : "",
    transcript ? `Recent discussion:\n${transcript}` : "",
    notesBlock ? `Shared notes:\n${notesBlock}` : "",
    deadlineBlock ? `Open deadlines:\n${deadlineBlock}` : "",
    taskBlock ? `Task board:\n${taskBlock}` : "",
  ].filter(Boolean).join("\n\n");

  return { title: ws?.title ?? "this workspace", kind: ws?.kind ?? "generic", state: state || "(empty workspace)" };
}
