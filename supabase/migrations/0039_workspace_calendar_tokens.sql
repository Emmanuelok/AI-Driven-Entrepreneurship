-- ─────────────────────────────────────────────────────────────────────────
-- 0039 — Per-workspace calendar feed tokens.
--
-- A per-(workspace, user), revocable token that authorizes an
-- UNAUTHENTICATED iCalendar (.ics) feed of just ONE workspace's
-- deadlines + task due dates. Symmetric with the global
-- calendar_tokens table (0028) but scoped: useful when you only want
-- one project (a class, a single team) showing up in your calendar
-- app without the noise of every workspace you belong to.
--
-- The token IS the capability. Calendar apps poll the feed URL with no
-- session, so a long random secret + the ability to rotate it is the
-- only auth — and at serve time we re-verify membership, so revoking
-- access to the workspace also kills the feed even if the token
-- hasn't been rotated.
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.workspace_calendar_tokens (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  created_at timestamptz not null default now(),
  rotated_at timestamptz,
  primary key (workspace_id, user_id)
);

create index if not exists idx_workspace_calendar_tokens_token
  on public.workspace_calendar_tokens(token);

alter table public.workspace_calendar_tokens enable row level security;

-- The owner can read their own row (to display the feed URL). Mint +
-- rotation happen through the service-role API route.
drop policy if exists "workspace_calendar_tokens_owner_read" on public.workspace_calendar_tokens;
create policy "workspace_calendar_tokens_owner_read"
  on public.workspace_calendar_tokens for select
  using (auth.uid() = user_id);
