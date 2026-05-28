-- ─────────────────────────────────────────────────────────────────────────
-- AI quota enforcement + notifications feed
-- ─────────────────────────────────────────────────────────────────────────

-- Notifications feed — cloud-side events that target a specific user.
-- Inserted by trusted server code (clap/comment/fork endpoints), read
-- by the recipient via /api/notifications + the topbar bell.
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,                                  -- 'clap' | 'comment' | 'fork' | 'system'
  actor_id uuid references auth.users(id) on delete set null,
  actor_name text,
  target_kind text,                                    -- 'build' | 'venture' | null
  target_slug text,
  title text not null,                                 -- short, human-readable
  body text,                                           -- optional second line
  url text,                                            -- deep-link to the target
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_user_unread
  on public.notifications(user_id, read, created_at desc);
create index if not exists idx_notifications_user_created
  on public.notifications(user_id, created_at desc);

alter table public.notifications enable row level security;
-- Users see only their own notifications.
drop policy if exists "notifications_owner_read" on public.notifications;
create policy "notifications_owner_read" on public.notifications for select using (auth.uid() = user_id);
-- And can mark them read / delete their own.
drop policy if exists "notifications_owner_update" on public.notifications;
create policy "notifications_owner_update" on public.notifications for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "notifications_owner_delete" on public.notifications;
create policy "notifications_owner_delete" on public.notifications for delete using (auth.uid() = user_id);
-- Writes happen only via service-role so clients can't spoof origin.

-- ─── Owner lookup helpers used by notification senders ───────────────────
-- Returns the owner of a published artifact (build or venture profile)
-- so clap / comment endpoints know who to notify.
create or replace function public.owner_of(_kind text, _slug text) returns uuid as $$
  select case
    when _kind = 'build' then (select owner_id from public.public_builds where slug = _slug)
    when _kind = 'venture' then (select owner_id from public.public_ventures where slug = _slug)
    else null::uuid
  end;
$$ language sql stable;
