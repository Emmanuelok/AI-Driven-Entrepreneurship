import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { authCohort, requireCohortRole } from "@/lib/cohort-auth";
import { canTransitionStatus, type CohortStatus } from "@/lib/cohort-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET    → read cohort metadata (any member)
// PATCH  → update name / description / institution + v2 fields
//          (kind, dates, capacity, visibility, status) — owner only.
//          Status transitions are gated by canTransitionStatus.
// DELETE → delete the cohort and everything in it (owner only)

const ALL_COLS = "id, owner_id, name, description, institution, slug, status, kind, start_date, end_date, capacity, visibility, organization_id, settings, created_at, updated_at";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await ctx.params;
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const me = await authCohort(token, id);
  if (!me) return Response.json({ ok: false, error: "not_a_member" }, { status: 403 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin unavailable" }, { status: 500 });

  const { data, error } = await sb.from("cohorts").select(ALL_COLS).eq("id", id).maybeSingle();
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  if (!data) return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  return Response.json({ ok: true, cohort: data, myRole: me.role });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await ctx.params;
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const me = await authCohort(token, id);
  const forbidden = requireCohortRole(me, "owner");
  if (forbidden) return forbidden;

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin unavailable" }, { status: 500 });

  let body: {
    name?: string;
    description?: string;
    institution?: string;
    kind?: "course" | "program" | "accelerator" | "bootcamp" | "study_group" | "other";
    visibility?: "private" | "link" | "public";
    status?: CohortStatus;
    startDate?: string | null;
    endDate?: string | null;
    capacity?: number | null;
    organizationId?: string | null;
  };
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: "invalid_json" }, { status: 400 }); }

  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) patch.name = String(body.name).slice(0, 200);
  if (body.description !== undefined) patch.description = String(body.description).slice(0, 2000) || null;
  if (body.institution !== undefined) patch.institution = String(body.institution).slice(0, 200) || null;
  if (body.kind !== undefined) patch.kind = body.kind;
  if (body.visibility !== undefined) patch.visibility = body.visibility;
  if (body.startDate !== undefined) patch.start_date = body.startDate;
  if (body.endDate !== undefined) patch.end_date = body.endDate;
  if (body.capacity !== undefined) patch.capacity = body.capacity;
  if (body.organizationId !== undefined) patch.organization_id = body.organizationId;

  // Status changes go through the state-machine gate. If the caller
  // sends an illegal transition we return 400 with the current status
  // so the UI can refresh without guessing.
  if (body.status !== undefined) {
    const { data: cur } = await sb.from("cohorts").select("status").eq("id", id).maybeSingle();
    const curStatus = (cur as { status?: CohortStatus } | null)?.status as CohortStatus | undefined;
    if (!curStatus) return Response.json({ ok: false, error: "not_found" }, { status: 404 });
    if (!canTransitionStatus(curStatus, body.status)) {
      return Response.json({ ok: false, error: "illegal_status_transition", from: curStatus, to: body.status }, { status: 400 });
    }
    patch.status = body.status;
  }

  if (Object.keys(patch).length === 0) return Response.json({ ok: true, noop: true });

  const { data, error } = await sb.from("cohorts").update(patch).eq("id", id).select(ALL_COLS).single();
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true, cohort: data });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await ctx.params;
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const me = await authCohort(token, id);
  const forbidden = requireCohortRole(me, "owner");
  if (forbidden) return forbidden;

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin unavailable" }, { status: 500 });
  const { error } = await sb.from("cohorts").delete().eq("id", id);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
