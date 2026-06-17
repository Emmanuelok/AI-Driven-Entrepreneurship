-- ─────────────────────────────────────────────────────────────────────────
-- 0034 — Per-user message read state.
--
-- Tracks the latest message each user has seen in each workspace's
-- discussion. We store a single row per (workspace, user) holding the
-- timestamp of the latest message they've acknowledged — much cheaper
-- than per-message read receipts (M × N rows) and still lets us:
--   - render an "unread count" badge on the Discussion tab
--   - render "seen by N" on a message (count of users whose read
--     watermark is ≥ that message's created_at)
--
-- The client updates the watermark when the user has the Discussion
-- panel open and a new message arrives, or on tab activation.
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.workspace_message_reads (
  workspace_id text not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index if not exists idx_msg_reads_workspace on public.workspace_message_reads(workspace_id);

alter table public.workspace_message_reads enable row level security;

-- A member of the workspace can read every other member's watermark
-- so the UI can render "seen by N" counts on messages.
drop policy if exists "msg_reads_member_read" on public.workspace_message_reads;
create policy "msg_reads_member_read" on public.workspace_message_reads for select using (
  auth.uid() in (select user_id from public.workspace_members where workspace_id = workspace_message_reads.workspace_id)
);

-- Realtime: peers' watermark moves should reach other members in real
-- time so "seen by N" updates live.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.workspace_message_reads; exception when others then null; end;
  end if;
end$$;
