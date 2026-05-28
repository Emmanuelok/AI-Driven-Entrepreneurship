-- ─────────────────────────────────────────────────────────────────────────
-- Sankofa Studio — public venture profiles, push notifications, hiring loop
-- ─────────────────────────────────────────────────────────────────────────

-- Public venture profiles: opt-in projection of a venture row that anyone
-- with the slug can view (read-only). The owner controls what's public
-- via the `payload` they push; we don't auto-derive from sankofa_main
-- so private data never leaks.
create table if not exists public.public_ventures (
  slug text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  venture_id text not null,
  payload jsonb not null,                          -- the public-safe subset
  views integer not null default 0,
  published_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_public_ventures_owner
  on public.public_ventures(owner_id, updated_at desc);

alter table public.public_ventures enable row level security;
-- Anyone can read a published venture (it's public by definition).
drop policy if exists "public_ventures_world_read" on public.public_ventures;
create policy "public_ventures_world_read" on public.public_ventures for select using (true);
-- Only the owner can publish / update / unpublish.
drop policy if exists "public_ventures_owner_write" on public.public_ventures;
create policy "public_ventures_owner_write" on public.public_ventures for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- Cheap view-counter RPC so we don't need a service-role round-trip.
create or replace function public.bump_venture_views(_slug text) returns void as $$
  update public.public_ventures set views = views + 1 where slug = _slug;
$$ language sql;

-- Push subscriptions: web-push endpoints students opt into so we can
-- nudge them on deadlines + weekly digest. Server uses VAPID keys (env)
-- to send. Subscriptions are per-device.
create table if not exists public.push_subscriptions (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

create index if not exists idx_push_user on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;
drop policy if exists "push_owner_read" on public.push_subscriptions;
create policy "push_owner_read" on public.push_subscriptions for select using (auth.uid() = user_id);
drop policy if exists "push_owner_write" on public.push_subscriptions;
create policy "push_owner_write" on public.push_subscriptions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
