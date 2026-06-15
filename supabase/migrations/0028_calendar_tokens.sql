-- ─────────────────────────────────────────────────────────────────────────
-- 0028 — Calendar feed tokens.
--
-- A per-user, revocable token that authorizes an UNAUTHENTICATED
-- iCalendar (.ics) feed of that user's workspace deadlines + task due
-- dates. Calendar apps (Google / Apple / Outlook) poll the feed URL on
-- their own schedule with no session, so the token IS the capability —
-- it's a long random secret, scoped to read-only calendar data, and the
-- user can rotate it to instantly invalidate any subscription.
--
-- We store only the token; the feed route resolves it to a user_id with
-- the service role and never exposes anything but calendar events.
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.calendar_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  created_at timestamptz not null default now(),
  rotated_at timestamptz
);

create index if not exists idx_calendar_tokens_token on public.calendar_tokens(token);

alter table public.calendar_tokens enable row level security;

-- The owner can read their own token (to display the feed URL). Creation
-- + rotation happen through the service-role API route.
drop policy if exists "calendar_tokens_owner_read" on public.calendar_tokens;
create policy "calendar_tokens_owner_read" on public.calendar_tokens for select using (auth.uid() = user_id);
