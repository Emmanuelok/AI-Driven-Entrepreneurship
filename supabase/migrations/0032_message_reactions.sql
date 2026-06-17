-- ─────────────────────────────────────────────────────────────────────────
-- 0032 — Message reactions.
--
-- Per-user, per-emoji reactions on workspace_messages. Composite PK
-- guarantees one user can't double-react with the same emoji. Removing
-- a reaction is a delete; toggling is the natural API. Realtime-
-- published so React clients update without polling.
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.workspace_message_reactions (
  message_id uuid not null references public.workspace_messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

create index if not exists idx_msg_reactions_message
  on public.workspace_message_reactions(message_id);

alter table public.workspace_message_reactions enable row level security;

-- Any member of the workspace that hosts the parent message can read
-- reactions. We join through workspace_messages to find the
-- workspace_id, then check workspace_members.
drop policy if exists "msg_reactions_member_read" on public.workspace_message_reactions;
create policy "msg_reactions_member_read" on public.workspace_message_reactions for select using (
  exists (
    select 1
    from public.workspace_messages m
    join public.workspace_members mb on mb.workspace_id = m.workspace_id
    where m.id = workspace_message_reactions.message_id and mb.user_id = auth.uid()
  )
);

-- Writes go through the trusted server route (gated on workspace
-- membership), so no insert/delete policies here.

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.workspace_message_reactions; exception when others then null; end;
  end if;
end$$;
