import { z } from "zod";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { authWorkspace, bearerToken } from "@/lib/workspace-auth";
import { parseBody } from "@/lib/parse-body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET  — return every member's read watermark for this workspace's
//        discussion. Used by the panel to render 'seen by N' counts on
//        messages.
// POST — set the caller's watermark. Body: { at?: ISO } — defaults to
//        now. Idempotent (upsert by composite PK).

const PostBody = z.object({ at: z.string().min(10).max(40).optional() });

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await params;
  const me = await authWorkspace(bearerToken(req), id);
  if (!me) return Response.json({ ok: false, error: "not_a_member" }, { status: 403 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const { data, error } = await sb
    .from("workspace_message_reads")
    .select("user_id, last_read_at")
    .eq("workspace_id", id);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true, results: data ?? [] });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await params;
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

  // Upsert: we want monotonic moves only, so guard with a check first —
  // a stale client shouldn't roll back the watermark.
  const { data: existing } = await sb
    .from("workspace_message_reads")
    .select("last_read_at")
    .eq("workspace_id", id)
    .eq("user_id", me.userId)
    .maybeSingle();
  if (existing && new Date((existing.last_read_at as string)).getTime() >= new Date(at).getTime()) {
    return Response.json({ ok: true, noop: true });
  }

  const { error } = await sb
    .from("workspace_message_reads")
    .upsert({ workspace_id: id, user_id: me.userId, last_read_at: at }, { onConflict: "workspace_id,user_id" });
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
