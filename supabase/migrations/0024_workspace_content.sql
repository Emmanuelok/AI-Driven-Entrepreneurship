-- ─────────────────────────────────────────────────────────────────────────
-- 0024 — Workspace collaborative content: discussion + shared notes.
--
-- The Workspaces engine (0023) gave teams members, deadlines, presence,
-- and activity — but nothing to actually work ON together. This adds the
-- two universal collaboration surfaces:
--
--   workspace_messages — a flat real-time discussion thread per
--                        workspace. Members talk; Sage joins the
--                        conversation when @sage is mentioned (agent
--                        messages have user_id null + is_agent true).
--   workspace_docs     — shared notes / draft documents co-edited by
--                        members. Last-write-wins with a monotonic
--                        `version` for optimistic-concurrency conflict
--                        detection (the save route 409s on a stale
--                        version so the client can reconcile).
--
-- Both ride the existing workspace:<id> realtime channel — they're added
-- to the supabase_realtime publication so the client's postgres_changes
-- subscriptions light up automatically.
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.workspace_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,   -- null for agent
  author_name text,                                            -- cached for display
  body text not null,
  -- Sage (or any future automated participant) posts with is_agent
  -- true + user_id null. The UI styles these distinctly.
  is_agent boolean not null default false,
  -- Echo of the @-tokens we resolved, so the client can highlight
  -- mentions without re-parsing.
  mentions text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists idx_workspace_messages_ws on public.workspace_messages(workspace_id, created_at desc);

create table if not exists public.workspace_docs (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.workspaces(id) on delete cascade,
  title text not null default 'Untitled note',
  body text not null default '',
  updated_by uuid references auth.users(id) on delete set null,
  updated_by_name text,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_workspace_docs_ws on public.workspace_docs(workspace_id, updated_at desc);

-- ─── RLS ─────────────────────────────────────────────────────────────────
alter table public.workspace_messages enable row level security;
alter table public.workspace_docs enable row level security;

drop policy if exists "workspace_messages_member_read" on public.workspace_messages;
create policy "workspace_messages_member_read" on public.workspace_messages for select using (
  auth.uid() in (select user_id from public.workspace_members where workspace_id = workspace_messages.workspace_id)
  or auth.uid() in (select owner_id from public.workspaces where id = workspace_messages.workspace_id)
);

drop policy if exists "workspace_docs_member_read" on public.workspace_docs;
create policy "workspace_docs_member_read" on public.workspace_docs for select using (
  auth.uid() in (select user_id from public.workspace_members where workspace_id = workspace_docs.workspace_id)
  or auth.uid() in (select owner_id from public.workspaces where id = workspace_docs.workspace_id)
);

-- Writes go exclusively through the service-role API routes (which gate
-- on authWorkspace + role), so we don't add member-write RLS policies —
-- keeps the surface tight and the authorization logic in one place.

-- ─── Triggers ────────────────────────────────────────────────────────────
-- Bump the parent workspace's updated_at when its content changes, so the
-- hub's "recently active" ordering reflects discussion + note activity,
-- not just metadata edits.
create or replace function public.bump_workspace_on_content() returns trigger as $$
begin
  update public.workspaces set updated_at = now()
  where id = coalesce(new.workspace_id, old.workspace_id);
  return new;
end$$ language plpgsql security definer;

drop trigger if exists bump_ws_on_message on public.workspace_messages;
create trigger bump_ws_on_message after insert on public.workspace_messages
  for each row execute function public.bump_workspace_on_content();

drop trigger if exists bump_ws_on_doc on public.workspace_docs;
create trigger bump_ws_on_doc after insert or update on public.workspace_docs
  for each row execute function public.bump_workspace_on_content();

-- Touch a doc's updated_at + bump its version on every body/title write.
create or replace function public.touch_workspace_doc() returns trigger as $$
begin
  new.updated_at = now();
  -- Only bump version when the content actually changed (not on a
  -- no-op metadata write), so the optimistic-concurrency check stays
  -- meaningful.
  if new.body is distinct from old.body or new.title is distinct from old.title then
    new.version = old.version + 1;
  end if;
  return new;
end$$ language plpgsql;

drop trigger if exists touch_workspace_doc_trg on public.workspace_docs;
create trigger touch_workspace_doc_trg before update on public.workspace_docs
  for each row execute function public.touch_workspace_doc();

-- ─── Realtime ────────────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.workspace_messages; exception when others then null; end;
    begin alter publication supabase_realtime add table public.workspace_docs; exception when others then null; end;
  end if;
end$$;
