-- ─────────────────────────────────────────────────────────────────────────
-- 0030 — Task subtasks.
--
-- A task can break down into child tasks via parent_task_id. Subtasks
-- carry their own status, assignee, due date — they are full tasks,
-- not just checklist strings. The board's columns show only top-level
-- tasks (parent_task_id is null); subtasks live inside their parent's
-- detail dialog.
--
-- Cascade on delete: removing a parent removes the whole subtree.
-- ─────────────────────────────────────────────────────────────────────────

alter table public.workspace_tasks
  add column if not exists parent_task_id uuid references public.workspace_tasks(id) on delete cascade;

create index if not exists idx_workspace_tasks_parent
  on public.workspace_tasks(parent_task_id)
  where parent_task_id is not null;
