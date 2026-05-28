import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

export type CohortRole = "owner" | "instructor" | "student";

// Mirrors lib/venture-auth.ts + lib/build-auth.ts. Centralizes role
// checks for /api/v2/cohorts/* routes so each handler stays one-liner.

export async function authCohort(
  token: string | undefined,
  cohortId: string,
): Promise<{ userId: string; email?: string; role: CohortRole } | null> {
  if (!token || !isSupabaseConfigured()) return null;
  const sb = supabaseAdmin();
  if (!sb) return null;

  const { data: u, error } = await sb.auth.getUser(token);
  if (error || !u?.user) return null;

  const { data: role } = await sb.rpc("is_cohort_member", { _cohort_id: cohortId, _user_id: u.user.id });
  if (!role) return null;
  return { userId: u.user.id, email: u.user.email ?? undefined, role: role as CohortRole };
}

export function requireCohortRole(
  member: { role: CohortRole } | null,
  minimum: "student" | "instructor" | "owner",
): Response | null {
  const ranks: Record<CohortRole, number> = { student: 1, instructor: 2, owner: 3 };
  if (!member) return new Response(JSON.stringify({ ok: false, error: "not_a_member" }), { status: 403, headers: { "Content-Type": "application/json" } });
  if (ranks[member.role] < ranks[minimum]) {
    return new Response(JSON.stringify({ ok: false, error: "forbidden", required: minimum, have: member.role }), { status: 403, headers: { "Content-Type": "application/json" } });
  }
  return null;
}
