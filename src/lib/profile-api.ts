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
>;

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

  // Public profile by slug.
  getProfileBySlug: (slug: string) => call<{ profile: UserProfile }>(`/api/v2/profiles/${encodeURIComponent(slug)}`),

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

  // Respond to a received request.
  respondToContact: (id: string, status: "accepted" | "declined" | "archived", reply_body?: string) =>
    call<{ request: { id: string; status: string; reply_body: string | null; responded_at: string | null } }>(
      `/api/v2/me/contacts/${id}`,
      { method: "PATCH", body: JSON.stringify({ status, reply_body }) },
    ),
};
