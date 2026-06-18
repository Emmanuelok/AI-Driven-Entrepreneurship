import { z } from "zod";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { authWorkspace, bearerToken } from "@/lib/workspace-auth";
import { parseBody } from "@/lib/parse-body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST — advance the caller's read watermark for this DM thread. Body:
//        { at?: ISO } (defaults to now). Monotonic — a stale client
//        can't roll the watermark backward. Caller must be a
//        participant in the thread.

const PostBody = z.object({ at: z.string().min(10).max(40).optional() });

export async function POST(req: Request, { params }: { params: Promise<{ id: string; tid: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id, tid } = await params;
  const me = await authWorkspace(bearerToken(req), id);
  if (!me) return Response.json({ ok: false, error: "not_a_member" }, { status: 403 });

  const parsed = await parseBody(req, PostBody);
  if (!parsed.ok) return parsed.response;

  let at: string;
  if (parsed.data.at) {
    const d = new Date(parsed.data.at);
    if (isNaN(d.getTime())) return Response.json({ ok: false, error: "invalid_at" }, { status: 400 });
    at = d.toISOString();
  } else {
    at = new Date().toISOString();
  }

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  // Confirm participation before writing a watermark for this thread.
  const { data: thread } = await sb
    .from("workspace_dm_threads")
    .select("user_lo, user_hi")
    .eq("id", tid)
    .eq("workspace_id", id)
    .maybeSingle();
  if (!thread) return Response.json({ ok: false, error: "thread_not_found" }, { status: 404 });
  if (thread.user_lo !== me.userId && thread.user_hi !== me.userId) {
    return Response.json({ ok: false, error: "not_a_participant" }, { status: 403 });
  }

  // Monotonic guard.
  const { data: existing } = await sb
    .from("workspace_dm_reads")
    .select("last_read_at")
    .eq("thread_id", tid)
    .eq("user_id", me.userId)
    .maybeSingle();
  if (existing && new Date(existing.last_read_at as string).getTime() >= new Date(at).getTime()) {
    return Response.json({ ok: true, noop: true });
  }

  const { error } = await sb
    .from("workspace_dm_reads")
    .upsert({ thread_id: tid, user_id: me.userId, last_read_at: at }, { onConflict: "thread_id,user_id" });
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
