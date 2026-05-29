-- ─────────────────────────────────────────────────────────────────────────
-- ux_events — lightweight client-emitted UX telemetry.
--
-- One row per discrete UI event we care about (companion starter
-- click, brain snapshot expanded, etc.). Schema is deliberately
-- minimal: kind + jsonb meta + nullable user_id (signed-out events
-- still useful for understanding fan-out).
--
-- We never insert PII directly; meta should carry counts and category
-- strings only. RLS lets every signed-in user write their own row,
-- never read — aggregation is operator-only via service-role.
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.ux_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  kind text not null,         -- e.g. "companion_starter_clicked"
  meta jsonb,                  -- e.g. {"source": "graph"}
  created_at timestamptz not null default now()
);

create index if not exists idx_ux_events_kind_created on public.ux_events(kind, created_at desc);
create index if not exists idx_ux_events_user_created on public.ux_events(user_id, created_at desc);

alter table public.ux_events enable row level security;

-- Authenticated users can insert their own rows. We allow anonymous
-- inserts too (user_id = null) for events fired before sign-in.
drop policy if exists "ux_events_insert" on public.ux_events;
create policy "ux_events_insert" on public.ux_events for insert with check (
  user_id is null or auth.uid() = user_id
);

-- No SELECT policy — only service-role (admin) reads, used by future
-- operator dashboards. Users cannot read each other's telemetry.
