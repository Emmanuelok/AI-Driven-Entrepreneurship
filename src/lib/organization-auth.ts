import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

// Roles inside an organization, ordered.
//
//   observer   — read-only auditing (board, partner observer)
//   staff      — read-only support, can view roster + cohorts
//   instructor — can create cohorts, manage their own cohort membership,
//                gets the cohort instructor role automatically when
//                added to a cohort the org owns
//   admin      — full org management except deletion + ownership change
//   owner      — the org. Can do everything including transfer ownership
//                (single-owner model; admins can be many, owner is one).
//
// These mirror the workspace role ladder in spirit but the verbs are
// org-shaped: orgs don't have an "editor" because nothing in the org
// itself is co-edited — that happens inside the workspaces the org owns.
export type OrganizationRole = "owner" | "admin" | "instructor" | "staff" | "observer";

const RANKS: Record<OrganizationRole, number> = {
  observer: 1,
  staff: 2,
  instructor: 3,
  admin: 4,
  owner: 5,
};

export type OrganizationAuthed = {
  userId: string;
  email?: string;
  role: OrganizationRole;
};

// Resolve the caller's role on a given org using the service role +
// the is_organization_member RPC. The RPC special-cases the owner so
// even a corrupted organization_members row can't lock the owner out.
export async function authOrganization(
  token: string | undefined,
  organizationId: string,
): Promise<OrganizationAuthed | null> {
  if (!token || !isSupabaseConfigured()) return null;
  const sb = supabaseAdmin();
  if (!sb) return null;

  const { data: u, error } = await sb.auth.getUser(token);
  if (error || !u?.user) return null;

  const { data: role } = await sb.rpc("is_organization_member", {
    _organization_id: organizationId,
    _user_id: u.user.id,
  });
  if (!role) return null;

  return {
    userId: u.user.id,
    email: u.user.email ?? undefined,
    role: role as OrganizationRole,
  };
}

// Same shape as requireWorkspaceRole — returns a Response when the
// caller lacks the minimum role, null when they pass. Lets API routes
// stay linear.
export function requireOrganizationRole(
  member: { role: OrganizationRole } | null,
  minimum: OrganizationRole,
): Response | null {
  if (!member) {
    return new Response(
      JSON.stringify({ ok: false, error: "not_a_member" }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  }
  if (RANKS[member.role] < RANKS[minimum]) {
    return new Response(
      JSON.stringify({ ok: false, error: "forbidden", required: minimum, have: member.role }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  }
  return null;
}

// Pure boolean variant for client-side guards (showing/hiding the
// Manage tab, etc.). The server is always the source of truth — this
// is just to keep the UI honest.
export function hasOrganizationRole(role: OrganizationRole, minimum: OrganizationRole): boolean {
  return RANKS[role] >= RANKS[minimum];
}

// Slug minting for /o/[slug]. Lowercases, strips diacritics, replaces
// non-alphanum with hyphens, collapses + trims. The API layer enforces
// uniqueness; collisions get a "-2" / "-3" suffix.
export function slugifyOrgName(name: string): string {
  return (name || "org")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "org";
}
