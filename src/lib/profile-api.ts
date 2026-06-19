"use client";

import { supabaseBrowser } from "@/lib/supabase";
import type { AccountType } from "@/lib/account-types";

// Thin typed client over /api/v2/me/profile + /api/v2/profiles.
// Mirrors the patterns in workspace-api.ts: all calls forward the
// Supabase access token as a bearer, all return discriminated unions.

export type UserProfile = {
  user_id: string;
  slug: string | null;
  account_type: AccountType;
  display_name: string;
  headline: string;
  bio: string;
  country: string;
  city: string;
  primary_language: string;
  avatar_url: string | null;
  website_url: string | null;
  linkedin_url: string | null;
  twitter_url: string | null;
  persona_data: Record<string, unknown>;
  is_public: boolean;
  contact_policy: "open" | "institution" | "closed";
  created_at: string;
  updated_at: string;
};

export type ProfileSummary = Pick<
  UserProfile,
  "user_id" | "slug" | "account_type" | "display_name" | "headline" | "country" | "city" | "avatar_url" | "persona_data" | "contact_policy"
> & { verified?: boolean };

export type VerifiedState = {
  institution_email: boolean;
  id_check: boolean;
  admin_verified: boolean;
  attestation_count: number;
  verified: boolean;
};

export type Attestation = {
  id: string;
  kind: "mentor" | "founder" | "investor" | "instructor" | "funder" | "collaborator";
  body: string;
  created_at: string;
  attestor: { display_name: string; slug: string | null; account_type: string };
};

export type Verification = {
  id: string;
  kind: "email_institution" | "id_check" | "linkedin" | "admin";
  status: "pending" | "verified" | "rejected" | "expired";
  evidence: Record<string, unknown>;
  verified_at: string | null;
  created_at: string;
};

export type ContactRequest = {
  id: string;
  from_user_id: string;
  to_user_id: string;
  from_name: string;
  from_account_type: string;
  context: string;
  subject: string;
  body: string;
  status: "pending" | "accepted" | "declined" | "archived";
  reply_body: string | null;
  created_at: string;
  responded_at: string | null;
  read_by_recipient: boolean;
  // Workspace invite attached to the acceptance, if any. Only the
  // SENT list carries the hydrated invite_token + invite_workspace
  // (the recipient already has full workspace context, so the list
  // skips that fetch for them).
  invite_id?: string | null;
  invite_workspace_id?: string | null;
  invite_token?: string | null;
  invite_workspace?: { id: string; title: string; accent: string } | null;
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
      headers: { ...(init?.headers ?? {}), "Content-Type": "application/json", ...(await authHeader()) },
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

export const profileApi = {
  // Own profile — read + patch.
  getMyProfile: () => call<{ profile: UserProfile }>(`/api/v2/me/profile`),
  patchMyProfile: (patch: Partial<UserProfile>) =>
    call<{ profile: UserProfile }>(`/api/v2/me/profile`, { method: "PATCH", body: JSON.stringify(patch) }),

  // Public profile by slug. v2 also returns the verified state and
  // the recent peer attestations so the profile page renders trust
  // signals next to the persona panel.
  getProfileBySlug: (slug: string) =>
    call<{ profile: UserProfile; verified: VerifiedState; attestations: Attestation[] }>(
      `/api/v2/profiles/${encodeURIComponent(slug)}`,
    ),

  // ── Trust layer ──────────────────────────────────────────────────
  listMyVerifications: () => call<{ results: Verification[] }>(`/api/v2/me/verifications`),
  startInstitutionVerification: (email: string, institutionLabel?: string) =>
    call<{ id: string; domain: string; institutionLabel: string; delivery: "live" | "local" }>(
      `/api/v2/me/verifications`,
      { method: "POST", body: JSON.stringify({ kind: "email_institution", email, institutionLabel }) },
    ),
  claimVerification: (token: string) =>
    call<{ alreadyVerified?: boolean; institutionLabel?: string }>(
      `/api/v2/me/verifications/${encodeURIComponent(token)}`,
      { method: "POST", body: "{}" },
    ),

  attestProfile: (slug: string, kind: Attestation["kind"], body: string) =>
    call<{ attestation: { id: string; body: string; created_at: string } }>(
      `/api/v2/profiles/${encodeURIComponent(slug)}/attest`,
      { method: "POST", body: JSON.stringify({ kind, body }) },
    ),
  unattestProfile: (slug: string, kind: Attestation["kind"]) =>
    call(
      `/api/v2/profiles/${encodeURIComponent(slug)}/attest?kind=${encodeURIComponent(kind)}`,
      { method: "DELETE" },
    ),

  // Directory listing with optional filters.
  listProfiles: (opts?: { type?: AccountType; country?: string; q?: string; limit?: number; offset?: number }) => {
    const params = new URLSearchParams();
    if (opts?.type) params.set("type", opts.type);
    if (opts?.country) params.set("country", opts.country);
    if (opts?.q) params.set("q", opts.q);
    if (opts?.limit) params.set("limit", String(opts.limit));
    if (opts?.offset) params.set("offset", String(opts.offset));
    const qs = params.toString();
    return call<{ results: ProfileSummary[]; total: number }>(`/api/v2/profiles${qs ? `?${qs}` : ""}`);
  },

  // ── Contact requests ─────────────────────────────────────────────
  // Send a cold intro to a profile owner (by slug). Server enforces
  // the recipient's contact policy.
  sendContactRequest: (slug: string, body: { body: string; subject?: string; context?: string }) =>
    call<{ request: { id: string; status: string; created_at: string } }>(
      `/api/v2/profiles/${encodeURIComponent(slug)}/contact`,
      { method: "POST", body: JSON.stringify(body) },
    ),

  // The caller's inbox — received + sent + unread count. Pass
  // markRead to clear the recipient unread watermark on view.
  getContacts: (markRead = false) =>
    call<{ received: ContactRequest[]; sent: ContactRequest[]; unread: number }>(
      `/api/v2/me/contacts${markRead ? "?markRead=1" : ""}`,
    ),

  // Respond to a received request. On accept, optionally attach a
  // workspace invite — server enforces that you must be admin+ on the
  // chosen workspace and mints the invite via the same workspace_invites
  // pipeline /studio/workspaces uses.
  respondToContact: (
    id: string,
    status: "accepted" | "declined" | "archived",
    opts?: { reply_body?: string; inviteWorkspaceId?: string; inviteRole?: "admin" | "editor" | "viewer" },
  ) =>
    call<{
      request: { id: string; status: string; reply_body: string | null; responded_at: string | null; invite_id: string | null; invite_workspace_id: string | null };
      invite: { id: string; token: string; workspaceId: string } | null;
    }>(
      `/api/v2/me/contacts/${id}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          status,
          reply_body: opts?.reply_body,
          inviteWorkspaceId: opts?.inviteWorkspaceId,
          inviteRole: opts?.inviteRole,
        }),
      },
    ),

  // ── Agentic Sage ─────────────────────────────────────────────────
  startAgentRun: (body: {
    agent_kind:
      | "outreach_drafter"
      | "research_brief"
      | "discussion_summary"
      | "venture_pitch_polish"
      | "grounded_query"
      | "workspace_grounded_query";
    title?: string;
    prompt?: string;
    input: Record<string, unknown>;
  }) =>
    call<{ id: string; status: string }>(`/api/v2/me/agent-runs`, { method: "POST", body: JSON.stringify(body) }),
  getAgentRun: (id: string) =>
    call<{ run: AgentRun }>(`/api/v2/me/agent-runs/${id}`),
  listAgentRuns: () =>
    call<{ results: AgentRunSummary[] }>(`/api/v2/me/agent-runs`),
  // DELETE on a run is "cancel-or-archive" depending on its status
  // (the server route handles both with one verb).
  deleteAgentRun: (id: string) =>
    call(`/api/v2/me/agent-runs/${id}`, { method: "DELETE" }),

  // ── Mentor sessions (Phase 64) ───────────────────────────────────
  listMentorSessions: () =>
    call<{ results: MentorSession[] }>(`/api/v2/mentor-sessions`),
  requestMentorSession: (body: {
    mentorSlug: string;
    topic: string;
    durationMinutes: 15 | 30 | 45 | 60 | 90;
    founderNotes?: string;
  }) =>
    call<{ session: MentorSession }>(`/api/v2/mentor-sessions`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  getMentorSession: (id: string) =>
    call<{ session: MentorSession }>(`/api/v2/mentor-sessions/${id}`),
  patchMentorSession: (id: string, body: Partial<{
    status: "accepted" | "completed" | "cancelled" | "refunded";
    founder_notes: string;
    mentor_notes: string;
    scheduled_at: string;
    review: { rating: number; body?: string };
  }>) =>
    call<{ session: MentorSession }>(`/api/v2/mentor-sessions/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  mentorSessionCheckout: (id: string) =>
    call<{ url?: string; sessionId?: string; alreadyPaid?: boolean }>(
      `/api/v2/mentor-sessions/${id}/checkout`,
      { method: "POST", body: "{}" },
    ),
};

export type MentorSession = {
  id: string;
  mentor_user_id: string;
  founder_user_id: string;
  status: "requested" | "accepted" | "paid" | "completed" | "reviewed" | "cancelled" | "refunded";
  duration_minutes: 15 | 30 | 45 | 60 | 90;
  scheduled_at: string | null;
  topic: string;
  founder_notes: string;
  mentor_notes: string;
  price_cents: number;
  currency: string;
  application_fee_pct: number;
  paid_at: string | null;
  accepted_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  refunded_at: string | null;
  review_rating: number | null;
  review_body: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AgentStep = {
  label: string;
  status: "running" | "done" | "failed";
  started_at: string;
  finished_at?: string;
  data?: unknown;
};

export type AgentRunSummary = {
  id: string;
  agent_kind: string;
  title: string;
  status: "pending" | "running" | "needs_approval" | "completed" | "failed" | "cancelled";
  output: Record<string, unknown> | null;
  steps: AgentStep[];
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
  approved_at: string | null;
  created_at: string;
};

export type AgentRun = AgentRunSummary & {
  user_id: string;
  prompt: string;
  input: Record<string, unknown>;
};
