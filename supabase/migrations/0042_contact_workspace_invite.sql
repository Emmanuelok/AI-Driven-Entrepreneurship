-- ─────────────────────────────────────────────────────────────────────────
-- 0042 — Workspace invite attached to a contact acceptance.
--
-- When a recipient accepts a contact request, they often want to
-- continue the conversation inside a shared workspace. We let them
-- attach a workspace_invite to their acceptance: the contact row
-- carries the invite_id + workspace_id so the SENDER's inbox renders
-- a "Join {Workspace} →" CTA wired to the existing /i/[token] flow.
--
-- The actual invite still lives in workspace_invites (its own RLS,
-- its own expiry, its own uses counter). These two columns are just a
-- cross-reference. We don't FK either of them so deleting an invite
-- (or its workspace) leaves the contact row intact — the sender's
-- inbox will just stop being able to redeem the link, which is the
-- right behavior.
-- ─────────────────────────────────────────────────────────────────────────

alter table public.profile_contacts
  add column if not exists invite_workspace_id uuid,
  add column if not exists invite_id uuid;

create index if not exists idx_profile_contacts_invite
  on public.profile_contacts(invite_id) where invite_id is not null;
