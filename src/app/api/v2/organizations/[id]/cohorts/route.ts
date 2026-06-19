import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { authOrganization, requireOrganizationRole } from "@/lib/organization-auth";
import { bearerToken } from "@/lib/workspace-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — list cohorts attached to this organization. Any org member
// reads; the response is shaped so the org dashboard's Cohorts tab
// can render lifecycle badges, member counts, and quick deep-links
// without a per-row round-trip.

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: true, results: [], mode: "local" });
  const { id } = await params;
  const me = await authOrganization(bearerToken(req), id);
  const forbid = requireOrganizationRole(me, "observer");
  if (forbid) return forbid;

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const { data: cohorts, error } = await sb
    .from("cohorts")
    .select("id, name, description, slug, status, kind, start_date, end_date, capacity, visibility, owner_id, updated_at, created_at")
    .eq("organization_id", id)
    .order("updated_at", { ascending: false });
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  // Batched member counts so each row carries the right "n students"
  // hint. We use the cohort_members table directly because the
  // cohort_members RLS scope is "members of the same cohort" — the
  // service role we use here bypasses it.
  const ids = (cohorts ?? []).map((c) => (c as { id: string }).id);
  const memberCount = new Map<string, { students: number; instructors: number }>();
  if (ids.length > 0) {
    const { data: rows } = await sb
      .from("cohort_members")
      .select("cohort_id, role, state")
      .in("cohort_id", ids);
    for (const r of (rows ?? []) as Array<{ cohort_id: string; role: string; state: string }>) {
      const cur = memberCount.get(r.cohort_id) ?? { students: 0, instructors: 0 };
      if (r.role === "instructor") cur.instructors++;
      // Count only active + invited as "students" — completed / dropped
      // are historical and shouldn't inflate the headline.
      else if (r.state === "invited" || r.state === "active") cur.students++;
      memberCount.set(r.cohort_id, cur);
    }
  }

  const results = (cohorts ?? []).map((c) => {
    const row = c as Record<string, unknown> & { id: string };
    const counts = memberCount.get(row.id) ?? { students: 0, instructors: 0 };
    return { ...row, _counts: counts };
  });

  return Response.json({ ok: true, results });
}
