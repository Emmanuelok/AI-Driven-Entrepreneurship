-- ─────────────────────────────────────────────────────────────────────────
-- 0043 — Filterable columns on public_ventures for the investor browse.
--
-- public_ventures (from 0003) stored everything in a jsonb payload,
-- which was fine for the standalone /v/[slug] reader. For the new
-- investor browse surface we need real columns: sector, stage,
-- raising-status, ask amount, region. Querying these via jsonb
-- operators works but doesn't index well at the volumes we're aiming
-- at, and the filter UI gets thorny.
--
-- The publish API (POST /api/public/publish) populates these columns
-- from the payload it's already validating. Rows published before
-- this migration carry NULLs and silently drop out of the filter
-- chips — they're still visible without filters and still reachable
-- at /v/[slug], so nobody's hidden, they just don't slice well until
-- the founder republishes.
-- ─────────────────────────────────────────────────────────────────────────

alter table public.public_ventures
  add column if not exists sectors text[] not null default '{}'::text[],
  add column if not exists stage text,
  add column if not exists is_raising boolean not null default false,
  add column if not exists raising_amount_usd integer,
  add column if not exists region text;

-- Discovery indexes for the investor browse.
create index if not exists idx_public_ventures_raising
  on public.public_ventures(is_raising, updated_at desc) where is_raising = true;
create index if not exists idx_public_ventures_stage
  on public.public_ventures(stage) where stage is not null;
create index if not exists idx_public_ventures_region
  on public.public_ventures(region) where region is not null;
-- GIN over sectors for the multi-select sector filter.
create index if not exists idx_public_ventures_sectors
  on public.public_ventures using gin (sectors);
