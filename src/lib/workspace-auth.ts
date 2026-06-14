import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

// Roles, ordered: viewer < editor < admin < owner. The Workspaces
// engine is intentionally finer-grained than ventures (which is just
// owner/editor/viewer) because real collaborative use cases need a
// trusted lieutenant role: a study-group admin who can invite/remove
// members without being able to delete the workspace.
export type WorkspaceRole = "owner" | "admin" | "editor" | "viewer";

const RANKS: Record<WorkspaceRole, number> = { viewer: 1, editor: 2, admin: 3, owner: 4 };

export type WorkspaceAuthed = { userId: string; email?: string; role: WorkspaceRole };

// Resolve the caller's role on a given workspace using the service
// role + the is_workspace_member RPC. Bypasses RLS deliberately so
// every API route can rely on a single source of truth and return
// crisp 401/403 responses instead of empty result sets.
export async function authWorkspace(
  token: string | undefined,
  workspaceId: string,
): Promise<WorkspaceAuthed | null> {
  if (!token || !isSupabaseConfigured()) return null;
  const sb = supabaseAdmin();
  if (!sb) return null;

  const { data: u, error: e1 } = await sb.auth.getUser(token);
  if (e1 || !u?.user) return null;
  const userId = u.user.id;

  const { data: role } = await sb.rpc("is_workspace_member", {
    _workspace_id: workspaceId,
    _user_id: userId,
  });
  if (!role) return null;

  return { userId, email: u.user.email ?? undefined, role: role as WorkspaceRole };
}

export function requireWorkspaceRole(
  member: { role: WorkspaceRole } | null,
  minimum: WorkspaceRole,
): Response | null {
  if (!member) {
    return new Response(JSON.stringify({ ok: false, error: "not_a_member" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (RANKS[member.role] < RANKS[minimum]) {
    return new Response(
      JSON.stringify({ ok: false, error: "forbidden", required: minimum, have: member.role }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  }
  return null;
}

// Pure (testable) variant of the rank comparison — same answer as
// requireWorkspaceRole but as a boolean. Useful in client guards.
export function hasWorkspaceRole(role: WorkspaceRole, minimum: WorkspaceRole): boolean {
  return RANKS[role] >= RANKS[minimum];
}

// Pull the Bearer token off a Request without crashing on malformed
// headers. Mirrors the venture routes' inline pattern.
export function bearerToken(req: Request): string | undefined {
  const h = req.headers.get("Authorization") || req.headers.get("authorization");
  if (!h) return undefined;
  const [, token] = h.split(/\s+/, 2);
  return token || undefined;
}
