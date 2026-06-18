import { z } from "zod";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { authWorkspace, bearerToken } from "@/lib/workspace-auth";
import { parseBody } from "@/lib/parse-body";
import { pushToUser } from "@/lib/push-to-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET  — recent messages in this DM thread (must be a participant).
// POST — send a message into the thread. Body: { body }.
//        Best-effort web-push to the other participant.

const PostBody = z.object({ body: z.string().min(1).max(4000) });

async function loadThread(sb: NonNullable<ReturnType<typeof supabaseAdmin>>, workspaceId: string, threadId: string) {
  const { data } = await sb
    .from("workspace_dm_threads")
    .select("id, workspace_id, user_lo, user_hi")
    .eq("id", threadId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  return data as { id: string; workspace_id: string; user_lo: string; user_hi: string } | null;
}

function isParticipant(t: { user_lo: string; user_hi: string }, userId: string): boolean {
  return t.user_lo === userId || t.user_hi === userId;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string; tid: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id, tid } = await params;
  const me = await authWorkspace(bearerToken(req), id);
  if (!me) return Response.json({ ok: false, error: "not_a_member" }, { status: 403 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const thread = await loadThread(sb, id, tid);
  if (!thread) return Response.json({ ok: false, error: "thread_not_found" }, { status: 404 });
  if (!isParticipant(thread, me.userId)) return Response.json({ ok: false, error: "not_a_participant" }, { status: 403 });

  const { data, error } = await sb
    .from("workspace_dm_messages")
    .select("id, sender_user_id, body, created_at")
    .eq("thread_id", tid)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true, results: data ?? [] });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string; tid: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id, tid } = await params;
  const me = await authWorkspace(bearerToken(req), id);
  if (!me) return Response.json({ ok: false, error: "not_a_member" }, { status: 403 });

  const parsed = await parseBody(req, PostBody);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data.body.trim();
  if (!body) return Response.json({ ok: false, error: "empty" }, { status: 400 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const thread = await loadThread(sb, id, tid);
  if (!thread) return Response.json({ ok: false, error: "thread_not_found" }, { status: 404 });
  if (!isParticipant(thread, me.userId)) return Response.json({ ok: false, error: "not_a_participant" }, { status: 403 });

  const { data: inserted, error } = await sb
    .from("workspace_dm_messages")
    .insert({ thread_id: tid, sender_user_id: me.userId, body })
    .select("id, sender_user_id, body, created_at")
    .single();
  if (error || !inserted) return Response.json({ ok: false, error: error?.message ?? "insert_failed" }, { status: 500 });

  // Notify the other participant.
  const otherId = thread.user_lo === me.userId ? thread.user_hi : thread.user_lo;
  // Look up our cached display name so the notification reads naturally.
  const { data: myMember } = await sb
    .from("workspace_members")
    .select("display_name, email")
    .eq("workspace_id", id)
    .eq("user_id", me.userId)
    .maybeSingle();
  const myName = (myMember?.display_name as string | undefined) ?? (myMember?.email as string | undefined) ?? "Member";
  const { data: ws } = await sb.from("workspaces").select("title").eq("id", id).maybeSingle();
  const wsTitle = (ws?.title as string | undefined) ?? "a workspace";
  const href = `/studio/workspaces/${id}?dm=${tid}`;

  await sb.from("notifications").insert({
    user_id: otherId,
    kind: "mention",
    actor_name: myName,
    target_kind: "workspace",
    target_slug: id,
    title: `${myName} sent you a direct message`,
    body: `${truncate(body, 140)} — in ${wsTitle}`,
    url: href,
    read: false,
  });
  // Best-effort push (respects 'mention' category opt-out).
  await pushToUser(otherId, { title: `${myName} (DM)`, body: truncate(body, 140), url: href, tag: `wsdm:${tid}` }, { category: "mention" }).catch(() => {});

  return Response.json({ ok: true, message: inserted });
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
