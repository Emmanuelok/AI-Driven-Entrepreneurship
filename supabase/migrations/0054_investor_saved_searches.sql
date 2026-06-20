-- ─────────────────────────────────────────────────────────────────────────
-- 0054 — Investor saved searches + new-venture alerts (Phase 75).
--
-- The investor portal (Phase 68) lets backers browse public_ventures
-- with sector/stage/region/raising filters. Until now those filters
-- evaporated on refresh — an investor reviewing pre-seed Lagos
-- climatetech had to re-type the criteria every time and had no
-- way to be told when a new venture matching their thesis published.
--
-- A saved search captures the criteria once. The cron alert (Phase 75)
-- runs each search weekly against ventures published or updated since
-- the last run, and if there are matches it emails the investor a
-- digest of new ones. Investors only get emailed about NEW matches,
-- so re-running a thesis doesn't spam the inbox.
--
-- The criteria column is jsonb because the shape evolves — Phase 75
-- supports sectors, stage, region, raisingOnly, minRaiseUsd,
-- maxRaiseUsd, and q. Later phases can add fields without a migration.
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.investor_saved_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Friendly label. The API auto-suggests one from summarizeCriteria
  -- when the user doesn't provide one.
  title text not null check (length(title) between 1 and 80),
  -- Normalized SearchCriteria object — see src/lib/saved-search.ts.
  criteria jsonb not null default '{}'::jsonb,
  -- Email cadence. 'off' lets the investor save criteria for in-app
  -- runs without subscribing to alerts. 'weekly' is the default.
  -- 'instant' is reserved for a future fan-out but unused today.
  alert_cadence text not null default 'weekly'
    check (alert_cadence in ('off', 'weekly', 'instant')),
  -- Bookkeeping. last_run_at is the watermark the cron uses to
  -- decide which ventures count as "new" since last alert.
  last_run_at timestamptz,
  -- last_alert_at differs from last_run_at when a run found zero
  -- matches (we set last_run_at but not last_alert_at, so the user's
  -- digest history reflects deliveries not scans).
  last_alert_at timestamptz,
  match_count_total int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_investor_saved_searches_user
  on public.investor_saved_searches(user_id, updated_at desc);
create index if not exists idx_investor_saved_searches_cadence_run
  on public.investor_saved_searches(alert_cadence, last_run_at)
  where alert_cadence != 'off';

alter table public.investor_saved_searches enable row level security;

drop policy if exists "saved_searches_self_read" on public.investor_saved_searches;
create policy "saved_searches_self_read"
  on public.investor_saved_searches for select
  using (auth.uid() = user_id);

-- Writes via service-role API. We don't trust the client to set
-- last_run_at or match_count_total directly.

create or replace function public.touch_saved_searches_updated_at()
returns trigger as $$
begin new.updated_at := now(); return new; end;
$$ language plpgsql;

drop trigger if exists saved_searches_touch on public.investor_saved_searches;
create trigger saved_searches_touch
  before update on public.investor_saved_searches
  for each row execute function public.touch_saved_searches_updated_at();
