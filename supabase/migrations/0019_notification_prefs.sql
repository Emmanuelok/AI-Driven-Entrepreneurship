-- ─────────────────────────────────────────────────────────────────────────
-- Per-user notification preferences.
--
-- One row per user. Defaults are "on" so existing users don't lose
-- notifications when this lands; they have to explicitly opt out. The
-- pushToUser helper + the digest crons check this table before
-- sending.
--
-- Schema is denormalized to a flat boolean per category — easier to
-- reason about in code and a SELECT for one row is a single round
-- trip with no joins. If categories ever explode past ~20 we can
-- refactor to a JSONB blob.
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.notification_prefs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  -- Push categories
  push_mention boolean not null default true,        -- @-mentions in threads / comments
  push_reply boolean not null default true,          -- replies on threads you authored
  push_announcement boolean not null default true,   -- cohort-wide announcements
  push_system boolean not null default true,         -- system / important events (rarely off)
  -- Email categories
  email_student_digest boolean not null default true,    -- /api/cron/weekly-digest
  email_instructor_digest boolean not null default true, -- /api/cron/instructor-digest
  -- Bookkeeping
  updated_at timestamptz not null default now()
);

alter table public.notification_prefs enable row level security;

drop policy if exists "notification_prefs_self_read" on public.notification_prefs;
create policy "notification_prefs_self_read" on public.notification_prefs for select using (auth.uid() = user_id);

drop policy if exists "notification_prefs_self_upsert_insert" on public.notification_prefs;
create policy "notification_prefs_self_upsert_insert" on public.notification_prefs for insert with check (auth.uid() = user_id);

drop policy if exists "notification_prefs_self_update" on public.notification_prefs;
create policy "notification_prefs_self_update" on public.notification_prefs for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.touch_notification_prefs() returns trigger as $$
begin new.updated_at = now(); return new; end$$ language plpgsql;

drop trigger if exists touch_notification_prefs_trg on public.notification_prefs;
create trigger touch_notification_prefs_trg before update on public.notification_prefs
  for each row execute function public.touch_notification_prefs();
