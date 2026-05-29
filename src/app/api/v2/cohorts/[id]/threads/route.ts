import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { authCohort, requireCohortRole } from "@/lib/cohort-auth";
import { pushToUser } from "@/lib/push-to-user";
import { resolveMentions } from "@/lib/mentions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cohort discussion threads.
//
// GET   ?assignmentId=<id>     → optionally filter to one assignment
//        ?includeReplyCount=1  → join a reply-count aggregate (default on)
// POST                         → create a thread
//                                { kind?, assignmentId?, title, body }

type ThreadKind = "question" | "note" | "announcement";
const KINDS: ThreadKind[] = ["question", "note", "announcement"];

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: true, mode: "local", results: [] });
  const { id } = await ctx.params;
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const me = await authCohort(token, id);
  if (!me) return Response.json({ ok: false, error: "not_a_member" }, { status: 403 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const url = new URL(req.url);
  const assignmentId = url.searchParams.get("assignmentId");
  const searchTerm = (url.searchParams.get("q") || "").trim();

  let q = sb.from("cohort_threads")
    .select("id, cohort_id, assignment_id, author_id, kind, title, body, pinned, resolved_at, created_at, updated_at")
    .eq("cohort_id", id)
    .order("pinned", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(200);

  if (assignmentId) q = q.eq("assignment_id", assignmentId);
  if (searchTerm) {
    // Case-insensitive substring search on title OR body. Postgres
    // ilike handles the case-fold; tsvector upgrade lives in a
    // future migration if scale demands it.
    const pattern = `%${searchTerm.replace(/[%_]/g, (m) => `\\${m}`)}%`;
    q = q.or(`title.ilike.${pattern},body.ilike.${pattern}`);
  }

  const { data: threads, error } = await q;
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  // Reply counts. We aggregate in JS — at cohort scale (a few hundred
  // threads max) a single bulk select is fine.
  const ids = (threads ?? []).map((t) => t.id);
  let counts: Map<string, { n: number; lastTs: string | null }> = new Map();
  if (ids.length > 0) {
    const { data: replies } = await sb.from("cohort_thread_replies")
      .select("thread_id, created_at")
      .in("thread_id", ids);
    for (const r of replies ?? []) {
      const cur = counts.get(r.thread_id) ?? { n: 0, lastTs: null };
      cur.n++;
      if (!cur.lastTs || r.created_at > cur.lastTs) cur.lastTs = r.created_at;
      counts.set(r.thread_id, cur);
    }
  }

  const results = (threads ?? []).map((t) => ({
    ...t,
    replyCount: counts.get(t.id)?.n ?? 0,
    lastReplyAt: counts.get(t.id)?.lastTs ?? null,
  }));

  return Response.json({ ok: true, results, myRole: me.role });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await ctx.params;
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const me = await authCohort(token, id);
  if (!me) return Response.json({ ok: false, error: "not_a_member" }, { status: 403 });

  let body: { kind?: string; assignmentId?: string | null; title?: string; body?: string };
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: "invalid_json" }, { status: 400 }); }

  const kind = (body.kind ?? "question") as ThreadKind;
  if (!KINDS.includes(kind)) return Response.json({ ok: false, error: "invalid_kind" }, { status: 400 });
  // Announcements are instructor-only — a student spamming "announcement"
  // kind would be UI-misleading.
  if (kind === "announcement") {
    const forbidden = requireCohortRole(me, "instructor");
    if (forbidden) return forbidden;
  }
  const title = (body.title ?? "").trim();
  if (title.length < 3) return Response.json({ ok: false, error: "title_too_short" }, { status: 400 });
  const text = (body.body ?? "").trim();
  if (text.length < 1) return Response.json({ ok: false, error: "body_required" }, { status: 400 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  // Validate the assignment belongs to this cohort so a student can't
  // pin a question to a sibling cohort's task.
  if (body.assignmentId) {
    const { data: a } = await sb.from("cohort_assignments").select("id").eq("id", body.assignmentId).eq("cohort_id", id).maybeSingle();
    if (!a) return Response.json({ ok: false, error: "assignment_not_in_cohort" }, { status: 400 });
  }

  const { data, error } = await sb.from("cohort_threads").insert({
    cohort_id: id,
    assignment_id: body.assignmentId ?? null,
    author_id: me.userId,
    kind,
    title: title.slice(0, 200),
    body: text.slice(0, 8000),
  }).select("id").maybeSingle();

  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  // Mention fan-out + announcement-to-cohort broadcast. Title + body
  // both scanned for @mentions. Fire-and-forget.
  void (async () => {
    try {
      const cohortName = await sb.from("cohorts").select("name").eq("id", id).maybeSingle()
        .then((r) => (r.data?.name as string) ?? "your cohort");

      const notified = new Set<string>();
      notified.add(me.userId);

      const { data: members } = await sb.from("cohort_members")
        .select("user_id, display_name, email, role")
        .eq("cohort_id", id);

      // Announcements push to every cohort member by default — that's
      // what makes them an announcement, not a thread.
      if (kind === "announcement") {
        for (const m of members ?? []) {
          if (notified.has(m.user_id)) continue;
          await pushToUser(m.user_id, {
            title: `Announcement in ${cohortName}`,
            body: title.slice(0, 120),
            url: `/studio/cohorts/${id}`,
            tag: `cohort-announcement:${data?.id}`,
          }, { category: "announcement" });
          notified.add(m.user_id);
        }
        return;
      }

      const haystack = `${title} ${text}`;
      const { userIds: mentioned } = resolveMentions(haystack, members ?? []);
      for (const uid of mentioned) {
        if (notified.has(uid)) continue;
        await pushToUser(uid, {
          title: `Mentioned in ${cohortName}`,
          body: `New thread: "${title.slice(0, 80)}"`,
          url: `/studio/cohorts/${id}`,
          tag: `cohort-thread:${data?.id}:mention`,
        }, { category: "mention" });
        notified.add(uid);
      }
    } catch { /* best-effort */ }
  })();

  return Response.json({ ok: true, id: data?.id });
}
