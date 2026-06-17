-- ─────────────────────────────────────────────────────────────────────────
-- 0033 — Per-member Sage advisor chat per workspace.
--
-- Each (workspace, member) gets ONE persistent conversation with Sage,
-- separate from the workspace discussion. Sage joins with the
-- workspace's full state (notes, deadlines, tasks, recent discussion)
-- loaded into the system prompt on every turn — so the conversation
-- can stay focused on what the workspace is actually doing.
--
-- The thread is private to its owner. We don't share these with the
-- rest of the workspace by design — it's a personal advisor mode, not
-- another team channel.
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.workspace_sage_threads (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- A short auto-generated summary the UI can show as the "thread title"
  -- (e.g. first user message, truncated). Refreshed by the server.
  title text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create index if not exists idx_sage_threads_user on public.workspace_sage_threads(user_id);

create table if not exists public.workspace_sage_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.workspace_sage_threads(id) on delete cascade,
  -- 'user' | 'assistant' — same shape as Anthropic's message API
  role text not null,
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_sage_messages_thread on public.workspace_sage_messages(thread_id, created_at);

-- ─── RLS ─────────────────────────────────────────────────────────────────
alter table public.workspace_sage_threads enable row level security;
alter table public.workspace_sage_messages enable row level security;

-- Threads + their messages are visible only to the thread owner. The
-- service-role API route handles writes (gated on workspace membership
-- AND thread ownership).
drop policy if exists "sage_threads_owner_read" on public.workspace_sage_threads;
create policy "sage_threads_owner_read" on public.workspace_sage_threads for select using (auth.uid() = user_id);

drop policy if exists "sage_messages_owner_read" on public.workspace_sage_messages;
create policy "sage_messages_owner_read" on public.workspace_sage_messages for select using (
  exists (select 1 from public.workspace_sage_threads t where t.id = workspace_sage_messages.thread_id and t.user_id = auth.uid())
);

-- Touch trigger keeps updated_at fresh on a thread when a message
-- lands — useful for sorting threads "most recently active".
create or replace function public.bump_sage_thread() returns trigger as $$
begin
  update public.workspace_sage_threads set updated_at = now() where id = new.thread_id;
  return new;
end$$ language plpgsql security definer;

drop trigger if exists bump_sage_thread_trg on public.workspace_sage_messages;
create trigger bump_sage_thread_trg after insert on public.workspace_sage_messages
  for each row execute function public.bump_sage_thread();
