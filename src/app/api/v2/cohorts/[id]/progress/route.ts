import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { authCohort } from "@/lib/cohort-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET   → list progress rows visible to me (instructor sees all,
//         student sees their own). Returns all rows so the cohort UI
//         can render the matrix in one round trip.
// PATCH → student updates their own status on a single assignment.
//         Body: { assignmentId, status, scorePct?, evidenceUrl?, notes? }

type Status = "not_started" | "in_progress" | "completed" | "submitted";
const STATUSES: Status[] = ["not_started", "in_progress", "completed", "submitted"];

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: true, mode: "local", results: [] });
  const { id } = await ctx.params;
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const me = await authCohort(token, id);
  if (!me) return Response.json({ ok: false, error: "not_a_member" }, { status: 403 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin unavailable" }, { status: 500 });

  let query = sb.from("cohort_progress")
    .select("user_id, assignment_id, status, score_pct, evidence_url, notes, updated_at")
    .eq("cohort_id", id);

  // Students only see their own rows (RLS would enforce this, but
  // returning a smaller payload is friendlier).
  if (me.role === "student") query = query.eq("user_id", me.userId);

  const { data, error } = await query;
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  return Response.json({ ok: true, results: data ?? [], myRole: me.role });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await ctx.params;
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const me = await authCohort(token, id);
  if (!me) return Response.json({ ok: false, error: "not_a_member" }, { status: 403 });

  let body: { assignmentId?: string; status?: string; scorePct?: number; evidenceUrl?: string; notes?: string };
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: "invalid_json" }, { status: 400 }); }
  const assignmentId = (body.assignmentId ?? "").trim();
  if (!assignmentId) return Response.json({ ok: false, error: "missing_assignmentId" }, { status: 400 });
  const status = (body.status ?? "not_started") as Status;
  if (!STATUSES.includes(status)) return Response.json({ ok: false, error: "invalid_status" }, { status: 400 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin unavailable" }, { status: 500 });

  // Verify the assignment belongs to this cohort so a client can't
  // store rows that bind one cohort's progress to another's assignment.
  const { data: assignment } = await sb.from("cohort_assignments").select("id").eq("id", assignmentId).eq("cohort_id", id).maybeSingle();
  if (!assignment) return Response.json({ ok: false, error: "assignment_not_in_cohort" }, { status: 400 });

  const row = {
    cohort_id: id,
    user_id: me.userId,
    assignment_id: assignmentId,
    status,
    score_pct: typeof body.scorePct === "number" ? body.scorePct : null,
    evidence_url: body.evidenceUrl ? body.evidenceUrl.slice(0, 500) : null,
    notes: body.notes ? body.notes.slice(0, 2000) : null,
  };
  const { error } = await sb.from("cohort_progress").upsert(row, { onConflict: "cohort_id,user_id,assignment_id" });
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  return Response.json({ ok: true });
}
