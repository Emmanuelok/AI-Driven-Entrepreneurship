-- ─────────────────────────────────────────────────────────────────────────
-- Universal connections — lightweight edges between any two Sankofa
-- artifacts so nothing feels isolated.
--
-- Examples:
--   sketch → venture   ("this canvas was the seed of this venture")
--   build  → problem   ("this build addresses this Atlas problem")
--   letter → venture   ("this LOI is for this venture")
--   mcp    → cohort    ("this MCP server was a cohort assignment")
--   venture → lesson   ("the curriculum lesson that taught me this move")
--
-- Each connection is a single directed edge. The UI shows both
-- directions by querying both sides. Edges are user-scoped (every
-- edge belongs to whoever created it), with RLS so two users can't
-- read each other's connection graph — even though the entities
-- they link to may be public.
--
-- We do NOT foreign-key the to/from ids. Entity kinds span ~10
-- different tables (cloud_builds, cloud_ventures, sketches, letters,
-- cohorts, mcp via slug, marketplace listings, local zustand ids…)
-- and a polymorphic FK would either explode the schema or fail open.
-- Instead, the API validates ids at write time, and orphan edges
-- self-cleanup via a janitor query.
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  from_kind text not null,      -- 'venture' | 'build' | 'sketch' | 'letter' | 'cohort' | 'problem' | 'lesson' | 'mcp' | 'mentor' | 'marketplace'
  from_id text not null,
  to_kind text not null,
  to_id text not null,
  label text,                   -- short user-supplied note ("uses", "implements", "seeded from")
  created_at timestamptz not null default now()
);

create index if not exists idx_connections_user on public.connections(user_id, created_at desc);
create index if not exists idx_connections_from on public.connections(from_kind, from_id);
create index if not exists idx_connections_to on public.connections(to_kind, to_id);

-- Prevent duplicate edges between the same pair (same user, same direction).
create unique index if not exists ux_connections_dedup
  on public.connections(user_id, from_kind, from_id, to_kind, to_id);

alter table public.connections enable row level security;

drop policy if exists "connections_owner_select" on public.connections;
create policy "connections_owner_select" on public.connections for select using (auth.uid() = user_id);

drop policy if exists "connections_owner_insert" on public.connections;
create policy "connections_owner_insert" on public.connections for insert with check (auth.uid() = user_id);

drop policy if exists "connections_owner_delete" on public.connections;
create policy "connections_owner_delete" on public.connections for delete using (auth.uid() = user_id);

-- Realtime so the "Connected to" panels update live when the user
-- links something on another tab / device.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.connections; exception when others then null; end;
  end if;
end$$;
