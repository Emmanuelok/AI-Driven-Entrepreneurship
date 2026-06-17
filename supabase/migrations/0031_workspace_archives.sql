-- ─────────────────────────────────────────────────────────────────────────
-- 0031 — Workspace archives.
--
-- A workspace can be archived (soft-hidden) without losing any data.
-- Archived workspaces:
--   • drop out of the hub's default list (a toggle reveals them)
--   • drop out of the cross-workspace deadline + analytics rolls
--   • still let members read/visit them and read history
--   • can be unarchived back to active any time
--
-- The owner controls the flag. Cascading deletes still apply if the
-- owner deletes the workspace outright.
-- ─────────────────────────────────────────────────────────────────────────

alter table public.workspaces
  add column if not exists archived_at timestamptz;

create index if not exists idx_workspaces_active
  on public.workspaces(owner_id, updated_at desc)
  where archived_at is null;
