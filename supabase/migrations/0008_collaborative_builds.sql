-- ─────────────────────────────────────────────────────────────────────────
-- Real-time collaboration on AI Build Studio projects.
-- Mirror of 0007 for the venture surface. Same conflict model (LWW by
-- updated_at, Realtime broadcasts on top), same role taxonomy.
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.cloud_builds (
  id text primary key,                                 -- reuses local nanoid
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Untitled build',
  data jsonb not null default '{}'::jsonb,             -- full build state (code, chat, versions, eval suite)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_cloud_builds_owner on public.cloud_builds(owner_id, updated_at desc);

create table if not exists public.build_collaborators (
  build_id text not null references public.cloud_builds(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'editor',                 -- 'owner' | 'editor' | 'viewer'
  email text,
  display_name text,
  invited_by uuid references auth.users(id) on delete set null,
  joined_at timestamptz not null default now(),
  primary key (build_id, user_id)
);
create index if not exists idx_build_collaborators_user on public.build_collaborators(user_id);

create table if not exists public.build_invites (
  id uuid primary key default gen_random_uuid(),
  build_id text not null references public.cloud_builds(id) on delete cascade,
  email text not null,
  role text not null default 'editor',
  token text not null unique default encode(gen_random_bytes(18), 'base64'),
  invited_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '14 days'),
  created_at timestamptz not null default now()
);
create index if not exists idx_build_invites_email on public.build_invites(email);

alter table public.cloud_builds enable row level security;
alter table public.build_collaborators enable row level security;
alter table public.build_invites enable row level security;

drop policy if exists "cloud_builds_member_read" on public.cloud_builds;
create policy "cloud_builds_member_read" on public.cloud_builds for select using (
  auth.uid() = owner_id
  or auth.uid() in (select user_id from public.build_collaborators where build_id = cloud_builds.id)
);

drop policy if exists "cloud_builds_editor_write" on public.cloud_builds;
create policy "cloud_builds_editor_write" on public.cloud_builds for update using (
  auth.uid() = owner_id
  or auth.uid() in (select user_id from public.build_collaborators where build_id = cloud_builds.id and role in ('owner','editor'))
) with check (
  auth.uid() = owner_id
  or auth.uid() in (select user_id from public.build_collaborators where build_id = cloud_builds.id and role in ('owner','editor'))
);

drop policy if exists "cloud_builds_owner_insert" on public.cloud_builds;
create policy "cloud_builds_owner_insert" on public.cloud_builds for insert with check (auth.uid() = owner_id);

drop policy if exists "cloud_builds_owner_delete" on public.cloud_builds;
create policy "cloud_builds_owner_delete" on public.cloud_builds for delete using (auth.uid() = owner_id);

drop policy if exists "build_collaborators_member_read" on public.build_collaborators;
create policy "build_collaborators_member_read" on public.build_collaborators for select using (
  auth.uid() = user_id
  or auth.uid() in (select user_id from public.build_collaborators c2 where c2.build_id = build_collaborators.build_id)
  or auth.uid() in (select owner_id from public.cloud_builds where id = build_collaborators.build_id)
);

drop policy if exists "build_collaborators_self_leave" on public.build_collaborators;
create policy "build_collaborators_self_leave" on public.build_collaborators for delete using (auth.uid() = user_id);

drop policy if exists "build_invites_owner_read" on public.build_invites;
create policy "build_invites_owner_read" on public.build_invites for select using (
  auth.uid() in (select owner_id from public.cloud_builds where id = build_invites.build_id)
);

-- Triggers
create or replace function public.touch_cloud_build() returns trigger as $$
begin new.updated_at = now(); return new; end$$ language plpgsql;

drop trigger if exists touch_cloud_build_trg on public.cloud_builds;
create trigger touch_cloud_build_trg before update on public.cloud_builds
  for each row execute function public.touch_cloud_build();

-- Realtime publication
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.cloud_builds; exception when others then null; end;
    begin alter publication supabase_realtime add table public.build_collaborators; exception when others then null; end;
  end if;
end$$;

-- Member-check helper
create or replace function public.is_build_member(_build_id text, _user_id uuid)
returns text language sql stable as $$
  select case
    when exists (select 1 from public.cloud_builds where id = _build_id and owner_id = _user_id) then 'owner'
    when exists (select 1 from public.build_collaborators where build_id = _build_id and user_id = _user_id) then
      (select role from public.build_collaborators where build_id = _build_id and user_id = _user_id limit 1)
    else null
  end;
$$;
