import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { authCohort, requireCohortRole } from "@/lib/cohort-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Single thread with replies inline. PATCH = author resolves /
// instructor pins; DELETE = author or instructor.

export async function GET(req: Request, ctx: { params: Promise<{ id: string; tid: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id, tid } = await ctx.params;
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const me = await authCohort(token, id);
  if (!me) return Response.json({ ok: false, error: "not_a_member" }, { status: 403 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const { data: thread } = await sb.from("cohort_threads")
    .select("id, cohort_id, assignment_id, author_id, kind, title, body, pinned, resolved_at, created_at, updated_at")
    .eq("id", tid).eq("cohort_id", id).maybeSingle();
  if (!thread) return Response.json({ ok: false, error: "not_found" }, { status: 404 });

  const { data: replies } = await sb.from("cohort_thread_replies")
    .select("id, thread_id, author_id, body, created_at")
    .eq("thread_id", tid)
    .order("created_at", { ascending: true });

  return Response.json({ ok: true, thread, replies: replies ?? [], myRole: me.role, myUserId: me.userId });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string; tid: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id, tid } = await ctx.params;
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const me = await authCohort(token, id);
  if (!me) return Response.json({ ok: false, error: "not_a_member" }, { status: 403 });

  let body: { pinned?: boolean; resolved?: boolean; title?: string; body?: string };
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: "invalid_json" }, { status: 400 }); }

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const { data: thread } = await sb.from("cohort_threads").select("id, author_id").eq("id", tid).eq("cohort_id", id).maybeSingle();
  if (!thread) return Response.json({ ok: false, error: "not_found" }, { status: 404 });

  const isAuthor = thread.author_id === me.userId;
  const isInstructor = me.role === "instructor" || me.role === "owner";

  // Only instructors can pin; author OR instructor can resolve / edit.
  const patch: Record<string, unknown> = {};
  if (typeof body.pinned === "boolean") {
    if (!isInstructor) return Response.json({ ok: false, error: "pin_requires_instructor" }, { status: 403 });
    patch.pinned = body.pinned;
  }
  if (typeof body.resolved === "boolean") {
    if (!isAuthor && !isInstructor) return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
    patch.resolved_at = body.resolved ? new Date().toISOString() : null;
  }
  if (typeof body.title === "string") {
    if (!isAuthor && !isInstructor) return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
    const t = body.title.trim();
    if (t.length < 3) return Response.json({ ok: false, error: "title_too_short" }, { status: 400 });
    patch.title = t.slice(0, 200);
  }
  if (typeof body.body === "string") {
    if (!isAuthor && !isInstructor) return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
    patch.body = body.body.slice(0, 8000);
  }
  if (Object.keys(patch).length === 0) return Response.json({ ok: false, error: "no_changes" }, { status: 400 });

  const { error } = await sb.from("cohort_threads").update(patch).eq("id", tid);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string; tid: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id, tid } = await ctx.params;
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const me = await authCohort(token, id);
  if (!me) return Response.json({ ok: false, error: "not_a_member" }, { status: 403 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const { data: thread } = await sb.from("cohort_threads").select("id, author_id").eq("id", tid).eq("cohort_id", id).maybeSingle();
  if (!thread) return Response.json({ ok: false, error: "not_found" }, { status: 404 });

  const isAuthor = thread.author_id === me.userId;
  const isInstructor = me.role === "instructor" || me.role === "owner";
  if (!isAuthor && !isInstructor) return Response.json({ ok: false, error: "forbidden" }, { status: 403 });

  const { error } = await sb.from("cohort_threads").delete().eq("id", tid);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
