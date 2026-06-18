-- ─────────────────────────────────────────────────────────────────────────
-- 0035 — Direct messages between workspace members.
--
-- A 1-on-1 channel scoped to one workspace. Threads are uniquely
-- identified by (workspace, lower-id user, higher-id user) so opening
-- a DM with someone you've already messaged returns the existing
-- thread instead of creating a duplicate. The "lower" / "higher"
-- ordering is enforced by a CHECK constraint at write time; the API
-- normalizes inputs before insert.
--
-- DMs are PRIVATE to the two participants. RLS enforces this and the
-- service-role API routes double-check before fanning out reads.
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.workspace_dm_threads (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.workspaces(id) on delete cascade,
  -- Canonical ordering: user_lo.text < user_hi.text always. Enforced
  -- by a CHECK so a bad insert can't sneak past the API.
  user_lo uuid not null references auth.users(id) on delete cascade,
  user_hi uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_dm_threads_users_ordered check (user_lo < user_hi),
  unique (workspace_id, user_lo, user_hi)
);

create index if not exists idx_dm_threads_lo on public.workspace_dm_threads(user_lo, workspace_id);
create index if not exists idx_dm_threads_hi on public.workspace_dm_threads(user_hi, workspace_id);

create table if not exists public.workspace_dm_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.workspace_dm_threads(id) on delete cascade,
  sender_user_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_dm_messages_thread on public.workspace_dm_messages(thread_id, created_at);

-- ─── RLS ─────────────────────────────────────────────────────────────────
alter table public.workspace_dm_threads enable row level security;
alter table public.workspace_dm_messages enable row level security;

drop policy if exists "dm_threads_participant_read" on public.workspace_dm_threads;
create policy "dm_threads_participant_read" on public.workspace_dm_threads for select using (
  auth.uid() = user_lo or auth.uid() = user_hi
);

drop policy if exists "dm_messages_participant_read" on public.workspace_dm_messages;
create policy "dm_messages_participant_read" on public.workspace_dm_messages for select using (
  exists (
    select 1 from public.workspace_dm_threads t
    where t.id = workspace_dm_messages.thread_id
      and (auth.uid() = t.user_lo or auth.uid() = t.user_hi)
  )
);

-- ─── Trigger: keep updated_at fresh ─────────────────────────────────────
create or replace function public.bump_dm_thread() returns trigger as $$
begin
  update public.workspace_dm_threads set updated_at = now() where id = new.thread_id;
  return new;
end$$ language plpgsql security definer;

drop trigger if exists bump_dm_thread_trg on public.workspace_dm_messages;
create trigger bump_dm_thread_trg after insert on public.workspace_dm_messages
  for each row execute function public.bump_dm_thread();

-- ─── Realtime ───────────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.workspace_dm_threads; exception when others then null; end;
    begin alter publication supabase_realtime add table public.workspace_dm_messages; exception when others then null; end;
  end if;
end$$;
