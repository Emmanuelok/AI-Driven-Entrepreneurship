import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { authWorkspace, bearerToken } from "@/lib/workspace-auth";
import { parseBodyWithRaw } from "@/lib/parse-body";
import { resolveMentions } from "@/lib/mentions";
import { summonsSage, buildTranscript } from "@/lib/workspace-discussion";
import { readSiteContext, siteSystemBlock } from "@/lib/site-brain";
import { aiGuard } from "@/lib/ai-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET  — recent messages for a workspace (any member). ?before=<iso>
//        paginates older. Returns newest-last for direct rendering.
// POST  — send a message. Body: { body }. If it @mentions members, we
//        notify them. If it @sage, Sage generates a reply and posts it
//        as an agent message in the same thread (returned inline so the
//        sender sees it immediately; realtime delivers it to peers).

const PostBody = z.object({ body: z.string().min(1).max(4000) }).loose();

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await params;
  const me = await authWorkspace(bearerToken(req), id);
  if (!me) return Response.json({ ok: false, error: "not_a_member" }, { status: 403 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const url = new URL(req.url);
  const before = url.searchParams.get("before");
  let q = sb
    .from("workspace_messages")
    .select("id, workspace_id, user_id, author_name, body, is_agent, mentions, created_at")
    .eq("workspace_id", id)
    .order("created_at", { ascending: false })
    .limit(60);
  if (before) q = q.lt("created_at", before);

  const { data, error } = await q;
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  const messages = (data ?? []).reverse();

  // Enrich with reactions in one batch query — much cheaper than N+1.
  // Each message gets { emoji, count, mine } chips that the client can
  // render directly.
  const ids = messages.map((m) => (m as { id: string }).id);
  const reactionsByMessage = new Map<string, { emoji: string; count: number; mine: boolean }[]>();
  if (ids.length > 0) {
    const { data: reactions } = await sb
      .from("workspace_message_reactions")
      .select("message_id, emoji, user_id")
      .in("message_id", ids);
    // Group: messageId → emoji → { count, mineFlag }.
    const grouped = new Map<string, Map<string, { count: number; mine: boolean }>>();
    for (const r of reactions ?? []) {
      const row = r as { message_id: string; emoji: string; user_id: string };
      const perMsg = grouped.get(row.message_id) ?? new Map<string, { count: number; mine: boolean }>();
      const cur = perMsg.get(row.emoji) ?? { count: 0, mine: false };
      cur.count++;
      if (row.user_id === me.userId) cur.mine = true;
      perMsg.set(row.emoji, cur);
      grouped.set(row.message_id, perMsg);
    }
    for (const [mid, m] of grouped) {
      reactionsByMessage.set(mid, Array.from(m.entries()).map(([emoji, v]) => ({ emoji, ...v })));
    }
  }

  return Response.json({
    ok: true,
    results: messages.map((m) => {
      const row = m as { id: string };
      return { ...row, reactions: reactionsByMessage.get(row.id) ?? [] };
    }),
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await params;
  const me = await authWorkspace(bearerToken(req), id);
  if (!me) return Response.json({ ok: false, error: "not_a_member" }, { status: 403 });

  const parsed = await parseBodyWithRaw(req, PostBody);
  if (!parsed.ok) return parsed.response;
  const text = parsed.data.body.trim();
  if (!text) return Response.json({ ok: false, error: "empty" }, { status: 400 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  // Resolve member mentions against the roster (for notifications +
  // mention highlighting). Sage is not a member, so @sage never lands
  // here — it's handled separately below.
  const { data: roster } = await sb
    .from("workspace_members")
    .select("user_id, display_name, email")
    .eq("workspace_id", id);
  const { userIds: mentionedUsers, tokens } = resolveMentions(text, (roster ?? []) as { user_id: string; display_name: string | null; email: string | null }[]);

  const authorName = (await displayNameFor(sb, me.userId)) ?? me.email ?? "Member";

  const { data: inserted, error } = await sb
    .from("workspace_messages")
    .insert({
      workspace_id: id,
      user_id: me.userId,
      author_name: authorName,
      body: text,
      is_agent: false,
      mentions: tokens,
    })
    .select("id, workspace_id, user_id, author_name, body, is_agent, mentions, created_at")
    .single();
  if (error || !inserted) return Response.json({ ok: false, error: error?.message ?? "insert_failed" }, { status: 500 });

  // Notify mentioned members (excluding the author).
  const wsTitle = await workspaceTitle(sb, id);
  for (const uid of mentionedUsers) {
    if (uid === me.userId) continue;
    await sb.from("notifications").insert({
      user_id: uid,
      kind: "comment",
      actor_name: authorName,
      target_kind: "workspace",
      target_slug: id,
      title: `${authorName} mentioned you in ${wsTitle}`,
      body: text.slice(0, 160),
      url: `/studio/workspaces/${id}`,
      read: false,
    });
  }

  // Sage participation: if summoned, generate a reply and post it as an
  // agent message. Best-effort — if the AI call fails the user's
  // message still stands.
  let agentReply: typeof inserted | null = null;
  if (summonsSage(text)) {
    agentReply = await replyAsSage(req, sb, id, wsTitle, parsed.raw);
  }

  await sb.from("workspace_activity").insert({
    workspace_id: id,
    user_id: me.userId,
    kind: "comment",
    title: `${authorName} posted in discussion`,
    body: text.slice(0, 120),
  });

  return Response.json({ ok: true, message: inserted, agentReply });
}

// ── Sage reply ────────────────────────────────────────────────────────
async function replyAsSage(
  req: Request,
  sb: NonNullable<ReturnType<typeof supabaseAdmin>>,
  workspaceId: string,
  wsTitle: string,
  rawBody: unknown,
): Promise<{ id: string; workspace_id: string; user_id: string | null; author_name: string | null; body: string; is_agent: boolean; mentions: string[]; created_at: string } | null> {
  const guard = await aiGuard({ req, scope: "workspace-discuss", maxCalls: 30 });
  if (!guard.ok || !guard.apiKey) {
    return await postAgentMessage(sb, workspaceId, "I'm here, but my AI brain isn't wired up in this environment yet. Once an API key is configured I'll join the conversation properly.");
  }

  // Pull recent context for the model.
  const { data: recent } = await sb
    .from("workspace_messages")
    .select("author_name, is_agent, body")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(14);
  const transcript = buildTranscript(((recent ?? []).reverse()) as { author_name: string | null; is_agent: boolean; body: string }[]);
  const brain = siteSystemBlock(readSiteContext(rawBody));

  try {
    const client = new Anthropic({ apiKey: guard.apiKey });
    const res = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 700,
      system: [
        {
          type: "text",
          text: `${brain}You are Sage, a mentor participating in a collaborative workspace discussion in "${wsTitle}". A member summoned you with @sage. Reply as a thoughtful participant in the thread — not a chatbot. Be concise (≤ 140 words), specific to what was actually said, and end with either a concrete suggestion or a sharpening question. Markdown allowed. Never restate the whole thread back to them.`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        { role: "user", content: `Here is the recent discussion:\n\n${transcript}\n\nReply to the latest message as Sage.` },
      ],
    });
    const replyText = res.content.filter((c) => c.type === "text").map((c) => (c.type === "text" ? c.text : "")).join("").trim();
    if (!replyText) return null;
    return await postAgentMessage(sb, workspaceId, replyText);
  } catch {
    return null;
  }
}

async function postAgentMessage(
  sb: NonNullable<ReturnType<typeof supabaseAdmin>>,
  workspaceId: string,
  body: string,
) {
  const { data } = await sb
    .from("workspace_messages")
    .insert({ workspace_id: workspaceId, user_id: null, author_name: "Sage", body, is_agent: true, mentions: [] })
    .select("id, workspace_id, user_id, author_name, body, is_agent, mentions, created_at")
    .single();
  return data ?? null;
}

// ── helpers ─────────────────────────────────────────────────────────────
async function displayNameFor(sb: NonNullable<ReturnType<typeof supabaseAdmin>>, userId: string): Promise<string | null> {
  const { data } = await sb.auth.admin.getUserById(userId);
  return (data?.user?.user_metadata as { name?: string } | null)?.name ?? null;
}

async function workspaceTitle(sb: NonNullable<ReturnType<typeof supabaseAdmin>>, id: string): Promise<string> {
  const { data } = await sb.from("workspaces").select("title").eq("id", id).maybeSingle();
  return (data?.title as string | undefined) ?? "a workspace";
}
