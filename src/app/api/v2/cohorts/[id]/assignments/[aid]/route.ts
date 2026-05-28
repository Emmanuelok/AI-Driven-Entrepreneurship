import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { authCohort, requireCohortRole } from "@/lib/cohort-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PATCH  → update title / description / due (instructor)
// DELETE → remove (instructor)

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string; aid: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id, aid } = await ctx.params;
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const me = await authCohort(token, id);
  const forbidden = requireCohortRole(me, "instructor");
  if (forbidden) return forbidden;

  let body: { title?: string; description?: string; dueAt?: string | null };
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: "invalid_json" }, { status: 400 }); }
  const patch: Record<string, unknown> = {};
  if (body.title !== undefined) patch.title = String(body.title).slice(0, 200);
  if (body.description !== undefined) patch.description = String(body.description).slice(0, 2000) || null;
  if (body.dueAt !== undefined) patch.due_at = body.dueAt;
  if (Object.keys(patch).length === 0) return Response.json({ ok: true, noop: true });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin unavailable" }, { status: 500 });
  const { error } = await sb.from("cohort_assignments").update(patch).eq("id", aid).eq("cohort_id", id);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string; aid: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id, aid } = await ctx.params;
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const me = await authCohort(token, id);
  const forbidden = requireCohortRole(me, "instructor");
  if (forbidden) return forbidden;

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin unavailable" }, { status: 500 });
  const { error } = await sb.from("cohort_assignments").delete().eq("id", aid).eq("cohort_id", id);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
