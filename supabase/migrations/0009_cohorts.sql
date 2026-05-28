-- ─────────────────────────────────────────────────────────────────────────
-- Cohorts — institutions and accelerators managing groups of students.
-- Same role taxonomy as collaborative ventures/builds: owner (creator),
-- instructor, student. Owner is also an instructor by convention; the
-- distinction matters for who can delete the cohort entirely.
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.cohorts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  institution text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_cohorts_owner on public.cohorts(owner_id, updated_at desc);

create table if not exists public.cohort_members (
  cohort_id uuid not null references public.cohorts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'student',                -- 'instructor' | 'student'
  email text,
  display_name text,
  joined_at timestamptz not null default now(),
  primary key (cohort_id, user_id)
);
create index if not exists idx_cohort_members_user on public.cohort_members(user_id);

create table if not exists public.cohort_invites (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references public.cohorts(id) on delete cascade,
  email text not null,
  role text not null default 'student',
  token text not null unique default encode(gen_random_bytes(18), 'base64'),
  invited_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '30 days'),
  created_at timestamptz not null default now()
);
create index if not exists idx_cohort_invites_email on public.cohort_invites(email);
create index if not exists idx_cohort_invites_cohort on public.cohort_invites(cohort_id);

create table if not exists public.cohort_assignments (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references public.cohorts(id) on delete cascade,
  kind text not null,                                  -- 'lesson' | 'track' | 'problem' | 'build' | 'venture' | 'free'
  target_id text,                                      -- the lesson/track/problem id, null for 'free'
  title text not null,
  description text,
  due_at timestamptz,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists idx_cohort_assignments_cohort on public.cohort_assignments(cohort_id, due_at);

-- ─── RLS ─────────────────────────────────────────────────────────────────
alter table public.cohorts enable row level security;
alter table public.cohort_members enable row level security;
alter table public.cohort_invites enable row level security;
alter table public.cohort_assignments enable row level security;

-- Members read; owners write.
drop policy if exists "cohorts_member_read" on public.cohorts;
create policy "cohorts_member_read" on public.cohorts for select using (
  auth.uid() = owner_id
  or auth.uid() in (select user_id from public.cohort_members where cohort_id = cohorts.id)
);

drop policy if exists "cohorts_owner_insert" on public.cohorts;
create policy "cohorts_owner_insert" on public.cohorts for insert with check (auth.uid() = owner_id);

drop policy if exists "cohorts_owner_update" on public.cohorts;
create policy "cohorts_owner_update" on public.cohorts for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists "cohorts_owner_delete" on public.cohorts;
create policy "cohorts_owner_delete" on public.cohorts for delete using (auth.uid() = owner_id);

drop policy if exists "cohort_members_member_read" on public.cohort_members;
create policy "cohort_members_member_read" on public.cohort_members for select using (
  auth.uid() = user_id
  or auth.uid() in (select user_id from public.cohort_members c2 where c2.cohort_id = cohort_members.cohort_id)
  or auth.uid() in (select owner_id from public.cohorts where id = cohort_members.cohort_id)
);

-- Students can leave (delete themselves).
drop policy if exists "cohort_members_self_leave" on public.cohort_members;
create policy "cohort_members_self_leave" on public.cohort_members for delete using (auth.uid() = user_id);

-- Invites: owner + instructors can see them.
drop policy if exists "cohort_invites_instructor_read" on public.cohort_invites;
create policy "cohort_invites_instructor_read" on public.cohort_invites for select using (
  auth.uid() in (select owner_id from public.cohorts where id = cohort_invites.cohort_id)
  or auth.uid() in (select user_id from public.cohort_members where cohort_id = cohort_invites.cohort_id and role = 'instructor')
);

-- Assignments: any member reads.
drop policy if exists "cohort_assignments_member_read" on public.cohort_assignments;
create policy "cohort_assignments_member_read" on public.cohort_assignments for select using (
  auth.uid() in (select user_id from public.cohort_members where cohort_id = cohort_assignments.cohort_id)
  or auth.uid() in (select owner_id from public.cohorts where id = cohort_assignments.cohort_id)
);

-- ─── Triggers ────────────────────────────────────────────────────────────
create or replace function public.touch_cohort() returns trigger as $$
begin new.updated_at = now(); return new; end$$ language plpgsql;

drop trigger if exists touch_cohort_trg on public.cohorts;
create trigger touch_cohort_trg before update on public.cohorts
  for each row execute function public.touch_cohort();

-- ─── Helper RPCs ─────────────────────────────────────────────────────────
create or replace function public.is_cohort_member(_cohort_id uuid, _user_id uuid)
returns text language sql stable as $$
  select case
    when exists (select 1 from public.cohorts where id = _cohort_id and owner_id = _user_id) then 'owner'
    when exists (select 1 from public.cohort_members where cohort_id = _cohort_id and user_id = _user_id) then
      (select role from public.cohort_members where cohort_id = _cohort_id and user_id = _user_id limit 1)
    else null
  end;
$$;

-- Realtime publication (so member adds/removes show up live in the
-- roster UI).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.cohort_members; exception when others then null; end;
    begin alter publication supabase_realtime add table public.cohort_assignments; exception when others then null; end;
  end if;
end$$;
