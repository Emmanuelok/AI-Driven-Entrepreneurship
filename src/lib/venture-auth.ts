import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

export type VentureRole = "owner" | "editor" | "viewer";

// Auth check used by every /api/v2/ventures route. Returns the user's
// role on the venture, or null when they have no access. Service-role
// query bypasses RLS so we can centralize the auth logic here.

export async function authVenture(
  token: string | undefined,
  ventureId: string,
): Promise<{ userId: string; email?: string; role: VentureRole } | null> {
  if (!token || !isSupabaseConfigured()) return null;
  const sb = supabaseAdmin();
  if (!sb) return null;

  const { data: u, error: e1 } = await sb.auth.getUser(token);
  if (e1 || !u?.user) return null;
  const userId = u.user.id;

  const { data: role } = await sb.rpc("is_venture_member", { _venture_id: ventureId, _user_id: userId });
  if (!role) return null;

  return { userId, email: u.user.email ?? undefined, role: role as VentureRole };
}

// Stricter variant that returns an HTTP 403 Response when the role
// doesn't meet the requirement.
export function requireRole(
  member: { role: VentureRole } | null,
  minimum: VentureRole,
): Response | null {
  const ranks: Record<VentureRole, number> = { viewer: 1, editor: 2, owner: 3 };
  if (!member) return new Response(JSON.stringify({ ok: false, error: "not_a_member" }), { status: 403, headers: { "Content-Type": "application/json" } });
  if (ranks[member.role] < ranks[minimum]) {
    return new Response(JSON.stringify({ ok: false, error: "forbidden", required: minimum, have: member.role }), { status: 403, headers: { "Content-Type": "application/json" } });
  }
  return null;
}
