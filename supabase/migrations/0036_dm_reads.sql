-- ─────────────────────────────────────────────────────────────────────────
-- 0036 — Per-user, per-DM-thread read state.
--
-- Same watermark pattern as workspace_message_reads but scoped per DM
-- thread. One row per (thread, user) holding the last message ts the
-- user has seen, so the inbox can show:
--   - which threads have unread messages
--   - the total unread DM count across all the user's threads in this
--     workspace (for a tab badge)
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.workspace_dm_reads (
  thread_id uuid not null references public.workspace_dm_threads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (thread_id, user_id)
);

create index if not exists idx_dm_reads_user on public.workspace_dm_reads(user_id);

alter table public.workspace_dm_reads enable row level security;

-- Only the row owner reads their own watermark (privacy: a peer
-- doesn't need to know whether you've seen their last message).
drop policy if exists "dm_reads_owner_read" on public.workspace_dm_reads;
create policy "dm_reads_owner_read" on public.workspace_dm_reads for select using (auth.uid() = user_id);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.workspace_dm_reads; exception when others then null; end;
  end if;
end$$;
