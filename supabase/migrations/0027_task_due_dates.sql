-- ─────────────────────────────────────────────────────────────────────────
-- 0027 — Task due dates.
--
-- Tasks gain an optional due_at so a board card can carry a deadline of
-- its own — it shows on the card, flows into the cross-workspace
-- calendar alongside formal deadlines, and (assigned + due-soon) drives
-- a notification. Nullable so the board stays lightweight by default.
-- ─────────────────────────────────────────────────────────────────────────

alter table public.workspace_tasks
  add column if not exists due_at timestamptz;

create index if not exists idx_workspace_tasks_due
  on public.workspace_tasks(due_at)
  where due_at is not null and status <> 'done';
