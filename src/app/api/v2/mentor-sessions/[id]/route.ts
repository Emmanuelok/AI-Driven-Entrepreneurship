import { z } from "zod";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { bearerToken } from "@/lib/workspace-auth";
import { parseBody } from "@/lib/parse-body";
import { canTransitionMentorSession, type MentorSessionStatus } from "@/lib/mentor-session-state";
import { createNotification } from "@/lib/notifications-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET   — read a single session. Either party only.
// PATCH — update one of:
//          - status (state machine gated via canTransitionMentorSession)
//          - founder_notes (founder only, pre-payment)
//          - mentor_notes (mentor only, post-completion)
//          - scheduled_at (mentor only, on accept)
//          - review (founder only, post-completion → flips status to
//            'reviewed' atomically)

const PatchBody = z.object({
  status: z.enum(["accepted", "completed", "cancelled", "refunded", "reviewed"]).optional(),
  founder_notes: z.string().max(2000).optional(),
  mentor_notes: z.string().max(2000).optional(),
  scheduled_at: z.string().optional(),
  review: z.object({
    rating: z.number().int().min(1).max(5),
    body: z.string().max(2000).optional(),
  }).optional(),
});

async function resolveCaller(req: Request) {
  const token = bearerToken(req);
  if (!token) return { error: Response.json({ ok: false, error: "missing_token" }, { status: 401 }) };
  const sb = supabaseAdmin();
  if (!sb) return { error: Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 }) };
  const { data: u, error } = await sb.auth.getUser(token);
  if (error || !u?.user) return { error: Response.json({ ok: false, error: "auth_failed" }, { status: 401 }) };
  return { sb, user: u.user };
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await params;
  const r = await resolveCaller(req);
  if ("error" in r) return r.error;
  const { sb, user } = r;

  const { data } = await sb.from("mentor_sessions").select("*").eq("id", id).maybeSingle();
  const row = data as { mentor_user_id: string; founder_user_id: string } | null;
  if (!row || (row.mentor_user_id !== user.id && row.founder_user_id !== user.id)) {
    return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  return Response.json({ ok: true, session: data });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await params;
  const r = await resolveCaller(req);
  if ("error" in r) return r.error;
  const { sb, user } = r;

  const parsed = await parseBody(req, PatchBody);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const { data: existing } = await sb.from("mentor_sessions").select("*").eq("id", id).maybeSingle();
  const row = existing as {
    id: string;
    mentor_user_id: string;
    founder_user_id: string;
    status: MentorSessionStatus;
    topic: string;
  } | null;
  if (!row) return Response.json({ ok: false, error: "not_found" }, { status: 404 });

  const isMentor = row.mentor_user_id === user.id;
  const isFounder = row.founder_user_id === user.id;
  if (!isMentor && !isFounder) return Response.json({ ok: false, error: "not_a_party" }, { status: 403 });

  const patch: Record<string, unknown> = {};
  const nowIso = new Date().toISOString();

  // Notes (separate by actor + status restrictions).
  if (body.founder_notes !== undefined) {
    if (!isFounder) return Response.json({ ok: false, error: "only_founder_writes_founder_notes" }, { status: 403 });
    if (row.status !== "requested" && row.status !== "accepted") {
      return Response.json({ ok: false, error: "founder_notes_locked_after_payment" }, { status: 400 });
    }
    patch.founder_notes = body.founder_notes;
  }
  if (body.mentor_notes !== undefined) {
    if (!isMentor) return Response.json({ ok: false, error: "only_mentor_writes_mentor_notes" }, { status: 403 });
    if (row.status !== "completed" && row.status !== "reviewed") {
      return Response.json({ ok: false, error: "mentor_notes_only_after_completion" }, { status: 400 });
    }
    patch.mentor_notes = body.mentor_notes;
  }

  // Schedule. Mentor sets it on accept; founder sees it.
  if (body.scheduled_at !== undefined) {
    if (!isMentor) return Response.json({ ok: false, error: "only_mentor_schedules" }, { status: 403 });
    if (row.status !== "requested" && row.status !== "accepted") {
      return Response.json({ ok: false, error: "schedule_locked" }, { status: 400 });
    }
    patch.scheduled_at = body.scheduled_at;
  }

  // Review (founder-only, only after completion). Setting a review
  // ALSO flips status to 'reviewed' — this is the only path to that
  // status.
  if (body.review !== undefined) {
    if (!isFounder) return Response.json({ ok: false, error: "only_founder_reviews" }, { status: 403 });
    if (row.status !== "completed") return Response.json({ ok: false, error: "can_only_review_completed" }, { status: 400 });
    patch.review_rating = body.review.rating;
    patch.review_body = body.review.body ?? "";
    patch.reviewed_at = nowIso;
    patch.status = "reviewed";
  }

  // Status changes (gated by the state machine — the only paths a
  // user can drive directly).
  if (body.status !== undefined && body.status !== "reviewed") {
    const actor = isMentor ? "mentor" : "founder";
    if (!canTransitionMentorSession(row.status, body.status, actor)) {
      return Response.json({
        ok: false,
        error: "illegal_transition",
        from: row.status,
        to: body.status,
        actor,
      }, { status: 400 });
    }
    patch.status = body.status;
    if (body.status === "accepted") patch.accepted_at = nowIso;
    if (body.status === "completed") patch.completed_at = nowIso;
    if (body.status === "cancelled") {
      patch.cancelled_at = nowIso;
      patch.cancelled_by_user_id = user.id;
    }
    if (body.status === "refunded") patch.refunded_at = nowIso;
  }

  if (Object.keys(patch).length === 0) {
    return Response.json({ ok: true, noop: true });
  }

  const { data, error } = await sb
    .from("mentor_sessions")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  // Side-effect notifications for the OTHER party.
  if (body.status === "accepted") {
    void createNotification({
      userId: row.founder_user_id,
      actorId: user.id,
      kind: "contact_response",
      targetKind: "contact",
      title: "Your mentor session was accepted",
      body: row.topic.slice(0, 160),
      url: `/studio/mentor-sessions/${id}`,
    });
  } else if (body.status === "completed") {
    void createNotification({
      userId: row.founder_user_id,
      actorId: user.id,
      kind: "contact_response",
      targetKind: "contact",
      title: "Your mentor marked the session complete",
      body: "Leave a review when you've got a moment.",
      url: `/studio/mentor-sessions/${id}`,
    });
  } else if (body.review !== undefined) {
    void createNotification({
      userId: row.mentor_user_id,
      actorId: user.id,
      kind: "contact_response",
      targetKind: "contact",
      title: `${body.review.rating}-star review on your session`,
      body: (body.review.body ?? "").slice(0, 160),
      url: `/studio/mentor-sessions/${id}`,
    });
  } else if (body.status === "cancelled") {
    const otherParty = isMentor ? row.founder_user_id : row.mentor_user_id;
    void createNotification({
      userId: otherParty,
      actorId: user.id,
      kind: "contact_response",
      targetKind: "contact",
      title: "Mentor session cancelled",
      body: row.topic.slice(0, 160),
      url: `/studio/mentor-sessions/${id}`,
    });
  } else if (body.status === "refunded") {
    void createNotification({
      userId: row.founder_user_id,
      actorId: user.id,
      kind: "contact_response",
      targetKind: "contact",
      title: "Your mentor session was refunded",
      body: row.topic.slice(0, 160),
      url: `/studio/mentor-sessions/${id}`,
    });
  }

  return Response.json({ ok: true, session: data });
}
