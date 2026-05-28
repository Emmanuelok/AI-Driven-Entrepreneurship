-- ─────────────────────────────────────────────────────────────────────────
-- Social layer (claps + comments) + admin role
-- ─────────────────────────────────────────────────────────────────────────

-- Polymorphic target: any public artifact identified by (kind, slug).
-- Today: kind ∈ {'build', 'venture'}; easy to extend.

-- Claps — anonymous-ish "I liked this". One per user per artifact.
create table if not exists public.claps (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  slug text not null,
  created_at timestamptz not null default now(),
  unique (user_id, kind, slug)
);
create index if not exists idx_claps_target on public.claps(kind, slug);

alter table public.claps enable row level security;
-- World-read so totals show up on public profiles without auth.
drop policy if exists "claps_world_read" on public.claps;
create policy "claps_world_read" on public.claps for select using (true);
-- Only the clapper can write their own clap.
drop policy if exists "claps_self_write" on public.claps;
create policy "claps_self_write" on public.claps for insert with check (auth.uid() = user_id);
drop policy if exists "claps_self_delete" on public.claps;
create policy "claps_self_delete" on public.claps for delete using (auth.uid() = user_id);

-- Comments. Single-level (no threading) for now — keeps moderation
-- tractable. Author name comes from auth.users; we cache display_name
-- at write-time to avoid joins on every read.
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null,
  kind text not null,
  slug text not null,
  body text not null,
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_comments_target on public.comments(kind, slug, created_at desc);
create index if not exists idx_comments_user on public.comments(user_id);

alter table public.comments enable row level security;
drop policy if exists "comments_world_read" on public.comments;
create policy "comments_world_read" on public.comments for select using (hidden = false);
drop policy if exists "comments_self_write" on public.comments;
create policy "comments_self_write" on public.comments for insert with check (auth.uid() = user_id);
drop policy if exists "comments_self_update" on public.comments;
create policy "comments_self_update" on public.comments for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "comments_self_delete" on public.comments;
create policy "comments_self_delete" on public.comments for delete using (auth.uid() = user_id);

-- Admin role — assigned out of band (env-managed list of admin emails
-- or a manual update to this table). Used by /admin pages + the
-- operator dashboard endpoints to gate access.
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  granted_at timestamptz not null default now(),
  note text
);
alter table public.admins enable row level security;
-- Admins can see all admins. Public users can't enumerate.
drop policy if exists "admins_self_or_admin_read" on public.admins;
create policy "admins_self_or_admin_read" on public.admins for select using (
  auth.uid() = user_id or auth.uid() in (select user_id from public.admins)
);

-- Helper RPC: am I an admin?
create or replace function public.is_admin(uid uuid) returns boolean as $$
  select exists(select 1 from public.admins where user_id = uid);
$$ language sql stable;

-- ─── Aggregates for dashboards ───────────────────────────────────────────
-- Daily AI cost roll-up — cheap to scan for the admin dashboard.
create or replace view public.daily_ai_cost as
  select
    date_trunc('day', created_at) as day,
    scope,
    sum(cost_usd) as cost_usd,
    sum(tokens_in) as tokens_in,
    sum(tokens_out) as tokens_out,
    count(*) as calls
  from public.ai_usage
  group by 1, 2;

-- Daily events roll-up by kind + level.
create or replace view public.daily_events as
  select
    date_trunc('day', created_at) as day,
    kind,
    level,
    count(*) as n
  from public.events
  group by 1, 2, 3;
