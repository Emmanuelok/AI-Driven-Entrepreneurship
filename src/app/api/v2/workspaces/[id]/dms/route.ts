import { z } from "zod";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { authWorkspace, bearerToken } from "@/lib/workspace-auth";
import { parseBody } from "@/lib/parse-body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET   — list every DM thread the caller is in for this workspace,
//          newest-updated first, with the other participant's
//          display name + the last message preview.
// POST  — open (or find) a thread with another member.
//          Body: { withUserId }. Idempotent — the (workspace, lo, hi)
//          uniqueness guarantees one thread per pair.

const PostBody = z.object({ withUserId: z.string().min(1).max(64) });

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await params;
  const me = await authWorkspace(bearerToken(req), id);
  if (!me) return Response.json({ ok: false, error: "not_a_member" }, { status: 403 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  // Threads where I'm either lo or hi participant, scoped to this ws.
  const { data: threads } = await sb
    .from("workspace_dm_threads")
    .select("id, user_lo, user_hi, updated_at, created_at")
    .eq("workspace_id", id)
    .or(`user_lo.eq.${me.userId},user_hi.eq.${me.userId}`)
    .order("updated_at", { ascending: false })
    .limit(50);

  if (!threads || threads.length === 0) return Response.json({ ok: true, results: [] });

  // Enrich: other participant's display name + the most recent message
  // preview. Two batched queries instead of N+1.
  const otherIds = Array.from(new Set(threads.map((t) => {
    const row = t as { user_lo: string; user_hi: string };
    return row.user_lo === me.userId ? row.user_hi : row.user_lo;
  })));
  const { data: members } = await sb
    .from("workspace_members")
    .select("user_id, display_name, email")
    .eq("workspace_id", id)
    .in("user_id", otherIds);
  const nameByUser = new Map<string, string>();
  for (const m of members ?? []) {
    const row = m as { user_id: string; display_name: string | null; email: string | null };
    nameByUser.set(row.user_id, row.display_name || row.email || "Member");
  }

  // Last-message previews — one query against all the thread ids, then
  // pick the newest per thread in memory.
  const threadIds = threads.map((t) => (t as { id: string }).id);
  const { data: previews } = await sb
    .from("workspace_dm_messages")
    .select("thread_id, sender_user_id, body, created_at")
    .in("thread_id", threadIds)
    .order("created_at", { ascending: false });
  const previewByThread = new Map<string, { sender_user_id: string; body: string; created_at: string }>();
  for (const p of previews ?? []) {
    const row = p as { thread_id: string; sender_user_id: string; body: string; created_at: string };
    if (!previewByThread.has(row.thread_id)) previewByThread.set(row.thread_id, row);
  }

  // My read watermarks for these threads — drives the inbox's unread
  // badges. Threads with no watermark row count as never-read.
  const { data: reads } = await sb
    .from("workspace_dm_reads")
    .select("thread_id, last_read_at")
    .in("thread_id", threadIds)
    .eq("user_id", me.userId);
  const watermarkByThread = new Map<string, number>();
  for (const r of reads ?? []) {
    const row = r as { thread_id: string; last_read_at: string };
    watermarkByThread.set(row.thread_id, new Date(row.last_read_at).getTime());
  }

  const results = threads.map((t) => {
    const row = t as { id: string; user_lo: string; user_hi: string; updated_at: string; created_at: string };
    const otherId = row.user_lo === me.userId ? row.user_hi : row.user_lo;
    const preview = previewByThread.get(row.id);
    // Unread = the latest message in this thread is from THE OTHER
    // party AND landed after my watermark. I never have "unread" of
    // my own messages.
    const watermark = watermarkByThread.get(row.id) ?? 0;
    const lastTs = preview ? new Date(preview.created_at).getTime() : 0;
    const unread = !!preview && preview.sender_user_id !== me.userId && lastTs > watermark;
    return {
      id: row.id,
      with_user_id: otherId,
      with_name: nameByUser.get(otherId) ?? "Member",
      last_message_at: preview?.created_at ?? row.created_at,
      last_message_preview: preview ? truncate(preview.body, 100) : null,
      last_message_was_mine: preview ? preview.sender_user_id === me.userId : null,
      unread,
    };
  });

  return Response.json({ ok: true, results });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await params;
  const me = await authWorkspace(bearerToken(req), id);
  if (!me) return Response.json({ ok: false, error: "not_a_member" }, { status: 403 });

  const parsed = await parseBody(req, PostBody);
  if (!parsed.ok) return parsed.response;
  if (parsed.data.withUserId === me.userId) return Response.json({ ok: false, error: "cant_dm_yourself" }, { status: 400 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  // The other user must also be a member of this workspace — anchors
  // DMs to the workspace's roster.
  const { data: other } = await sb
    .from("workspace_members")
    .select("user_id, display_name, email")
    .eq("workspace_id", id)
    .eq("user_id", parsed.data.withUserId)
    .maybeSingle();
  if (!other) return Response.json({ ok: false, error: "not_a_workspace_member" }, { status: 404 });

  // Canonicalize the pair: lower lexical id = lo, higher = hi. The
  // CHECK constraint enforces this at the DB level too.
  const [lo, hi] = me.userId < parsed.data.withUserId
    ? [me.userId, parsed.data.withUserId]
    : [parsed.data.withUserId, me.userId];

  // Upsert: a thread for this (workspace, lo, hi) already exists or we
  // create one. Use the unique key, return the row either way.
  const { data: existing } = await sb
    .from("workspace_dm_threads")
    .select("id, created_at, updated_at")
    .eq("workspace_id", id)
    .eq("user_lo", lo)
    .eq("user_hi", hi)
    .maybeSingle();
  if (existing) {
    return Response.json({ ok: true, thread: { id: existing.id, with_user_id: parsed.data.withUserId, with_name: other.display_name || other.email || "Member" }, alreadyExisted: true });
  }

  const { data: created, error } = await sb
    .from("workspace_dm_threads")
    .insert({ workspace_id: id, user_lo: lo, user_hi: hi })
    .select("id, created_at")
    .single();
  if (error || !created) return Response.json({ ok: false, error: error?.message ?? "insert_failed" }, { status: 500 });

  return Response.json({ ok: true, thread: { id: created.id, with_user_id: parsed.data.withUserId, with_name: other.display_name || other.email || "Member" }, alreadyExisted: false });
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
