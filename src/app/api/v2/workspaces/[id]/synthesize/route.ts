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

// POST — "State of the workspace" synthesis. Sage reads the recent
// discussion, the shared notes, and the open deadlines, and produces a
// concise status brief: where the team is, what's at risk, and the 3
// highest-leverage next moves. Optionally posts the brief into the
// discussion so the whole team sees it (body.postToDiscussion).
//
// This is the workspace's "automate everything" move — it turns
// scattered collaboration into one actionable read.

const Body = z.object({ postToDiscussion: z.boolean().optional() }).loose();

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await params;
  const me = await authWorkspace(bearerToken(req), id);
  if (!me) return Response.json({ ok: false, error: "not_a_member" }, { status: 403 });

  const parsed = await parseBodyWithRaw(req, Body);
  if (!parsed.ok) return parsed.response;

  const guard = await aiGuard({ req, scope: "workspace-synth", maxCalls: 20 });
  if (!guard.ok) return guard.response;

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  // Gather the three content streams in parallel.
  const now = Date.now();
  const [wsRes, msgRes, docRes, deadlineRes, taskRes] = await Promise.all([
    sb.from("workspaces").select("title, kind, description").eq("id", id).maybeSingle(),
    sb.from("workspace_messages").select("author_name, is_agent, body").eq("workspace_id", id).order("created_at", { ascending: false }).limit(25),
    sb.from("workspace_docs").select("title, body").eq("workspace_id", id).order("updated_at", { ascending: false }).limit(8),
    sb.from("workspace_deadlines").select("id, workspace_id, assignee_user_id, title, due_at, status, set_by_role, last_reminded_at").eq("workspace_id", id).eq("status", "open").order("due_at", { ascending: true }).limit(40),
    sb.from("workspace_tasks").select("title, status, assignee_name").eq("workspace_id", id).order("position", { ascending: true }).limit(80),
  ]);

  const ws = wsRes.data;
  if (!ws) return Response.json({ ok: false, error: "not_found" }, { status: 404 });

  const transcript = buildTranscript(((msgRes.data ?? []).reverse()) as { author_name: string | null; is_agent: boolean; body: string }[], 3000);
  const notesBlock = (docRes.data ?? [])
    .map((d) => `### ${d.title}\n${(d.body as string).slice(0, 800)}`)
    .join("\n\n")
    .slice(0, 4000);
  const deadlineBlock = (deadlineRes.data ?? [])
    .map((d) => {
      const w = dueWindow(d as DeadlineRow, now);
      return `- ${d.title} (due ${new Date(d.due_at as string).toUTCString()}; set by ${d.set_by_role}${w ? `; ${w}` : ""})`;
    })
    .join("\n");
  const taskRows = taskRes.data ?? [];
  const taskBlock = taskRows.length === 0
    ? ""
    : (["todo", "doing", "blocked", "done"] as const)
        .map((s) => {
          const items = taskRows.filter((t) => (t as { status: string }).status === s);
          if (items.length === 0) return "";
          return `${s.toUpperCase()} (${items.length}): ${items.slice(0, 12).map((t) => `${(t as { title: string }).title}${(t as { assignee_name: string | null }).assignee_name ? ` [${(t as { assignee_name: string }).assignee_name}]` : ""}`).join("; ")}`;
        })
        .filter(Boolean)
        .join("\n");

  // No content at all → return a friendly nudge rather than an empty brief.
  if (!transcript && !notesBlock && !deadlineBlock && !taskBlock) {
    const brief = `**${ws.title}** is just getting started.\n\nThere's no discussion, no notes, and no deadlines yet — so there's nothing for me to synthesize. The fastest way to give this workspace a heartbeat: set one deadline you can hit this week, drop a note with what you're trying to do, and say hello in the discussion. I'll have plenty to work with next time.`;
    return Response.json({ ok: true, brief, generatedAt: now, empty: true });
  }

  if (!guard.apiKey) {
    const brief = `**${ws.title} — status**\n\n${deadlineBlock ? `**Open deadlines**\n${deadlineBlock}\n\n` : ""}${notesBlock ? "There are shared notes in progress. " : ""}${transcript ? "The discussion is active. " : ""}\n\n_AI synthesis needs an API key in this environment; this is a basic roll-up._`;
    return Response.json({ ok: true, brief, generatedAt: now, fallback: true });
  }

  const brain = siteSystemBlock(readSiteContext(parsed.raw));
  const client = new Anthropic({ apiKey: guard.apiKey });
  try {
    const res = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1100,
      system: [
        {
          type: "text",
          text: `${brain}You are Sage, synthesizing the state of a collaborative ${ws.kind.replace(/_/g, " ")} called "${ws.title}". Read the discussion, notes, and deadlines, then write a tight status brief with exactly these sections (markdown headers):

## Where it stands
2–4 sentences. What is this team actually doing, and how far along are they? Be concrete, cite specifics from the material.

## What's at risk
1–3 bullets. Quiet deadlines, unanswered questions in the discussion, notes that contradict the plan. If nothing's at risk, say so honestly in one line.

## Next 3 moves
A numbered list of exactly three high-leverage actions, each one sentence, each assignable to a person today.

Total under 260 words. No preamble, no "Here is the brief". Start with the first header.`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `WORKSPACE: ${ws.title}${ws.description ? ` — ${ws.description}` : ""}

RECENT DISCUSSION:
${transcript || "(none)"}

SHARED NOTES:
${notesBlock || "(none)"}

OPEN DEADLINES:
${deadlineBlock || "(none)"}

TASK BOARD:
${taskBlock || "(none)"}`,
        },
      ],
    });
    const brief = res.content.filter((c) => c.type === "text").map((c) => (c.type === "text" ? c.text : "")).join("").trim();
    if (!brief) return Response.json({ ok: false, error: "empty_synthesis" }, { status: 502 });

    // Optionally post the brief into the discussion as an agent message.
    if (parsed.data.postToDiscussion) {
      await sb.from("workspace_messages").insert({
        workspace_id: id,
        user_id: null,
        author_name: "Sage",
        body: `**📋 State of the workspace**\n\n${brief}`,
        is_agent: true,
        mentions: [],
      });
    }

    return Response.json({ ok: true, brief, generatedAt: now });
  } catch (e) {
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
