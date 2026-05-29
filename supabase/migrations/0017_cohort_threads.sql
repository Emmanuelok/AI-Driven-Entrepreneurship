-- ─────────────────────────────────────────────────────────────────────────
-- Cohort discussion threads — the social glue for paid cohorts.
--
-- A thread is either pinned to a specific assignment (per-task Q&A) or
-- floats at the cohort level (general announcements / questions). The
-- author can resolve a question; instructors can pin a thread to push
-- it to the top of the list.
--
-- Replies are flat (no nested replies). Trying to model Reddit at this
-- scale buys more confusion than it solves — a clean linear thread
-- with date-ordered replies is what a 30-person cohort actually uses.
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.cohort_threads (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references public.cohorts(id) on delete cascade,
  assignment_id uuid references public.cohort_assignments(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'question',  -- 'question' | 'note' | 'announcement'
  title text not null,
  body text not null,
  pinned boolean not null default false,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_cohort_threads_cohort on public.cohort_threads(cohort_id, pinned desc, created_at desc);
create index if not exists idx_cohort_threads_assignment on public.cohort_threads(assignment_id) where assignment_id is not null;
create index if not exists idx_cohort_threads_author on public.cohort_threads(author_id);

create table if not exists public.cohort_thread_replies (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.cohort_threads(id) on delete cascade,
  cohort_id uuid not null references public.cohorts(id) on delete cascade,  -- denormalized for cheap RLS
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_cohort_thread_replies_thread on public.cohort_thread_replies(thread_id, created_at);

-- ─── RLS ─────────────────────────────────────────────────────────────────
alter table public.cohort_threads enable row level security;
alter table public.cohort_thread_replies enable row level security;

-- Threads readable by any cohort member.
drop policy if exists "cohort_threads_member_read" on public.cohort_threads;
create policy "cohort_threads_member_read" on public.cohort_threads for select using (
  auth.uid() = author_id
  or auth.uid() in (select user_id from public.cohort_members where cohort_id = cohort_threads.cohort_id)
  or auth.uid() in (select owner_id from public.cohorts where id = cohort_threads.cohort_id)
);

-- Anyone in the cohort can start a thread.
drop policy if exists "cohort_threads_member_insert" on public.cohort_threads;
create policy "cohort_threads_member_insert" on public.cohort_threads for insert with check (
  auth.uid() = author_id
  and (
    auth.uid() in (select user_id from public.cohort_members where cohort_id = cohort_threads.cohort_id)
    or auth.uid() in (select owner_id from public.cohorts where id = cohort_threads.cohort_id)
  )
);

-- Author can update their own thread (title/body/resolve); instructors
-- can pin/unpin anything in the cohort.
drop policy if exists "cohort_threads_author_or_instructor_update" on public.cohort_threads;
create policy "cohort_threads_author_or_instructor_update" on public.cohort_threads for update using (
  auth.uid() = author_id
  or auth.uid() in (select user_id from public.cohort_members where cohort_id = cohort_threads.cohort_id and role = 'instructor')
  or auth.uid() in (select owner_id from public.cohorts where id = cohort_threads.cohort_id)
) with check (
  auth.uid() = author_id
  or auth.uid() in (select user_id from public.cohort_members where cohort_id = cohort_threads.cohort_id and role = 'instructor')
  or auth.uid() in (select owner_id from public.cohorts where id = cohort_threads.cohort_id)
);

-- Same for delete.
drop policy if exists "cohort_threads_author_or_instructor_delete" on public.cohort_threads;
create policy "cohort_threads_author_or_instructor_delete" on public.cohort_threads for delete using (
  auth.uid() = author_id
  or auth.uid() in (select user_id from public.cohort_members where cohort_id = cohort_threads.cohort_id and role = 'instructor')
  or auth.uid() in (select owner_id from public.cohorts where id = cohort_threads.cohort_id)
);

-- Replies: members read; members write; author or instructor deletes.
drop policy if exists "cohort_thread_replies_member_read" on public.cohort_thread_replies;
create policy "cohort_thread_replies_member_read" on public.cohort_thread_replies for select using (
  auth.uid() in (select user_id from public.cohort_members where cohort_id = cohort_thread_replies.cohort_id)
  or auth.uid() in (select owner_id from public.cohorts where id = cohort_thread_replies.cohort_id)
);

drop policy if exists "cohort_thread_replies_member_insert" on public.cohort_thread_replies;
create policy "cohort_thread_replies_member_insert" on public.cohort_thread_replies for insert with check (
  auth.uid() = author_id
  and (
    auth.uid() in (select user_id from public.cohort_members where cohort_id = cohort_thread_replies.cohort_id)
    or auth.uid() in (select owner_id from public.cohorts where id = cohort_thread_replies.cohort_id)
  )
);

drop policy if exists "cohort_thread_replies_author_or_instructor_delete" on public.cohort_thread_replies;
create policy "cohort_thread_replies_author_or_instructor_delete" on public.cohort_thread_replies for delete using (
  auth.uid() = author_id
  or auth.uid() in (select user_id from public.cohort_members where cohort_id = cohort_thread_replies.cohort_id and role = 'instructor')
  or auth.uid() in (select owner_id from public.cohorts where id = cohort_thread_replies.cohort_id)
);

-- ─── Touch trigger ───────────────────────────────────────────────────────
create or replace function public.touch_cohort_thread() returns trigger as $$
begin new.updated_at = now(); return new; end$$ language plpgsql;

drop trigger if exists touch_cohort_thread_trg on public.cohort_threads;
create trigger touch_cohort_thread_trg before update on public.cohort_threads
  for each row execute function public.touch_cohort_thread();

-- Bumping the parent thread's updated_at on a new reply makes
-- "recently active" sorting cheap.
create or replace function public.bump_thread_on_reply() returns trigger as $$
begin
  update public.cohort_threads set updated_at = now() where id = new.thread_id;
  return new;
end$$ language plpgsql security definer;

drop trigger if exists bump_thread_on_reply_trg on public.cohort_thread_replies;
create trigger bump_thread_on_reply_trg after insert on public.cohort_thread_replies
  for each row execute function public.bump_thread_on_reply();

-- ─── Realtime ────────────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.cohort_threads; exception when others then null; end;
    begin alter publication supabase_realtime add table public.cohort_thread_replies; exception when others then null; end;
  end if;
end$$;
