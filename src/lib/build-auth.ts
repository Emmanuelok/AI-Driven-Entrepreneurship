import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

export type BuildRole = "owner" | "editor" | "viewer";

// Server-side auth check for /api/v2/builds/* — mirrors lib/venture-auth.ts.

export async function authBuild(
  token: string | undefined,
  buildId: string,
): Promise<{ userId: string; email?: string; role: BuildRole } | null> {
  if (!token || !isSupabaseConfigured()) return null;
  const sb = supabaseAdmin();
  if (!sb) return null;

  const { data: u, error } = await sb.auth.getUser(token);
  if (error || !u?.user) return null;

  const { data: role } = await sb.rpc("is_build_member", { _build_id: buildId, _user_id: u.user.id });
  if (!role) return null;
  return { userId: u.user.id, email: u.user.email ?? undefined, role: role as BuildRole };
}

export function requireBuildRole(
  member: { role: BuildRole } | null,
  minimum: BuildRole,
): Response | null {
  const ranks: Record<BuildRole, number> = { viewer: 1, editor: 2, owner: 3 };
  if (!member) return new Response(JSON.stringify({ ok: false, error: "not_a_member" }), { status: 403, headers: { "Content-Type": "application/json" } });
  if (ranks[member.role] < ranks[minimum]) {
    return new Response(JSON.stringify({ ok: false, error: "forbidden", required: minimum, have: member.role }), { status: 403, headers: { "Content-Type": "application/json" } });
  }
  return null;
}
