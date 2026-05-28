-- ─────────────────────────────────────────────────────────────────────────
-- Per-venture rows + collaborators — foundation for real-time co-editing.
--
-- We keep the existing sankofa_main blob untouched so local-first ventures
-- keep working unchanged. Ventures opt INTO cloud collaboration via the
-- "Make this collaborative" CTA, which copies the local venture into the
-- cloud_ventures table and starts a realtime channel for peers.
--
-- Conflict resolution is last-write-wins by updated_at (no CRDT). With
-- Realtime broadcasts on top, simultaneous edits resolve to whichever
-- patch landed at the server last — good enough for v1 co-editing.
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.cloud_ventures (
  id text primary key,                                 -- reuses the local venture id (nanoid)
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Untitled venture',
  data jsonb not null default '{}'::jsonb,             -- full venture state
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_cloud_ventures_owner on public.cloud_ventures(owner_id, updated_at desc);

create table if not exists public.venture_collaborators (
  venture_id text not null references public.cloud_ventures(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'editor',                 -- 'owner' | 'editor' | 'viewer'
  email text,                                          -- cached for display
  display_name text,                                   -- cached for display
  invited_by uuid references auth.users(id) on delete set null,
  joined_at timestamptz not null default now(),
  primary key (venture_id, user_id)
);

create index if not exists idx_venture_collaborators_user on public.venture_collaborators(user_id);

-- Pending invites (by email — recipient may not have a Sankofa account yet).
create table if not exists public.venture_invites (
  id uuid primary key default gen_random_uuid(),
  venture_id text not null references public.cloud_ventures(id) on delete cascade,
  email text not null,
  role text not null default 'editor',
  token text not null unique default encode(gen_random_bytes(18), 'base64'),
  invited_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '14 days'),
  created_at timestamptz not null default now()
);

create index if not exists idx_venture_invites_email on public.venture_invites(email);
create index if not exists idx_venture_invites_venture on public.venture_invites(venture_id);

-- ─── RLS ─────────────────────────────────────────────────────────────────
alter table public.cloud_ventures enable row level security;
alter table public.venture_collaborators enable row level security;
alter table public.venture_invites enable row level security;

-- Owner + active collaborators see the venture.
drop policy if exists "cloud_ventures_member_read" on public.cloud_ventures;
create policy "cloud_ventures_member_read" on public.cloud_ventures for select using (
  auth.uid() = owner_id
  or auth.uid() in (select user_id from public.venture_collaborators where venture_id = cloud_ventures.id)
);

-- Owner + editors can write the venture.
drop policy if exists "cloud_ventures_editor_write" on public.cloud_ventures;
create policy "cloud_ventures_editor_write" on public.cloud_ventures for update using (
  auth.uid() = owner_id
  or auth.uid() in (select user_id from public.venture_collaborators where venture_id = cloud_ventures.id and role in ('owner', 'editor'))
) with check (
  auth.uid() = owner_id
  or auth.uid() in (select user_id from public.venture_collaborators where venture_id = cloud_ventures.id and role in ('owner', 'editor'))
);

-- Owner inserts a new venture for themselves.
drop policy if exists "cloud_ventures_owner_insert" on public.cloud_ventures;
create policy "cloud_ventures_owner_insert" on public.cloud_ventures for insert with check (auth.uid() = owner_id);

-- Owner deletes their venture; cascades to collaborators/invites.
drop policy if exists "cloud_ventures_owner_delete" on public.cloud_ventures;
create policy "cloud_ventures_owner_delete" on public.cloud_ventures for delete using (auth.uid() = owner_id);

-- Members see the collaborator roster of a venture they belong to.
drop policy if exists "collaborators_member_read" on public.venture_collaborators;
create policy "collaborators_member_read" on public.venture_collaborators for select using (
  auth.uid() = user_id
  or auth.uid() in (select user_id from public.venture_collaborators c2 where c2.venture_id = venture_collaborators.venture_id)
  or auth.uid() in (select owner_id from public.cloud_ventures where id = venture_collaborators.venture_id)
);

-- Only owner can add/remove collaborators (and the user themselves can
-- leave). Writes go through trusted server endpoints with the service
-- role so we keep this restrictive.
drop policy if exists "collaborators_self_leave" on public.venture_collaborators;
create policy "collaborators_self_leave" on public.venture_collaborators for delete using (auth.uid() = user_id);

-- Invites: only the venture owner sees them.
drop policy if exists "invites_owner_read" on public.venture_invites;
create policy "invites_owner_read" on public.venture_invites for select using (
  auth.uid() in (select owner_id from public.cloud_ventures where id = venture_invites.venture_id)
);

-- ─── Triggers ────────────────────────────────────────────────────────────
create or replace function public.touch_cloud_venture() returns trigger as $$
begin new.updated_at = now(); return new; end$$ language plpgsql;

drop trigger if exists touch_cloud_venture_trg on public.cloud_ventures;
create trigger touch_cloud_venture_trg before update on public.cloud_ventures
  for each row execute function public.touch_cloud_venture();

-- Realtime publication: opt these tables into the supabase_realtime
-- publication so the JS client receives postgres_changes events.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.cloud_ventures; exception when others then null; end;
    begin alter publication supabase_realtime add table public.venture_collaborators; exception when others then null; end;
  end if;
end$$;

-- ─── Helpers ─────────────────────────────────────────────────────────────
-- Convenience: am I a member of this venture? (Service-role bypasses RLS,
-- so trusted server code can call this to gate writes.)
create or replace function public.is_venture_member(_venture_id text, _user_id uuid)
returns text language sql stable as $$
  select case
    when exists (select 1 from public.cloud_ventures where id = _venture_id and owner_id = _user_id) then 'owner'
    when exists (select 1 from public.venture_collaborators where venture_id = _venture_id and user_id = _user_id) then
      (select role from public.venture_collaborators where venture_id = _venture_id and user_id = _user_id limit 1)
    else null
  end;
$$;
