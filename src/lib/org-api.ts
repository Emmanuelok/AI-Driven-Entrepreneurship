"use client";

import { supabaseBrowser } from "@/lib/supabase";

// Typed client for /api/v2/organizations/*. Mirrors workspace-api +
// profile-api: bearer auth from the Supabase session, discriminated
// {ok:true}|{ok:false,error} returns.

export type OrganizationKind = "university" | "accelerator" | "bootcamp" | "school" | "program" | "other";
export type OrganizationRole = "owner" | "admin" | "instructor" | "staff" | "observer";

export type Organization = {
  id: string;
  slug: string;
  name: string;
  kind: OrganizationKind;
  description: string;
  country: string;
  city: string;
  logo_url: string | null;
  website_url: string | null;
  institution_domain: string | null;
  is_verified: boolean;
  is_public: boolean;
  settings: Record<string, unknown>;
  owner_user_id: string;
  created_at: string;
  updated_at: string;
  myRole?: OrganizationRole | null;
};

export type OrganizationMember = {
  user_id: string;
  role: OrganizationRole;
  email: string | null;
  display_name: string | null;
  joined_at: string;
  invited_by: string | null;
};

export type OrganizationInvite = {
  id: string;
  token: string;
  email: string | null;
  role: Exclude<OrganizationRole, "owner">;
  max_uses: number;
  uses: number;
  expires_at: string;
  created_at: string;
  invited_by: string | null;
};

async function authHeader(): Promise<Record<string, string>> {
  const sb = supabaseBrowser();
  if (!sb) return {};
  const { data } = await sb.auth.getSession();
  const t = data.session?.access_token;
  return t ? { Authorization: `Bearer ${t}` } : {};
}

async function call<T>(path: string, init?: RequestInit): Promise<({ ok: true } & T) | { ok: false; error: string }> {
  try {
    const res = await fetch(path, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        "Content-Type": "application/json",
        ...(await authHeader()),
      },
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || body.ok === false) {
      return { ok: false, error: (body.error as string) ?? `http_${res.status}` };
    }
    return { ok: true, ...(body as T) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export const orgApi = {
  // Collection
  list: (opts?: { includePublic?: boolean }) =>
    call<{ mine: Organization[]; public: Organization[] }>(
      `/api/v2/organizations${opts?.includePublic ? "?include=public" : ""}`,
    ),
  create: (body: {
    name: string;
    kind?: OrganizationKind;
    description?: string;
    country?: string;
    city?: string;
    website_url?: string | null;
    institution_domain?: string;
    is_public?: boolean;
  }) =>
    call<{ organization: Organization }>(
      `/api/v2/organizations`,
      { method: "POST", body: JSON.stringify(body) },
    ),

  // Single
  get: (id: string) =>
    call<{ organization: Organization; myRole: OrganizationRole }>(`/api/v2/organizations/${id}`),
  patch: (id: string, body: Partial<Organization>) =>
    call<{ organization: Organization }>(
      `/api/v2/organizations/${id}`,
      { method: "PATCH", body: JSON.stringify(body) },
    ),
  delete: (id: string) =>
    call(`/api/v2/organizations/${id}`, { method: "DELETE" }),

  // Public read
  getPublic: (slug: string) =>
    call<{ organization: Organization; counts: { members: number; cohorts: number } }>(
      `/api/v2/organizations/public/${encodeURIComponent(slug)}`,
    ),

  // Members
  listMembers: (id: string) =>
    call<{ members: OrganizationMember[]; ownerUserId: string | null; myRole: OrganizationRole }>(
      `/api/v2/organizations/${id}/members`,
    ),
  setMemberRole: (id: string, userId: string, role: Exclude<OrganizationRole, "owner">) =>
    call(`/api/v2/organizations/${id}/members`, {
      method: "PATCH",
      body: JSON.stringify({ user_id: userId, role }),
    }),
  removeMember: (id: string, userId: string) =>
    call(`/api/v2/organizations/${id}/members?userId=${encodeURIComponent(userId)}`, {
      method: "DELETE",
    }),

  // Invites
  listInvites: (id: string) =>
    call<{ results: OrganizationInvite[] }>(`/api/v2/organizations/${id}/invites`),
  createInvite: (id: string, body: {
    email?: string | null;
    role?: Exclude<OrganizationRole, "owner">;
    maxUses?: number;
    expiresInDays?: number;
  }) =>
    call<{ invite: OrganizationInvite }>(
      `/api/v2/organizations/${id}/invites`,
      { method: "POST", body: JSON.stringify(body) },
    ),
  revokeInvite: (id: string, inviteId: string) =>
    call(`/api/v2/organizations/${id}/invites?inviteId=${encodeURIComponent(inviteId)}`, {
      method: "DELETE",
    }),

  // Accept-invite
  peekInvite: (token: string, authed = false) =>
    call<{
      organization: Pick<Organization, "id" | "slug" | "name" | "kind" | "description" | "logo_url" | "country" | "city" | "is_verified">;
      invite: { role: OrganizationRole; emailTargeted: boolean; expiresAt: string; usesLeft: number };
      alreadyMember: boolean;
    }>(`/api/v2/organizations/accept-invite?token=${encodeURIComponent(token)}${authed ? "&authed=1" : ""}`),
  claimInvite: (token: string) =>
    call<{ organizationId: string; role: OrganizationRole; alreadyMember: boolean; emailMismatch?: boolean }>(
      `/api/v2/organizations/accept-invite`,
      { method: "POST", body: JSON.stringify({ token }) },
    ),

  // Analytics rollup (Phase 58)
  analytics: (id: string) =>
    call<{ rollup: import("@/lib/org-analytics").OrgRollup }>(`/api/v2/organizations/${id}/analytics`),
};

// Pure mirror of hasOrganizationRole from organization-auth.ts but
// usable on the client without pulling in the supabase admin import.
const RANKS: Record<OrganizationRole, number> = { observer: 1, staff: 2, instructor: 3, admin: 4, owner: 5 };
export function clientHasOrgRole(role: OrganizationRole | null | undefined, minimum: OrganizationRole): boolean {
  if (!role) return false;
  return RANKS[role] >= RANKS[minimum];
}
