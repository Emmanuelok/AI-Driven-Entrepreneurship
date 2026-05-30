-- ─────────────────────────────────────────────────────────────────────────
-- Flow Studio cloud sync (Phase 2).
--
-- Phase 1 shipped a local-first zustand persist store. This migration
-- adds the cloud side so a student can edit a flow on their laptop,
-- close it, and continue from their phone — or co-edit with a
-- teammate (Phase 3 will layer realtime collab on top of this base).
--
-- Schema design follows the cloud_builds pattern: one row per flow,
-- whole graph stored as JSONB. At Sankofa scale (flows are dozens of
-- nodes, not thousands) one upsert per save is fine and the JSON
-- diff is small.
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.cloud_flows (
  id text primary key,                  -- nanoid(8) from the client, kept stable
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  -- The full Flow record (nodes + edges + meta). We don't normalize
  -- node/edge rows because (a) cross-row queries against them are not
  -- needed and (b) the typical save is "rewrite the whole graph".
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_cloud_flows_owner on public.cloud_flows(owner_id, updated_at desc);

-- ─── RLS ─────────────────────────────────────────────────────────────────
alter table public.cloud_flows enable row level security;

drop policy if exists "cloud_flows_owner_select" on public.cloud_flows;
create policy "cloud_flows_owner_select" on public.cloud_flows for select using (auth.uid() = owner_id);

drop policy if exists "cloud_flows_owner_insert" on public.cloud_flows;
create policy "cloud_flows_owner_insert" on public.cloud_flows for insert with check (auth.uid() = owner_id);

drop policy if exists "cloud_flows_owner_update" on public.cloud_flows;
create policy "cloud_flows_owner_update" on public.cloud_flows for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists "cloud_flows_owner_delete" on public.cloud_flows;
create policy "cloud_flows_owner_delete" on public.cloud_flows for delete using (auth.uid() = owner_id);

-- ─── Touch trigger ───────────────────────────────────────────────────────
create or replace function public.touch_cloud_flow() returns trigger as $$
begin new.updated_at = now(); return new; end$$ language plpgsql;

drop trigger if exists touch_cloud_flow_trg on public.cloud_flows;
create trigger touch_cloud_flow_trg before update on public.cloud_flows
  for each row execute function public.touch_cloud_flow();

-- Realtime (Phase 3 co-edit foundation). Adds the table to the
-- supabase_realtime publication so a client can subscribe to row
-- changes — co-edit conflict resolution still lives outside the DB,
-- this just opens the wire.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.cloud_flows; exception when others then null; end;
  end if;
end$$;
