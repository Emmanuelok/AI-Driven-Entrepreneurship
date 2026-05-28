import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { authCohort, requireCohortRole } from "@/lib/cohort-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AssignmentKind = "lesson" | "track" | "problem" | "build" | "venture" | "free";
const KINDS: AssignmentKind[] = ["lesson", "track", "problem", "build", "venture", "free"];

// GET  → list assignments for this cohort (any member)
// POST → create one (instructor+). Body: { kind, targetId?, title, description?, dueAt? }

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local", results: [] });
  const { id } = await ctx.params;
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const me = await authCohort(token, id);
  if (!me) return Response.json({ ok: false, error: "not_a_member" }, { status: 403 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin unavailable" }, { status: 500 });

  const { data, error } = await sb.from("cohort_assignments")
    .select("id, kind, target_id, title, description, due_at, created_at, created_by")
    .eq("cohort_id", id)
    .order("due_at", { ascending: true, nullsFirst: false });
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  return Response.json({ ok: true, results: data ?? [], myRole: me.role });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await ctx.params;
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const me = await authCohort(token, id);
  const forbidden = requireCohortRole(me, "instructor");
  if (forbidden) return forbidden;

  let body: { kind?: string; targetId?: string; title?: string; description?: string; dueAt?: string };
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: "invalid_json" }, { status: 400 }); }

  const kind = body.kind as AssignmentKind;
  if (!KINDS.includes(kind)) return Response.json({ ok: false, error: "invalid_kind" }, { status: 400 });
  const title = (body.title ?? "").trim();
  if (title.length < 2) return Response.json({ ok: false, error: "title_too_short" }, { status: 400 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin unavailable" }, { status: 500 });

  const { data, error } = await sb.from("cohort_assignments").insert({
    cohort_id: id,
    kind,
    target_id: body.targetId ?? null,
    title: title.slice(0, 200),
    description: (body.description ?? "").slice(0, 2000) || null,
    due_at: body.dueAt ?? null,
    created_by: me!.userId,
  }).select("id").single();
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  return Response.json({ ok: true, assignmentId: data.id });
}
