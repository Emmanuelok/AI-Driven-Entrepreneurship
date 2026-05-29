import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { authCohort } from "@/lib/cohort-auth";
import { pushToUser } from "@/lib/push-to-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/v2/cohorts/[id]/threads/[tid]/replies — add a reply.
//
// The thread detail GET returns replies; we don't need a list endpoint
// here. The denormalized cohort_id on cohort_thread_replies is what
// lets RLS check membership without a join — set it server-side so a
// client can't claim a reply belongs to a different cohort.

export async function POST(req: Request, ctx: { params: Promise<{ id: string; tid: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id, tid } = await ctx.params;
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const me = await authCohort(token, id);
  if (!me) return Response.json({ ok: false, error: "not_a_member" }, { status: 403 });

  let body: { body?: string };
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: "invalid_json" }, { status: 400 }); }
  const text = (body.body ?? "").trim();
  if (text.length < 1) return Response.json({ ok: false, error: "body_required" }, { status: 400 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  // Validate the thread belongs to the cohort. Also pick up author_id +
  // title for the notification fan-out below.
  const { data: thread } = await sb.from("cohort_threads").select("id, author_id, title").eq("id", tid).eq("cohort_id", id).maybeSingle();
  if (!thread) return Response.json({ ok: false, error: "thread_not_in_cohort" }, { status: 400 });

  const { data, error } = await sb.from("cohort_thread_replies").insert({
    thread_id: tid,
    cohort_id: id,
    author_id: me.userId,
    body: text.slice(0, 8000),
  }).select("id").maybeSingle();

  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  // Notify the thread author (unless they replied to themselves).
  // Fire-and-forget — never block the reply response on push.
  if (thread.author_id !== me.userId) {
    const cohortName = await sb.from("cohorts").select("name").eq("id", id).maybeSingle()
      .then((r) => (r.data?.name as string) ?? "your cohort");
    void pushToUser(thread.author_id, {
      title: `New reply in ${cohortName}`,
      body: `"${thread.title.slice(0, 80)}" got a new reply.`,
      url: `/studio/cohorts/${id}`,
      tag: `cohort-thread:${tid}`,
    }).catch(() => { /* best-effort */ });
  }

  return Response.json({ ok: true, id: data?.id });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string; tid: string }> }) {
  // Delete by reply id — we use a sub-route /replies/[rid] for the
  // specific reply, but exposing DELETE here keeps the surface small
  // and lets clients pass ?rid=… when convenient.
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id, tid } = await ctx.params;
  const url = new URL(req.url);
  const rid = url.searchParams.get("rid");
  if (!rid) return Response.json({ ok: false, error: "missing_rid" }, { status: 400 });

  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const me = await authCohort(token, id);
  if (!me) return Response.json({ ok: false, error: "not_a_member" }, { status: 403 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const { data: reply } = await sb.from("cohort_thread_replies").select("author_id, thread_id").eq("id", rid).eq("cohort_id", id).maybeSingle();
  if (!reply || reply.thread_id !== tid) return Response.json({ ok: false, error: "not_found" }, { status: 404 });

  const isAuthor = reply.author_id === me.userId;
  const isInstructor = me.role === "instructor" || me.role === "owner";
  if (!isAuthor && !isInstructor) return Response.json({ ok: false, error: "forbidden" }, { status: 403 });

  const { error } = await sb.from("cohort_thread_replies").delete().eq("id", rid);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
