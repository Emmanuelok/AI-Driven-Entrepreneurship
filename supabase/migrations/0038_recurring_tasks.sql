-- ─────────────────────────────────────────────────────────────────────────
-- 0038 — Recurring tasks.
--
-- Same idea as recurring deadlines (migration 0029): a task can carry
-- a recurrence_rule. When the user marks a recurring task done, the
-- route advances its due_at to the next occurrence and resets status
-- to 'todo' — keeping the series alive until COUNT/UNTIL is hit. For
-- recurring tasks the cadence usually IS the point ('weekly review',
-- 'morning standup', 'monthly retro'), so this is a natural fit.
-- ─────────────────────────────────────────────────────────────────────────

alter table public.workspace_tasks
  add column if not exists recurrence_rule jsonb,
  add column if not exists occurrences_completed int not null default 0;

create index if not exists idx_workspace_tasks_recurring
  on public.workspace_tasks((recurrence_rule is not null))
  where recurrence_rule is not null;
