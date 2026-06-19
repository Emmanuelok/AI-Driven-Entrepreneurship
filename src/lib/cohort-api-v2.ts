"use client";

import { supabaseBrowser } from "@/lib/supabase";
import type { CohortStatus, CohortKind, CohortVisibility, CohortMemberState } from "@/lib/cohort-state";
import type { CurriculumTrack, Module, TrackLevel } from "@/lib/curriculum-track";

// v2 additions to the cohort surface. The original cohort routes are
// untyped (raw fetch); this file types the v2 endpoints and the new
// fields. Returned shapes mirror the database columns.

export type CohortRow = {
  id: string;
  slug: string;
  owner_id: string;
  organization_id: string | null;
  name: string;
  description: string | null;
  institution: string | null;
  kind: CohortKind;
  status: CohortStatus;
  start_date: string | null;
  end_date: string | null;
  capacity: number | null;
  visibility: CohortVisibility;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type CohortMemberRow = {
  user_id: string;
  role: "owner" | "instructor" | "student";
  state: CohortMemberState;
  email: string | null;
  display_name: string | null;
  joined_at: string;
  completed_at: string | null;
  dropped_at: string | null;
};

export type CohortWorkspaceLink = {
  workspace_id: string;
  kind: "shared_room" | "team_project" | "per_student" | "other";
  added_at: string;
  workspace: {
    id: string;
    title: string;
    description: string;
    accent: string;
    kind: string;
    archived_at: string | null;
  } | null;
};

export type BulkInviteOutcome =
  | { email: string; status: "added" }
  | { email: string; status: "pending"; token: string }
  | { email: string; status: "skipped"; reason: "invalid" | "already_member" | "duplicate" };

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

export const cohortApiV2 = {
  // Cohorts under a specific org (org dashboard's Cohorts tab).
  listByOrg: (orgId: string) =>
    call<{ results: Array<CohortRow & { _counts: { students: number; instructors: number } }> }>(
      `/api/v2/organizations/${orgId}/cohorts`,
    ),

  // Create a new cohort. organizationId optional — when set, the
  // cohort attaches to the org and the caller needs instructor+ role
  // on it; when omitted, the cohort is standalone (v1 behavior).
  create: (body: {
    name: string;
    description?: string;
    organizationId?: string;
    kind?: CohortKind;
    status?: CohortStatus;
    visibility?: CohortVisibility;
    startDate?: string;
    endDate?: string;
    capacity?: number;
  }) =>
    call<{ cohortId: string; slug: string }>(`/api/v2/cohorts`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  // v2 patch endpoint — same path as the existing cohort PATCH but
  // accepts all the new fields. Status transitions get gated server-
  // side by canTransitionStatus.
  patch: (cohortId: string, body: Partial<{
    name: string;
    description: string;
    kind: CohortKind;
    visibility: CohortVisibility;
    status: CohortStatus;
    startDate: string | null;
    endDate: string | null;
    capacity: number | null;
    organizationId: string | null;
  }>) =>
    call<{ cohort: CohortRow }>(`/api/v2/cohorts/${cohortId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  // Public read by slug. /c/[slug] uses this — no auth required.
  getPublic: (slug: string) =>
    call<{
      cohort: CohortRow;
      organization: { id: string; slug: string; name: string; kind: string; logo_url: string | null; is_verified: boolean } | null;
      counts: { occupied: number };
    }>(`/api/v2/cohorts/public/${encodeURIComponent(slug)}`),

  // Bulk invite paste-flow.
  bulkInvite: (cohortId: string, emails: string[], role: "student" | "instructor" = "student") =>
    call<{
      counts: { added: number; pending: number; skipped: number };
      outcomes: BulkInviteOutcome[];
    }>(`/api/v2/cohorts/${cohortId}/invites/bulk`, {
      method: "POST",
      body: JSON.stringify({ emails, role }),
    }),

  // Member state transitions (instructor+).
  setMemberState: (cohortId: string, userId: string, state: CohortMemberState) =>
    call(`/api/v2/cohorts/${cohortId}/members`, {
      method: "PATCH",
      body: JSON.stringify({ userId, state }),
    }),

  // Workspace bridge.
  listWorkspaces: (cohortId: string) =>
    call<{ results: CohortWorkspaceLink[] }>(`/api/v2/cohorts/${cohortId}/workspaces`),
  attachWorkspace: (cohortId: string, workspaceId: string, kind?: CohortWorkspaceLink["kind"]) =>
    call(`/api/v2/cohorts/${cohortId}/workspaces`, {
      method: "POST",
      body: JSON.stringify({ workspaceId, kind }),
    }),
  detachWorkspace: (cohortId: string, workspaceId: string) =>
    call(`/api/v2/cohorts/${cohortId}/workspaces?workspaceId=${encodeURIComponent(workspaceId)}`, {
      method: "DELETE",
    }),

  // ── Curriculum (Phase 57) ────────────────────────────────────────
  getCurriculum: (cohortId: string) =>
    call<{
      adopted: { link: { track_id: string; started_at: string | null; customizations: Record<string, unknown>; created_at: string }; track: CurriculumTrack } | null;
    }>(`/api/v2/cohorts/${cohortId}/curriculum`),
  adoptTrack: (cohortId: string, trackId: string, startedAt?: string) =>
    call(`/api/v2/cohorts/${cohortId}/curriculum`, {
      method: "POST",
      body: JSON.stringify({ trackId, startedAt }),
    }),
  detachCurriculum: (cohortId: string) =>
    call(`/api/v2/cohorts/${cohortId}/curriculum`, { method: "DELETE" }),
};

// Library API (Phase 57). Distinct from cohortApiV2 because tracks
// live outside any single cohort — they're discoverable, forkable
// assets in their own right.
export const curriculumApi = {
  list: () =>
    call<{ mine: CurriculumTrack[]; public: CurriculumTrack[] }>(`/api/v2/curriculum/tracks`),
  create: (body: {
    title: string;
    tagline?: string;
    description?: string;
    pillar?: string;
    level?: TrackLevel;
    duration_hours?: number;
    organization_id?: string | null;
    modules?: Module[];
  }) =>
    call<{ track: CurriculumTrack }>(`/api/v2/curriculum/tracks`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  get: (idOrSlug: string) =>
    call<{ track: CurriculumTrack }>(`/api/v2/curriculum/tracks/${encodeURIComponent(idOrSlug)}`),
  patch: (idOrSlug: string, body: Partial<{
    title: string;
    tagline: string;
    description: string;
    pillar: string | null;
    level: TrackLevel;
    duration_hours: number | null;
    modules: Module[];
    is_published: boolean;
    is_public: boolean;
  }>) =>
    call<{ track: CurriculumTrack }>(`/api/v2/curriculum/tracks/${encodeURIComponent(idOrSlug)}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  delete: (idOrSlug: string) =>
    call(`/api/v2/curriculum/tracks/${encodeURIComponent(idOrSlug)}`, { method: "DELETE" }),
  fork: (idOrSlug: string, opts?: { organization_id?: string | null; title_override?: string }) =>
    call<{ track: CurriculumTrack }>(`/api/v2/curriculum/tracks/${encodeURIComponent(idOrSlug)}/fork`, {
      method: "POST",
      body: JSON.stringify(opts ?? {}),
    }),
};
