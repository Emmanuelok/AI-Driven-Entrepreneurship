-- ─────────────────────────────────────────────────────────────────────────
-- 0047 — Organizations: the parent layer for cohorts + workspaces.
--
-- v1 shipped cohorts (0009) as standalone — owned by one user, no
-- institutional parent. That worked for solo instructors but fails
-- the moment a university wants to run 10 cohorts under one brand
-- with shared admin staff, aggregate reporting, and verified-domain
-- single sign-on.
--
-- Organizations are the parent. A university, accelerator, bootcamp,
-- secondary school, or fellowship sets up ONE org; it then owns N
-- cohorts, N members (admin staff + instructors), and (later phases)
-- N curriculum tracks the org can share across cohorts.
--
-- Cohorts gain a nullable organization_id so v1 standalone cohorts
-- keep working — they just don't belong to any org. New cohorts can
-- be created under an org from the org dashboard.
--
-- Verified orgs: when the org's institution_domain matches the
-- domain of the owner's email_institution verification (or an admin
-- has manually approved), is_verified flips true and the org carries
-- a trust badge. This stops "Stanford University" being created by
-- a random with no Stanford affiliation.
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  -- Slug for public URL /o/[slug]. URL-safe, unique. Mintable on
  -- create via a sanitized name fallback.
  slug text unique not null,
  name text not null,
  -- The kind drives the org's metadata schema, the cohort defaults,
  -- and the verification rules. 'program' covers fellowships /
  -- non-institutional programs (Mozilla Builders, Tony Elumelu) that
  -- aren't quite a university or accelerator.
  kind text not null default 'other'
    check (kind in ('university', 'accelerator', 'bootcamp', 'school', 'program', 'other')),
  description text not null default '',
  country text not null default '',
  city text not null default '',
  logo_url text,
  website_url text,
  -- Domain that institutional emails from this org use (e.g. 'knust.edu.gh').
  -- When set, members with a verified email_institution matching this
  -- domain are auto-flagged as part of the org. Optional.
  institution_domain text,
  -- Admin-attested OR auto-verified when owner's institution_email
  -- domain matches institution_domain. The trust badge surface reads
  -- this; the org's name only carries weight if it's true.
  is_verified boolean not null default false,
  -- Discoverable in the public org directory at /o.
  is_public boolean not null default false,
  -- Free-form: accent color, default cohort visibility, branding
  -- snippets, partnership tier, etc.
  settings jsonb not null default '{}'::jsonb,
  -- Who's primary admin. Always also in organization_members with
  -- role='owner'; we keep the column denormalized so a single
  -- ownership query doesn't require a join.
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_organizations_owner
  on public.organizations(owner_user_id, updated_at desc);
create index if not exists idx_organizations_public
  on public.organizations(is_public, updated_at desc) where is_public = true;
create index if not exists idx_organizations_kind on public.organizations(kind);
create index if not exists idx_organizations_domain
  on public.organizations(institution_domain) where institution_domain is not null;

alter table public.organizations enable row level security;

-- Anyone signed in can read public orgs. Members can read their own
-- org regardless of public flag (RLS membership check via subquery).
drop policy if exists "organizations_public_read" on public.organizations;
create policy "organizations_public_read"
  on public.organizations for select
  using (
    is_public = true
    or owner_user_id = auth.uid()
    or id in (select organization_id from public.organization_members where user_id = auth.uid())
  );

-- Insert: any signed-in user can create an org. (We rely on the API
-- layer to also insert the owner's organization_members row in the
-- same transaction. RLS just gates the column on auth.uid()).
drop policy if exists "organizations_insert_self" on public.organizations;
create policy "organizations_insert_self"
  on public.organizations for insert
  with check (auth.uid() = owner_user_id);

-- Update: owner only. Admins use the API which writes via service-role
-- (the API checks role; the table policy stays tight as a backstop).
drop policy if exists "organizations_owner_update" on public.organizations;
create policy "organizations_owner_update"
  on public.organizations for update
  using (auth.uid() = owner_user_id)
  with check (auth.uid() = owner_user_id);

drop policy if exists "organizations_owner_delete" on public.organizations;
create policy "organizations_owner_delete"
  on public.organizations for delete
  using (auth.uid() = owner_user_id);

-- Auto-touch updated_at on every UPDATE.
create or replace function public.touch_organizations_updated_at()
returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists organizations_touch_updated on public.organizations;
create trigger organizations_touch_updated
  before update on public.organizations
  for each row execute function public.touch_organizations_updated_at();


-- ─── Organization members ────────────────────────────────────────────
-- Distinct from cohort_members (which is per-cohort). Org members are
-- the staff layer: owners, admins (org-wide privileges), instructors
-- (can run cohorts under the org), staff (read-only support), and
-- observers (read-only auditing — partners, board members).
create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'staff'
    check (role in ('owner', 'admin', 'instructor', 'staff', 'observer')),
  email text,
  display_name text,
  invited_by uuid references auth.users(id) on delete set null,
  joined_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create index if not exists idx_organization_members_user
  on public.organization_members(user_id);

alter table public.organization_members enable row level security;

-- Members read their own membership row. Owner/admins read all in
-- their org via the helper RPC.
drop policy if exists "organization_members_self_read" on public.organization_members;
create policy "organization_members_self_read"
  on public.organization_members for select
  using (
    user_id = auth.uid()
    or organization_id in (
      select organization_id from public.organization_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );

-- All writes via service-role API routes (the API enforces role).


-- ─── Organization invites ────────────────────────────────────────────
-- Email-targeted single-use OR link-share multi-use, mirroring the
-- workspace_invites + cohort_invites pattern so the redeem flow at
-- /org-invite/[token] feels identical to /i/[token].
create table if not exists public.organization_invites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  -- NULL → link-share. Non-NULL → single-use, must match redeemer's email
  -- (we warn but still allow mismatch, like the workspace flow).
  email text,
  role text not null default 'staff'
    check (role in ('admin', 'instructor', 'staff', 'observer')),
  invited_by uuid references auth.users(id) on delete set null,
  max_uses int not null default 1 check (max_uses between 1 and 200),
  uses int not null default 0,
  expires_at timestamptz not null default (now() + interval '30 days'),
  created_at timestamptz not null default now()
);

create index if not exists idx_organization_invites_org
  on public.organization_invites(organization_id, created_at desc);
create index if not exists idx_organization_invites_token
  on public.organization_invites(token);

alter table public.organization_invites enable row level security;

-- Owners + admins read pending invites for their org.
drop policy if exists "organization_invites_admin_read" on public.organization_invites;
create policy "organization_invites_admin_read"
  on public.organization_invites for select
  using (
    organization_id in (
      select organization_id from public.organization_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );


-- ─── Cohort ↔ Organization link ──────────────────────────────────────
-- Existing cohorts (0009) get a nullable parent. NULL = standalone
-- (v1 behavior preserved). Set = belongs to the org; the org's admins
-- can manage it; the cohort appears on the org dashboard.
alter table public.cohorts
  add column if not exists organization_id uuid references public.organizations(id) on delete set null;

create index if not exists idx_cohorts_organization
  on public.cohorts(organization_id, updated_at desc) where organization_id is not null;


-- ─── Helper RPC: who am I in this org? ───────────────────────────────
-- Mirrors is_workspace_member from the workspace layer. Returns the
-- role or NULL when the caller isn't a member. Owner ALWAYS returns
-- 'owner' regardless of an organization_members row, so the org can't
-- accidentally lock itself out.
create or replace function public.is_organization_member(
  _organization_id uuid,
  _user_id uuid
) returns text as $$
declare
  v_owner uuid;
  v_role text;
begin
  select owner_user_id into v_owner from public.organizations where id = _organization_id;
  if v_owner is null then return null; end if;
  if v_owner = _user_id then return 'owner'; end if;
  select role into v_role from public.organization_members
    where organization_id = _organization_id and user_id = _user_id;
  return v_role;
end;
$$ language plpgsql stable security definer;

-- Realtime publication so admin dashboards update live.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.organizations; exception when others then null; end;
    begin alter publication supabase_realtime add table public.organization_members; exception when others then null; end;
  end if;
end$$;
