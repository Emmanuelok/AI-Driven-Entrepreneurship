-- ─────────────────────────────────────────────────────────────────────────
-- 0037 — Pinned messages.
--
-- A workspace admin (or the message author themselves) can pin a
-- message so it stays surfaced at the top of the discussion until
-- explicitly unpinned. Use cases: the meeting link, this week's focus,
-- the canonical answer to a recurring question.
--
-- We use `pinned_at` (timestamptz, nullable) rather than a boolean so
-- the panel can sort pins by recency, oldest pin reads first by default
-- but the UI can flip ordering if needed.
-- ─────────────────────────────────────────────────────────────────────────

alter table public.workspace_messages
  add column if not exists pinned_at timestamptz,
  add column if not exists pinned_by uuid references auth.users(id) on delete set null;

create index if not exists idx_workspace_messages_pinned
  on public.workspace_messages(workspace_id, pinned_at desc)
  where pinned_at is not null;
