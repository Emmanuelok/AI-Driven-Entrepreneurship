import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { authOrganization, requireOrganizationRole } from "@/lib/organization-auth";
import { bearerToken } from "@/lib/workspace-auth";
import { computeOrgRollup, type CohortRow, type CohortMemberRow, type ProgressRow, type AssignmentRow } from "@/lib/org-analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — org-level analytics rollup. Visible to any org member (the
// roster is sensitive but the aggregated counts aren't), gated to
// observer+ via the role helper.
//
// The route's job is to fetch the right cohorts + members + progress +
// assignments for the org, then hand them to computeOrgRollup. All the
// math lives in the pure helper so we can unit-test it.

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await params;
  const me = await authOrganization(bearerToken(req), id);
  const forbid = requireOrganizationRole(me, "observer");
  if (forbid) return forbid;

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  // Step 1: cohorts attached to this org.
  const cohortsRes = await sb
    .from("cohorts")
    .select("id, name, status, start_date, end_date, capacity")
    .eq("organization_id", id);
  if (cohortsRes.error) return Response.json({ ok: false, error: cohortsRes.error.message }, { status: 500 });
  const cohorts = (cohortsRes.data ?? []) as CohortRow[];
  const cohortIds = cohorts.map((c) => c.id);

  // No cohorts → empty rollup, skip the joins.
  if (cohortIds.length === 0) {
    const rollup = computeOrgRollup({ cohorts: [], members: [], progress: [], assignments: [] });
    return Response.json({ ok: true, rollup });
  }

  // Step 2: members + progress + assignments — three parallel queries
  // restricted to this org's cohorts.
  const [membersRes, progressRes, assignmentsRes] = await Promise.all([
    sb.from("cohort_members")
      .select("cohort_id, user_id, role, state, joined_at, completed_at, dropped_at")
      .in("cohort_id", cohortIds),
    sb.from("cohort_progress")
      .select("cohort_id, user_id, assignment_id, status, updated_at")
      .in("cohort_id", cohortIds),
    sb.from("cohort_assignments")
      .select("id, cohort_id, due_at")
      .in("cohort_id", cohortIds),
  ]);

  const members = (membersRes.data ?? []) as CohortMemberRow[];
  const progress = (progressRes.data ?? []) as ProgressRow[];
  const assignments = (assignmentsRes.data ?? []) as AssignmentRow[];

  const rollup = computeOrgRollup({ cohorts, members, progress, assignments });

  return Response.json({ ok: true, rollup });
}
