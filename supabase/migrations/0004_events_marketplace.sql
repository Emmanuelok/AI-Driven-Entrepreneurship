-- ─────────────────────────────────────────────────────────────────────────
-- Observability + public AI build marketplace
-- ─────────────────────────────────────────────────────────────────────────

-- Events log: append-only stream of platform events (errors, AI calls,
-- safety blocks, sign-ins, publishes). Powers operator dashboards and
-- post-incident forensics. Old rows pruned by a scheduled task.
create table if not exists public.events (
  id bigserial primary key,
  user_id uuid references auth.users(id) on delete set null,
  kind text not null,                              -- 'error' | 'ai_call' | 'safety_block' | 'sign_in' | 'publish' | 'sync' | ...
  level text not null default 'info',              -- 'debug' | 'info' | 'warn' | 'error' | 'fatal'
  scope text,                                      -- route/component name
  message text,
  ctx jsonb not null default '{}'::jsonb,          -- arbitrary structured detail (no PII)
  ip_hash text,
  ua text,
  created_at timestamptz not null default now()
);
create index if not exists idx_events_kind_created on public.events(kind, created_at desc);
create index if not exists idx_events_user_created on public.events(user_id, created_at desc);
create index if not exists idx_events_level_created on public.events(level, created_at desc);

alter table public.events enable row level security;
-- Users can read their own events (for "what did I do last week" views).
drop policy if exists "events_owner_read" on public.events;
create policy "events_owner_read" on public.events for select using (auth.uid() = user_id);
-- Writes happen via service-role only (so clients can't forge sender id).

-- Public AI build marketplace: students opt-in to publish their build
-- projects so others can browse, fork, and remix. Forking copies the
-- starter HTML + a seed prompt into the recipient's account.
create table if not exists public.public_builds (
  slug text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  build_id text not null,                          -- ref into sankofa-build-v1
  title text not null,
  description text,
  code text not null,                              -- the HTML/JS/CSS bundle
  template_id text,                                -- starting template the author used
  tags text[] not null default '{}',
  forks integer not null default 0,
  views integer not null default 0,
  published_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_public_builds_owner on public.public_builds(owner_id, updated_at desc);
create index if not exists idx_public_builds_forks on public.public_builds(forks desc);
create index if not exists idx_public_builds_tags on public.public_builds using gin(tags);
create index if not exists idx_public_builds_updated on public.public_builds(updated_at desc);

alter table public.public_builds enable row level security;
drop policy if exists "public_builds_world_read" on public.public_builds;
create policy "public_builds_world_read" on public.public_builds for select using (true);
drop policy if exists "public_builds_owner_write" on public.public_builds;
create policy "public_builds_owner_write" on public.public_builds for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create or replace function public.bump_build_views(_slug text) returns void as $$
  update public.public_builds set views = views + 1 where slug = _slug;
$$ language sql;

create or replace function public.bump_build_forks(_slug text) returns void as $$
  update public.public_builds set forks = forks + 1 where slug = _slug;
$$ language sql;
