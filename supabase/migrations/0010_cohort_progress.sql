-- ─────────────────────────────────────────────────────────────────────────
-- Cohort progress — students opt-in to share their assignment status
-- with their instructors. The student is always the sole writer of
-- their own row; instructors see the cohort-wide rollup.
--
-- We don't expose ANY local data the student hasn't explicitly
-- progressed (no lesson-by-lesson telemetry, no AI usage, no chat).
-- Only: status + optional score + optional evidence link the student
-- chose to attach.
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.cohort_progress (
  cohort_id uuid not null references public.cohorts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  assignment_id uuid not null references public.cohort_assignments(id) on delete cascade,
  status text not null default 'not_started',          -- 'not_started' | 'in_progress' | 'completed' | 'submitted'
  score_pct numeric,
  evidence_url text,                                   -- optional public link to build/venture/sketch
  notes text,
  updated_at timestamptz not null default now(),
  primary key (cohort_id, user_id, assignment_id)
);

create index if not exists idx_cohort_progress_cohort on public.cohort_progress(cohort_id, updated_at desc);
create index if not exists idx_cohort_progress_user on public.cohort_progress(user_id, updated_at desc);

alter table public.cohort_progress enable row level security;

-- Students see their own rows. Instructors see all rows in their cohort.
drop policy if exists "cohort_progress_member_read" on public.cohort_progress;
create policy "cohort_progress_member_read" on public.cohort_progress for select using (
  auth.uid() = user_id
  or auth.uid() in (
    select user_id from public.cohort_members
    where cohort_id = cohort_progress.cohort_id and role = 'instructor'
  )
  or auth.uid() in (select owner_id from public.cohorts where id = cohort_progress.cohort_id)
);

-- Students write only their own rows. The user_id MUST match auth.uid()
-- so no spoofing is possible from a client.
drop policy if exists "cohort_progress_self_upsert" on public.cohort_progress;
create policy "cohort_progress_self_upsert" on public.cohort_progress for insert with check (auth.uid() = user_id);

drop policy if exists "cohort_progress_self_update" on public.cohort_progress;
create policy "cohort_progress_self_update" on public.cohort_progress for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "cohort_progress_self_delete" on public.cohort_progress;
create policy "cohort_progress_self_delete" on public.cohort_progress for delete using (auth.uid() = user_id);

create or replace function public.touch_cohort_progress() returns trigger as $$
begin new.updated_at = now(); return new; end$$ language plpgsql;

drop trigger if exists touch_cohort_progress_trg on public.cohort_progress;
create trigger touch_cohort_progress_trg before update on public.cohort_progress
  for each row execute function public.touch_cohort_progress();

-- Realtime publication so instructors' progress views update live as
-- students check things off.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.cohort_progress; exception when others then null; end;
  end if;
end$$;
