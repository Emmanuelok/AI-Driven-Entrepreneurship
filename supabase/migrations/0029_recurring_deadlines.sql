-- ─────────────────────────────────────────────────────────────────────────
-- 0029 — Recurring deadlines.
--
-- A deadline can carry a recurrence_rule. When the user closes a
-- recurring deadline, the server doesn't mark it permanently done —
-- it computes the next occurrence and advances due_at, keeping the
-- series alive until UNTIL is reached or COUNT is hit. The activity
-- stream records each completion so history is preserved.
--
-- We also track how many occurrences have been completed (for COUNT
-- termination) without inflating the row count for what is logically
-- one obligation.
-- ─────────────────────────────────────────────────────────────────────────

alter table public.workspace_deadlines
  add column if not exists recurrence_rule jsonb,
  add column if not exists occurrences_completed int not null default 0;

create index if not exists idx_workspace_deadlines_recurring
  on public.workspace_deadlines((recurrence_rule is not null))
  where recurrence_rule is not null and status = 'open';
