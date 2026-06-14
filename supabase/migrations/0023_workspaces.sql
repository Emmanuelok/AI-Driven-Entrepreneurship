-- ─────────────────────────────────────────────────────────────────────────
-- 0023 — Workspaces: a generalized collaboration primitive.
--
-- The platform already has per-feature collaboration tables
-- (cloud_ventures, cloud_builds, cloud_flows, …). Each grew the same
-- shape independently: members + invites + presence + activity. This
-- migration introduces ONE polymorphic surface that any future
-- collaborative object can plug into:
--
--   workspaces            — the object (study group, project, paper,
--                           any team space). `kind` keeps it open.
--   workspace_members     — who's in and at what role.
--   workspace_invites     — pending invites. We support TWO modes:
--                           (a) email-targeted, like the venture flow;
--                           (b) link-only (email is null), so anyone
--                               who holds the URL can claim the seat
--                               up to `max_uses` times.
--   workspace_deadlines   — first-class deadlines set by anyone with
--                           the standing to set them: the user
--                           themselves, an instructor / mentor in the
--                           same workspace, or an external authority
--                           (funder / investor / journal) recorded as
--                           the `set_by_role`. Cron walks this table.
--   workspace_activity    — append-only event stream so members can
--                           see "Ama joined", "deadline added", etc.
--                           without polling each other's clients.
--
-- The venture / build / flow tables stay untouched. Migrating them is
-- a future job; new collaborative features can simply use this one.
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.workspaces (
  id text primary key,                                   -- nanoid, matches client
  owner_id uuid not null references auth.users(id) on delete cascade,
  -- Open-ended `kind` so new collaborative features don't need a
  -- migration to use this table. Known values: study_group, project,
  -- research, learning_session, paper, generic.
  kind text not null default 'generic',
  title text not null default 'Untitled workspace',
  description text not null default '',
  -- Visual accent for the workspace card — picks a hue from the
  -- platform palette without forcing every consumer to model it.
  accent text not null default 'emerald',                -- emerald|amber|indigo|rust
  -- Visibility:
  --   private  — only members see it. Invites are explicit.
  --   link     — members + anyone holding an active invite link.
  --   public   — discoverable in a workspaces directory (future).
  visibility text not null default 'private',
  -- Free-form JSON payload — a workspace can carry its own state
  -- (study topic, attached papers, project goals) without yet another
  -- table. Same pattern as cloud_ventures.data.
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_workspaces_owner on public.workspaces(owner_id, updated_at desc);
create index if not exists idx_workspaces_kind on public.workspaces(kind);

-- ── Members ─────────────────────────────────────────────────────────────
create table if not exists public.workspace_members (
  workspace_id text not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- owner: full control, can delete the workspace.
  -- admin: can invite, manage deadlines, manage members.
  -- editor: can edit content + deadlines for self.
  -- viewer: read-only + comment.
  role text not null default 'editor',
  email text,
  display_name text,
  invited_by uuid references auth.users(id) on delete set null,
  joined_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index if not exists idx_workspace_members_user on public.workspace_members(user_id);

-- ── Invites ─────────────────────────────────────────────────────────────
-- email IS NULL  →  link-only invite. Anyone holding the URL can claim
-- a seat (until uses ≥ max_uses or expires_at passes). This is the
-- "share this link with your friend" flow the user asked for.
create table if not exists public.workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.workspaces(id) on delete cascade,
  email text,                                            -- null = link-only
  role text not null default 'editor',
  token text not null unique default encode(gen_random_bytes(18), 'base64'),
  invited_by uuid not null references auth.users(id) on delete cascade,
  -- Multi-use link: link-only invites can be claimed up to max_uses
  -- times. Email-targeted invites are single-use (max_uses defaults
  -- to 1; the route enforces it).
  max_uses int not null default 1,
  uses int not null default 0,
  expires_at timestamptz not null default (now() + interval '14 days'),
  created_at timestamptz not null default now()
);

create index if not exists idx_workspace_invites_workspace on public.workspace_invites(workspace_id);
create index if not exists idx_workspace_invites_token on public.workspace_invites(token);

-- ── Deadlines ───────────────────────────────────────────────────────────
-- Any workspace member can read; admins set workspace-wide deadlines,
-- and any member can attach self-set deadlines (set_by_role = 'self').
-- `set_by_role` is the source-of-authority label:
--   self       — the user set it on themselves
--   admin      — set by a workspace admin/owner for everyone or one user
--   instructor — set by a course instructor (admin role + instructor flag)
--   funder     — recorded for a funding-imposed deadline
--   investor   — recorded for an investor-imposed deadline
--   journal    — for a journal review deadline
--   mentor     — for a mentor-imposed milestone
create table if not exists public.workspace_deadlines (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.workspaces(id) on delete cascade,
  -- null assignee = applies to every workspace member (e.g. cohort
  -- assignment, journal revision deadline).
  assignee_user_id uuid references auth.users(id) on delete cascade,
  title text not null,
  detail text not null default '',
  due_at timestamptz not null,
  set_by_user_id uuid references auth.users(id) on delete set null,
  set_by_role text not null default 'self',
  status text not null default 'open',                   -- open|done|missed|cancelled
  -- Reminder bookkeeping for the cron job — null means "remind on the
  -- standard 7d / 3d / 1d / 6h schedule". `last_reminded_at` lets the
  -- cron be idempotent across runs.
  last_reminded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_workspace_deadlines_due on public.workspace_deadlines(due_at, status);
create index if not exists idx_workspace_deadlines_workspace on public.workspace_deadlines(workspace_id);
create index if not exists idx_workspace_deadlines_assignee on public.workspace_deadlines(assignee_user_id);

-- ── Activity stream ─────────────────────────────────────────────────────
create table if not exists public.workspace_activity (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  -- Open-ended kind so the agentic-flow watcher can plug in new
  -- triggers without a migration. Known: joined, left, deadline_added,
  -- deadline_done, deadline_missed, content_edit, agent_run, comment.
  kind text not null,
  title text not null,
  body text,
  created_at timestamptz not null default now()
);

create index if not exists idx_workspace_activity_workspace on public.workspace_activity(workspace_id, created_at desc);

-- ─── RLS ─────────────────────────────────────────────────────────────────
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_invites enable row level security;
alter table public.workspace_deadlines enable row level security;
alter table public.workspace_activity enable row level security;

drop policy if exists "workspaces_member_read" on public.workspaces;
create policy "workspaces_member_read" on public.workspaces for select using (
  visibility = 'public'
  or auth.uid() = owner_id
  or auth.uid() in (select user_id from public.workspace_members where workspace_id = workspaces.id)
);

drop policy if exists "workspaces_owner_insert" on public.workspaces;
create policy "workspaces_owner_insert" on public.workspaces for insert
  with check (auth.uid() = owner_id);

drop policy if exists "workspaces_member_write" on public.workspaces;
create policy "workspaces_member_write" on public.workspaces for update using (
  auth.uid() = owner_id
  or auth.uid() in (select user_id from public.workspace_members where workspace_id = workspaces.id and role in ('owner','admin','editor'))
) with check (
  auth.uid() = owner_id
  or auth.uid() in (select user_id from public.workspace_members where workspace_id = workspaces.id and role in ('owner','admin','editor'))
);

drop policy if exists "workspaces_owner_delete" on public.workspaces;
create policy "workspaces_owner_delete" on public.workspaces for delete using (auth.uid() = owner_id);

drop policy if exists "workspace_members_member_read" on public.workspace_members;
create policy "workspace_members_member_read" on public.workspace_members for select using (
  auth.uid() = user_id
  or auth.uid() in (select user_id from public.workspace_members m2 where m2.workspace_id = workspace_members.workspace_id)
  or auth.uid() in (select owner_id from public.workspaces where id = workspace_members.workspace_id)
);

drop policy if exists "workspace_members_self_leave" on public.workspace_members;
create policy "workspace_members_self_leave" on public.workspace_members for delete using (auth.uid() = user_id);

-- Invites: only admins/owners of the workspace can see them.
drop policy if exists "workspace_invites_admin_read" on public.workspace_invites;
create policy "workspace_invites_admin_read" on public.workspace_invites for select using (
  auth.uid() in (select owner_id from public.workspaces where id = workspace_invites.workspace_id)
  or auth.uid() in (select user_id from public.workspace_members where workspace_id = workspace_invites.workspace_id and role in ('owner','admin'))
);

-- Deadlines: every workspace member can read; route layer gates writes.
drop policy if exists "workspace_deadlines_member_read" on public.workspace_deadlines;
create policy "workspace_deadlines_member_read" on public.workspace_deadlines for select using (
  auth.uid() in (select user_id from public.workspace_members where workspace_id = workspace_deadlines.workspace_id)
  or auth.uid() in (select owner_id from public.workspaces where id = workspace_deadlines.workspace_id)
);

drop policy if exists "workspace_activity_member_read" on public.workspace_activity;
create policy "workspace_activity_member_read" on public.workspace_activity for select using (
  auth.uid() in (select user_id from public.workspace_members where workspace_id = workspace_activity.workspace_id)
  or auth.uid() in (select owner_id from public.workspaces where id = workspace_activity.workspace_id)
);

-- ── Triggers ────────────────────────────────────────────────────────────
create or replace function public.touch_workspace() returns trigger as $$
begin new.updated_at = now(); return new; end$$ language plpgsql;

drop trigger if exists touch_workspace_trg on public.workspaces;
create trigger touch_workspace_trg before update on public.workspaces
  for each row execute function public.touch_workspace();

create or replace function public.touch_workspace_deadline() returns trigger as $$
begin new.updated_at = now(); return new; end$$ language plpgsql;

drop trigger if exists touch_workspace_deadline_trg on public.workspace_deadlines;
create trigger touch_workspace_deadline_trg before update on public.workspace_deadlines
  for each row execute function public.touch_workspace_deadline();

-- When a workspace is created the owner is implicitly its first member.
-- Doing this in a trigger means every route + every back-fill path is
-- consistent — no missing rows when an admin operation runs through
-- the service role.
create or replace function public.add_workspace_owner_as_member() returns trigger as $$
begin
  insert into public.workspace_members (workspace_id, user_id, role, email, display_name, invited_by)
  values (new.id, new.owner_id, 'owner', null, null, new.owner_id)
  on conflict do nothing;
  return new;
end$$ language plpgsql security definer;

drop trigger if exists add_workspace_owner_as_member_trg on public.workspaces;
create trigger add_workspace_owner_as_member_trg after insert on public.workspaces
  for each row execute function public.add_workspace_owner_as_member();

-- Realtime publication.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.workspaces; exception when others then null; end;
    begin alter publication supabase_realtime add table public.workspace_members; exception when others then null; end;
    begin alter publication supabase_realtime add table public.workspace_deadlines; exception when others then null; end;
    begin alter publication supabase_realtime add table public.workspace_activity; exception when others then null; end;
  end if;
end$$;

-- ── Helpers ─────────────────────────────────────────────────────────────
-- Same shape as is_venture_member: returns the role string or null.
create or replace function public.is_workspace_member(_workspace_id text, _user_id uuid)
returns text language sql stable as $$
  select case
    when exists (select 1 from public.workspaces where id = _workspace_id and owner_id = _user_id) then 'owner'
    when exists (select 1 from public.workspace_members where workspace_id = _workspace_id and user_id = _user_id) then
      (select role from public.workspace_members where workspace_id = _workspace_id and user_id = _user_id limit 1)
    else null
  end;
$$;
