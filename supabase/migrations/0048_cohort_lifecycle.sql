-- ─────────────────────────────────────────────────────────────────────────
-- 0048 — Cohorts: lifecycle, slug, visibility, state machine,
--         workspace bridge.
--
-- The existing cohorts table (0009) was minimal: name, description,
-- institution, owner, timestamps. Phase 56 adds the v2 lifecycle
-- vocabulary so the same row drives a real cohort through draft →
-- open (accepting students) → running → ended → archived; gives each
-- cohort a slug for /c/[slug] public pages; lets a cohort opt into
-- public discoverability; carries dates and capacity so the UI can
-- render "5 weeks remaining" or "3 seats left"; and links N workspaces
-- to a cohort (one shared room, per-team project rooms, per-student
-- private spaces).
--
-- cohort_members gains a state machine: invited → active →
-- completed | dropped. The role column (instructor | student) is
-- orthogonal — a student gets invited then becomes active then
-- completes; an instructor is always active.
-- ─────────────────────────────────────────────────────────────────────────

-- ─── cohorts.* additions ─────────────────────────────────────────────
alter table public.cohorts
  add column if not exists slug text,
  add column if not exists status text not null default 'running'
    check (status in ('draft', 'open', 'running', 'ended', 'archived')),
  add column if not exists kind text not null default 'course'
    check (kind in ('course', 'program', 'accelerator', 'bootcamp', 'study_group', 'other')),
  add column if not exists start_date date,
  add column if not exists end_date date,
  add column if not exists capacity int,
  add column if not exists visibility text not null default 'private'
    check (visibility in ('private', 'link', 'public')),
  add column if not exists settings jsonb not null default '{}'::jsonb;

-- Backfill slugs for existing v1 cohorts so the public-page surface
-- can address every row by slug (whether or not it ever goes public).
-- Slug = sanitized name + a 6-char id suffix to guarantee uniqueness
-- without an extra round-trip per row.
update public.cohorts
   set slug = lower(regexp_replace(coalesce(name, 'cohort'), '[^a-zA-Z0-9]+', '-', 'g'))
             || '-' || substring(id::text from 1 for 6)
 where slug is null;
alter table public.cohorts alter column slug set not null;

create unique index if not exists uniq_cohorts_slug on public.cohorts(slug);
create index if not exists idx_cohorts_status on public.cohorts(status, updated_at desc);
create index if not exists idx_cohorts_visibility on public.cohorts(visibility)
  where visibility = 'public';

-- Allow anyone authenticated to read PUBLIC cohorts so /c/[slug]
-- surfaces without member-only RLS gating. Members and owners are
-- already covered by the 0009 policy.
drop policy if exists "cohorts_public_read" on public.cohorts;
create policy "cohorts_public_read"
  on public.cohorts for select to authenticated
  using (visibility = 'public');


-- ─── cohort_members state machine ────────────────────────────────────
-- 'active' is the v1 default behavior — every existing row was an
-- accepted student or instructor with no state semantic. New invites
-- (via the bulk-invite flow) start at 'invited' and flip to 'active'
-- on accept.
alter table public.cohort_members
  add column if not exists state text not null default 'active'
    check (state in ('invited', 'active', 'dropped', 'completed')),
  add column if not exists completed_at timestamptz,
  add column if not exists dropped_at timestamptz;

create index if not exists idx_cohort_members_state
  on public.cohort_members(cohort_id, state);


-- ─── cohort_workspaces bridge ────────────────────────────────────────
-- One cohort can host many workspaces. A "shared room" is the cohort-
-- wide discussion; "team_project" is a per-team room (4-6 students);
-- "per_student" is a private space for individual work. The bridge
-- is owned by the cohort instructor flow — the workspace itself
-- still has its own members + RLS, this table just establishes the
-- pedagogical link so the cohort dashboard can surface its rooms.
create table if not exists public.cohort_workspaces (
  cohort_id uuid not null references public.cohorts(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind text not null default 'shared_room'
    check (kind in ('shared_room', 'team_project', 'per_student', 'other')),
  added_by uuid references auth.users(id) on delete set null,
  added_at timestamptz not null default now(),
  primary key (cohort_id, workspace_id)
);

create index if not exists idx_cohort_workspaces_workspace
  on public.cohort_workspaces(workspace_id);

alter table public.cohort_workspaces enable row level security;

-- Read: any cohort member OR any workspace member can see the link.
-- That way a workspace member can navigate to its cohort and a cohort
-- member sees the linked rooms even before they've joined them.
drop policy if exists "cohort_workspaces_member_read" on public.cohort_workspaces;
create policy "cohort_workspaces_member_read"
  on public.cohort_workspaces for select using (
    auth.uid() in (
      select user_id from public.cohort_members where cohort_id = cohort_workspaces.cohort_id
    )
    or auth.uid() in (
      select owner_id from public.cohorts where id = cohort_workspaces.cohort_id
    )
    or auth.uid() in (
      select user_id from public.workspace_members where workspace_id = cohort_workspaces.workspace_id
    )
  );

-- Writes via service-role API routes only.

-- Realtime so an instructor adding a workspace lights up the dashboard
-- everywhere immediately.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.cohort_workspaces; exception when others then null; end;
  end if;
end$$;
