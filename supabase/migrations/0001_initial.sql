-- ─────────────────────────────────────────────────────────────────────────
-- Sankofa Studio — initial Postgres schema (Supabase compatible)
--
-- One table per zustand store. Each row is the user's CURRENT snapshot
-- for that store (we don't try to replay deltas — the platform writes
-- whole stores and Supabase wins as the source of truth). Conflict
-- resolution: last-write-wins by updated_at.
--
-- RLS is on. Users can only see and write their own rows. Service-role
-- requests bypass RLS (used by trusted API routes only).
-- ─────────────────────────────────────────────────────────────────────────

-- Sankofa stores ──────────────────────────────────────────────────────────
create table if not exists public.sankofa_main (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,        -- sankofa-v1 (profile, xp, ventures, lessons, badges)
  updated_at timestamptz not null default now()
);

create table if not exists public.sankofa_builds (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,        -- sankofa-build-v1
  updated_at timestamptz not null default now()
);

create table if not exists public.sankofa_sketches (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,        -- sankofa-sketch-v1
  updated_at timestamptz not null default now()
);

create table if not exists public.sankofa_letters (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,        -- sankofa-letters-v1
  updated_at timestamptz not null default now()
);

create table if not exists public.sankofa_ext (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,        -- sankofa-ext-v1
  updated_at timestamptz not null default now()
);

create table if not exists public.sankofa_me (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,        -- sankofa-me-v1
  updated_at timestamptz not null default now()
);

-- AI usage events ─────────────────────────────────────────────────────────
-- Append-only log of every AI call. Powers admin dashboard, per-user
-- caps, and abuse detection. Old rows are aggregated to a daily roll-up
-- and pruned by a scheduled task (not modeled here).
create table if not exists public.ai_usage (
  id bigserial primary key,
  user_id uuid references auth.users(id) on delete cascade,
  scope text not null,                            -- canvas-assist, eval-judge, etc.
  model text not null,
  tokens_in integer not null default 0,
  tokens_out integer not null default 0,
  cost_usd numeric(10, 6) not null default 0,
  ip_hash text,                                   -- sha256(ip + daily_salt) for spam tracking without storing raw IP
  created_at timestamptz not null default now()
);
create index if not exists idx_ai_usage_user_created on public.ai_usage(user_id, created_at desc);
create index if not exists idx_ai_usage_scope_created on public.ai_usage(scope, created_at desc);

-- Per-user daily cost cap (defaults to $2/day; admins can lift).
create table if not exists public.ai_quotas (
  user_id uuid primary key references auth.users(id) on delete cascade,
  daily_budget_usd numeric(10, 2) not null default 2.00,
  monthly_budget_usd numeric(10, 2) not null default 50.00,
  hard_block boolean not null default false,      -- true = stop service when over budget; false = soft warning only
  updated_at timestamptz not null default now()
);

-- Magic-link tokens (Supabase Auth handles its own, this is for our own audit)
create table if not exists public.sign_in_log (
  id bigserial primary key,
  user_id uuid references auth.users(id) on delete cascade,
  ip_hash text,
  user_agent text,
  signed_in_at timestamptz not null default now()
);

-- ─── Row-Level Security ──────────────────────────────────────────────────
alter table public.sankofa_main enable row level security;
alter table public.sankofa_builds enable row level security;
alter table public.sankofa_sketches enable row level security;
alter table public.sankofa_letters enable row level security;
alter table public.sankofa_ext enable row level security;
alter table public.sankofa_me enable row level security;
alter table public.ai_usage enable row level security;
alter table public.ai_quotas enable row level security;
alter table public.sign_in_log enable row level security;

-- Per-table RLS: a user can read & write only their own row.
do $$
declare t text;
begin
  foreach t in array array['sankofa_main','sankofa_builds','sankofa_sketches','sankofa_letters','sankofa_ext','sankofa_me','ai_quotas']
  loop
    execute format('drop policy if exists "owner_read_%I" on public.%I', t, t);
    execute format('drop policy if exists "owner_write_%I" on public.%I', t, t);
    execute format('create policy "owner_read_%I" on public.%I for select using (auth.uid() = user_id)', t, t);
    execute format('create policy "owner_write_%I" on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)', t, t);
  end loop;
end$$;

-- ai_usage: users read their own; writes only via service role
drop policy if exists "ai_usage_read" on public.ai_usage;
create policy "ai_usage_read" on public.ai_usage for select using (auth.uid() = user_id);

-- sign_in_log: read-only for the user
drop policy if exists "sign_in_log_read" on public.sign_in_log;
create policy "sign_in_log_read" on public.sign_in_log for select using (auth.uid() = user_id);

-- ─── Triggers ────────────────────────────────────────────────────────────
create or replace function public.touch_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end$$ language plpgsql;

do $$
declare t text;
begin
  foreach t in array array['sankofa_main','sankofa_builds','sankofa_sketches','sankofa_letters','sankofa_ext','sankofa_me','ai_quotas']
  loop
    execute format('drop trigger if exists touch_%I on public.%I', t, t);
    execute format('create trigger touch_%I before update on public.%I for each row execute function public.touch_updated_at()', t, t);
  end loop;
end$$;

-- ─── Helpers ─────────────────────────────────────────────────────────────
-- Daily spend for a user (used by /api/ai-quota/check).
create or replace function public.daily_spend(uid uuid) returns numeric as $$
  select coalesce(sum(cost_usd), 0)::numeric
  from public.ai_usage
  where user_id = uid and created_at >= date_trunc('day', now());
$$ language sql stable;

create or replace function public.monthly_spend(uid uuid) returns numeric as $$
  select coalesce(sum(cost_usd), 0)::numeric
  from public.ai_usage
  where user_id = uid and created_at >= date_trunc('month', now());
$$ language sql stable;
