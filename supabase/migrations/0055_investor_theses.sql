-- ─────────────────────────────────────────────────────────────────────────
-- 0055 — Public investor theses (Phase 77).
--
-- Phase 75 gave investors private saved searches (alert filters).
-- Phase 77 gives them a PUBLIC thesis — an opt-in "what I back"
-- statement founders can browse and pitch into. This is the inverse
-- discovery direction: founders found by investors (saved searches /
-- demand signal) AND investors found by founders (this).
--
-- One row per investor. The thesis is structured (sectors / stages /
-- regions / check range) so the founder-facing matcher can rank it
-- against a venture, plus prose for the human story. is_published
-- gates visibility; the API enforces a completeness floor before
-- letting an investor flip it on so the public directory isn't full
-- of empty shells.
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.investor_theses (
  user_id uuid primary key references auth.users(id) on delete cascade,
  headline text not null default '' check (length(headline) <= 120),
  statement text not null default '' check (length(statement) <= 4000),
  sectors text[] not null default '{}'::text[],
  stages text[] not null default '{}'::text[],
  regions text[] not null default '{}'::text[],
  check_min_usd integer check (check_min_usd is null or check_min_usd >= 0),
  check_max_usd integer check (check_max_usd is null or check_max_usd >= 0),
  accepts_cold_pitch boolean not null default false,
  is_published boolean not null default false,
  -- Denormalized completeness score (0-100) so the directory can sort
  -- by it without recomputing. Written by the API on every save.
  completeness int not null default 0 check (completeness between 0 and 100),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Discovery indexes for the public directory.
create index if not exists idx_investor_theses_published
  on public.investor_theses(is_published, completeness desc, updated_at desc)
  where is_published = true;
create index if not exists idx_investor_theses_sectors
  on public.investor_theses using gin (sectors);
create index if not exists idx_investor_theses_stages
  on public.investor_theses using gin (stages);

alter table public.investor_theses enable row level security;

-- Read: published theses are world-readable (this is the point — a
-- public directory). The owner can always read their own draft.
drop policy if exists "investor_theses_public_read" on public.investor_theses;
create policy "investor_theses_public_read"
  on public.investor_theses for select
  using (is_published = true or auth.uid() = user_id);

-- Writes go through the service-role API (it enforces the publish
-- completeness floor + normalizes the arrays).

create or replace function public.touch_investor_theses_updated_at()
returns trigger as $$
begin new.updated_at := now(); return new; end;
$$ language plpgsql;

drop trigger if exists investor_theses_touch on public.investor_theses;
create trigger investor_theses_touch
  before update on public.investor_theses
  for each row execute function public.touch_investor_theses_updated_at();

-- Phase 77 also lets investors mark individual saved searches as a
-- PUBLIC mandate ("actively looking for…") shown on their thesis
-- page. Default private (false) so existing searches stay private.
alter table public.investor_saved_searches
  add column if not exists is_public boolean not null default false;
