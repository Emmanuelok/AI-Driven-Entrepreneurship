"use client";

import { supabaseBrowser } from "@/lib/supabase";

// Thin, typed client over the /api/v2/workspaces/* routes.
//
// All calls forward the current Supabase session as a Bearer token so
// the server can resolve the caller. Each method returns a discriminated
// union — { ok: true, ... } | { ok: false, error } — so callers can
// branch without throwing.
//
// Kept dependency-free of zustand: hooks layer their own state on top.

export type WorkspaceKind = "study_group" | "project" | "research" | "learning_session" | "paper" | "generic";
export type WorkspaceAccent = "emerald" | "amber" | "indigo" | "rust";
export type WorkspaceVisibility = "private" | "link" | "public";
export type WorkspaceRole = "owner" | "admin" | "editor" | "viewer";
export type DeadlineAuthority = "self" | "admin" | "instructor" | "funder" | "investor" | "journal" | "mentor";
export type DeadlineStatus = "open" | "done" | "missed" | "cancelled";

export type Workspace = {
  id: string;
  owner_id: string;
  kind: WorkspaceKind;
  title: string;
  description: string;
  accent: WorkspaceAccent;
  visibility: WorkspaceVisibility;
  data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type WorkspaceMember = {
  workspace_id: string;
  user_id: string;
  role: WorkspaceRole;
  email: string | null;
  display_name: string | null;
  invited_by: string | null;
  joined_at: string;
};

export type WorkspaceInvite = {
  id: string;
  workspace_id: string;
  email: string | null;
  role: Exclude<WorkspaceRole, "owner">;
  token: string;
  max_uses: number;
  uses: number;
  expires_at: string;
  created_at: string;
};

export type RecurrenceRule = {
  freq: "daily" | "weekly" | "monthly";
  interval?: number;
  byDay?: ("SU" | "MO" | "TU" | "WE" | "TH" | "FR" | "SA")[];
  until?: string;
  count?: number;
};

export type WorkspaceDeadline = {
  id: string;
  workspace_id: string;
  assignee_user_id: string | null;
  title: string;
  detail: string;
  due_at: string;
  set_by_user_id: string | null;
  set_by_role: DeadlineAuthority;
  status: DeadlineStatus;
  last_reminded_at: string | null;
  recurrence_rule: RecurrenceRule | null;
  occurrences_completed: number;
  created_at: string;
  updated_at: string;
};

export type WorkspaceActivity = {
  id: string;
  workspace_id: string;
  user_id: string | null;
  kind: string;
  title: string;
  body: string | null;
  created_at: string;
};

export type WorkspaceMessage = {
  id: string;
  workspace_id: string;
  user_id: string | null;
  author_name: string | null;
  body: string;
  is_agent: boolean;
  mentions: string[];
  created_at: string;
};

export type WorkspaceDocMeta = {
  id: string;
  workspace_id: string;
  title: string;
  updated_by_name: string | null;
  version: number;
  updated_at: string;
  created_at: string;
};

export type WorkspaceDoc = WorkspaceDocMeta & {
  body: string;
  updated_by: string | null;
};

export type SearchHit = {
  kind: "message" | "note" | "task" | "deadline" | "file";
  id: string;
  title: string;
  snippet: string;
  meta: string;
  ts: string;
};

export type ParsedDeadline = {
  title: string;
  dueAt: string | null;
  setByRole: DeadlineAuthority;
  detail: string;
};

export type TaskStatus = "todo" | "doing" | "done" | "blocked";

export type AttachmentKind = "task" | "doc" | "message";

export type WorkspaceFile = {
  id: string;
  workspace_id: string;
  uploaded_by: string | null;
  uploaded_by_name: string | null;
  name: string;
  path: string;
  size_bytes: number;
  content_type: string;
  attached_to_kind: AttachmentKind | null;
  attached_to_id: string | null;
  created_at: string;
  downloadUrl: string | null;
};

export type UploadGrant = {
  signedUrl: string;
  token: string;
  path: string;
  name: string;
  contentType: string;
  sizeBytes: number;
  attachedToKind: AttachmentKind | null;
  attachedToId: string | null;
  bucket: string;
};

export type WorkspaceTask = {
  id: string;
  workspace_id: string;
  title: string;
  detail: string;
  status: TaskStatus;
  assignee_user_id: string | null;
  assignee_name: string | null;
  position: number;
  due_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type WorkspaceListing = {
  id: string;
  title: string;
  description: string;
  kind: WorkspaceKind;
  accent: WorkspaceAccent;
  visibility: WorkspaceVisibility;
  updated_at: string;
  created_at: string;
  owner_id: string;
  role: WorkspaceRole;
};

type Ok<T> = { ok: true } & T;
type Err = { ok: false; error: string };

async function authHeader(): Promise<Record<string, string>> {
  const sb = supabaseBrowser();
  if (!sb) return {};
  const { data } = await sb.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function call<T>(path: string, init?: RequestInit): Promise<Ok<T> | Err> {
  try {
    const res = await fetch(path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(await authHeader()),
        ...(init?.headers || {}),
      },
    });
    const json = (await res.json()) as Ok<T> | Err;
    return json;
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export const workspaceApi = {
  list: () => call<{ results: WorkspaceListing[] }>("/api/v2/workspaces"),

  create: (payload: { id?: string; title: string; description?: string; kind?: WorkspaceKind; accent?: WorkspaceAccent; visibility?: WorkspaceVisibility; data?: Record<string, unknown> }) =>
    call<{ id: string }>("/api/v2/workspaces", { method: "POST", body: JSON.stringify(payload) }),

  get: (id: string) =>
    call<{ workspace: Workspace; members: WorkspaceMember[]; deadlines: WorkspaceDeadline[]; activity: WorkspaceActivity[]; invites: WorkspaceInvite[]; myRole: WorkspaceRole }>(`/api/v2/workspaces/${id}`),

  patch: (id: string, patch: { title?: string; description?: string; accent?: WorkspaceAccent; visibility?: WorkspaceVisibility; data?: Record<string, unknown> }) =>
    call(`/api/v2/workspaces/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),

  remove: (id: string) =>
    call(`/api/v2/workspaces/${id}`, { method: "DELETE" }),

  invite: (id: string, payload: { email?: string | null; role?: Exclude<WorkspaceRole, "owner">; maxUses?: number; expiresInDays?: number }) =>
    call<{ invite: WorkspaceInvite }>(`/api/v2/workspaces/${id}/invites`, { method: "POST", body: JSON.stringify(payload) }),

  revokeInvite: (id: string, inviteId: string) =>
    call(`/api/v2/workspaces/${id}/invites?inviteId=${encodeURIComponent(inviteId)}`, { method: "DELETE" }),

  changeRole: (id: string, userId: string, role: Exclude<WorkspaceRole, "owner">) =>
    call(`/api/v2/workspaces/${id}/members`, { method: "PATCH", body: JSON.stringify({ userId, role }) }),

  removeMember: (id: string, userId: string) =>
    call(`/api/v2/workspaces/${id}/members?userId=${encodeURIComponent(userId)}`, { method: "DELETE" }),

  addDeadline: (id: string, payload: { title: string; detail?: string; dueAt: string; assigneeUserId?: string | null; setByRole?: DeadlineAuthority; recurrenceRule?: RecurrenceRule | null }) =>
    call<{ deadline: WorkspaceDeadline }>(`/api/v2/workspaces/${id}/deadlines`, { method: "POST", body: JSON.stringify(payload) }),

  patchDeadline: (id: string, payload: { id: string; title?: string; detail?: string; dueAt?: string; status?: DeadlineStatus }) =>
    call(`/api/v2/workspaces/${id}/deadlines`, { method: "PATCH", body: JSON.stringify(payload) }),

  deleteDeadline: (id: string, deadlineId: string) =>
    call(`/api/v2/workspaces/${id}/deadlines?deadlineId=${encodeURIComponent(deadlineId)}`, { method: "DELETE" }),

  peekInvite: (token: string) =>
    call<{ workspace: { id: string; title: string; description: string; kind: WorkspaceKind; accent: WorkspaceAccent; owner_id: string; memberCount: number }; invite: { role: WorkspaceRole; emailTargeted: boolean; expiresAt: string; usesLeft: number }; alreadyMember: boolean }>(`/api/v2/workspaces/accept-invite?token=${encodeURIComponent(token)}&peek=1`),

  probeInvite: (token: string) =>
    call<{ workspace: { id: string; title: string; description: string; kind: WorkspaceKind; accent: WorkspaceAccent; owner_id: string; memberCount: number }; invite: { role: WorkspaceRole; emailTargeted: boolean; expiresAt: string; usesLeft: number }; alreadyMember: boolean }>(`/api/v2/workspaces/accept-invite?token=${encodeURIComponent(token)}`),

  acceptInvite: (token: string) =>
    call<{ workspaceId: string; role: WorkspaceRole; alreadyMember: boolean; emailMismatch?: boolean }>(`/api/v2/workspaces/accept-invite`, { method: "POST", body: JSON.stringify({ token }) }),

  // ── Discussion ──────────────────────────────────────────────────────
  listMessages: (id: string, before?: string) =>
    call<{ results: WorkspaceMessage[] }>(`/api/v2/workspaces/${id}/messages${before ? `?before=${encodeURIComponent(before)}` : ""}`),

  sendMessage: (id: string, body: string, siteContext?: unknown) =>
    call<{ message: WorkspaceMessage; agentReply: WorkspaceMessage | null }>(`/api/v2/workspaces/${id}/messages`, { method: "POST", body: JSON.stringify({ body, siteContext }) }),

  // ── Notes ───────────────────────────────────────────────────────────
  listDocs: (id: string) =>
    call<{ results: WorkspaceDocMeta[] }>(`/api/v2/workspaces/${id}/docs`),

  createDoc: (id: string, title?: string) =>
    call<{ doc: WorkspaceDoc }>(`/api/v2/workspaces/${id}/docs`, { method: "POST", body: JSON.stringify({ title }) }),

  getDoc: (id: string, docId: string) =>
    call<{ doc: WorkspaceDoc }>(`/api/v2/workspaces/${id}/docs/${docId}`),

  saveDoc: (id: string, docId: string, payload: { title?: string; body?: string; version: number }) =>
    call<{ doc: WorkspaceDoc }>(`/api/v2/workspaces/${id}/docs/${docId}`, { method: "PATCH", body: JSON.stringify(payload) }),

  deleteDoc: (id: string, docId: string) =>
    call(`/api/v2/workspaces/${id}/docs/${docId}`, { method: "DELETE" }),

  // ── Tasks ───────────────────────────────────────────────────────────
  listTasks: (id: string) =>
    call<{ results: WorkspaceTask[] }>(`/api/v2/workspaces/${id}/tasks`),

  addTask: (id: string, payload: { title: string; detail?: string; status?: TaskStatus; assigneeUserId?: string | null; dueAt?: string | null }) =>
    call<{ task: WorkspaceTask }>(`/api/v2/workspaces/${id}/tasks`, { method: "POST", body: JSON.stringify(payload) }),

  patchTask: (id: string, payload: { id: string; title?: string; detail?: string; status?: TaskStatus; assigneeUserId?: string | null; position?: number; dueAt?: string | null }) =>
    call<{ task: WorkspaceTask }>(`/api/v2/workspaces/${id}/tasks`, { method: "PATCH", body: JSON.stringify(payload) }),

  deleteTask: (id: string, taskId: string) =>
    call(`/api/v2/workspaces/${id}/tasks?taskId=${encodeURIComponent(taskId)}`, { method: "DELETE" }),

  // ── Files ───────────────────────────────────────────────────────────
  listFiles: (id: string, filter?: { attachedToKind?: AttachmentKind | "null"; attachedToId?: string }) => {
    const params = new URLSearchParams();
    if (filter?.attachedToKind) params.set("attachedToKind", filter.attachedToKind);
    if (filter?.attachedToId) params.set("attachedToId", filter.attachedToId);
    const qs = params.toString();
    return call<{ results: WorkspaceFile[] }>(`/api/v2/workspaces/${id}/files${qs ? `?${qs}` : ""}`);
  },

  // Two-step upload. We don't proxy bytes through our backend — the
  // client PUTs directly to Supabase Storage via the signed URL, then
  // confirms with registerFile() so the metadata row exists.
  signFileUpload: (id: string, payload: { filename: string; contentType: string; sizeBytes: number; attachedToKind?: AttachmentKind; attachedToId?: string }) =>
    call<{ upload: UploadGrant }>(`/api/v2/workspaces/${id}/files/upload-url`, { method: "POST", body: JSON.stringify(payload) }),

  registerFile: (id: string, payload: { path: string; name: string; sizeBytes: number; contentType: string; attachedToKind?: AttachmentKind; attachedToId?: string }) =>
    call<{ file: WorkspaceFile }>(`/api/v2/workspaces/${id}/files`, { method: "POST", body: JSON.stringify(payload) }),

  deleteFile: (id: string, fileId: string) =>
    call(`/api/v2/workspaces/${id}/files?fileId=${encodeURIComponent(fileId)}`, { method: "DELETE" }),

  // ── Search ──────────────────────────────────────────────────────────
  search: (id: string, q: string) =>
    call<{ q: string; results: SearchHit[] }>(`/api/v2/workspaces/${id}/search?q=${encodeURIComponent(q)}`),

  // ── AI synthesis ────────────────────────────────────────────────────
  synthesize: (id: string, postToDiscussion: boolean, siteContext?: unknown) =>
    call<{ brief: string; generatedAt: number; empty?: boolean; fallback?: boolean }>(`/api/v2/workspaces/${id}/synthesize`, {
      method: "POST",
      body: JSON.stringify({ postToDiscussion, siteContext }),
    }),

  // ── Smart deadline ──────────────────────────────────────────────────
  // Bespoke (not the { ok } envelope): /api/generate/* routes return the
  // bare object. Resolves to null on any failure so the UI can fall back
  // to manual entry.
  parseDeadline: async (text: string, isAdmin: boolean): Promise<ParsedDeadline | null> => {
    try {
      const res = await fetch(`/api/generate/parse-deadline`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({
          text,
          nowIso: new Date().toISOString(),
          tzOffsetMinutes: -new Date().getTimezoneOffset(),
          isAdmin,
        }),
      });
      const json = (await res.json()) as Partial<ParsedDeadline> & { error?: string };
      if (json.error || !json.title) return null;
      return {
        title: json.title,
        dueAt: json.dueAt ?? null,
        setByRole: (json.setByRole as DeadlineAuthority) ?? "self",
        detail: json.detail ?? "",
      };
    } catch {
      return null;
    }
  },
};

// The share URL we hand a user when they generate an invite. Built
// purely client-side so we don't need to round-trip through a route
// just to learn the origin.
export function inviteShareUrl(token: string): string {
  if (typeof window === "undefined") return `/i/${token}`;
  return `${window.location.origin}/i/${token}`;
}
