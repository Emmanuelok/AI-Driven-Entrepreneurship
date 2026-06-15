-- ─────────────────────────────────────────────────────────────────────────
-- 0025 — Workspace tasks: a shared Kanban board.
--
-- The third collaborative surface (after discussion + notes): a board of
-- tasks members move across columns (todo → doing → done, plus blocked),
-- each optionally assigned to a member. This is the "work on a project
-- together" core for project / research / paper workspaces.
--
-- Ordering: `position` is a float so a card can be inserted between two
-- others without renumbering the column (fractional indexing). Cards
-- order by (status column) then (position asc, created_at asc).
--
-- Like discussion + notes, writes go through the service-role API routes
-- (gated on authWorkspace) and the table is realtime-published so the
-- board updates live for every member.
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.workspace_tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.workspaces(id) on delete cascade,
  title text not null,
  detail text not null default '',
  -- todo | doing | done | blocked
  status text not null default 'todo',
  assignee_user_id uuid references auth.users(id) on delete set null,
  assignee_name text,                                    -- cached for display
  position double precision not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_workspace_tasks_ws on public.workspace_tasks(workspace_id, status, position);
create index if not exists idx_workspace_tasks_assignee on public.workspace_tasks(assignee_user_id);

-- ─── RLS ─────────────────────────────────────────────────────────────────
alter table public.workspace_tasks enable row level security;

drop policy if exists "workspace_tasks_member_read" on public.workspace_tasks;
create policy "workspace_tasks_member_read" on public.workspace_tasks for select using (
  auth.uid() in (select user_id from public.workspace_members where workspace_id = workspace_tasks.workspace_id)
  or auth.uid() in (select owner_id from public.workspaces where id = workspace_tasks.workspace_id)
);

-- ─── Triggers ────────────────────────────────────────────────────────────
create or replace function public.touch_workspace_task() returns trigger as $$
begin new.updated_at = now(); return new; end$$ language plpgsql;

drop trigger if exists touch_workspace_task_trg on public.workspace_tasks;
create trigger touch_workspace_task_trg before update on public.workspace_tasks
  for each row execute function public.touch_workspace_task();

-- Reuse the content-bump function from 0024 so task activity also keeps
-- the hub's "recently active" ordering fresh.
drop trigger if exists bump_ws_on_task on public.workspace_tasks;
create trigger bump_ws_on_task after insert or update on public.workspace_tasks
  for each row execute function public.bump_workspace_on_content();

-- ─── Realtime ────────────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.workspace_tasks; exception when others then null; end;
  end if;
end$$;
