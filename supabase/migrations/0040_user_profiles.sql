-- ─────────────────────────────────────────────────────────────────────────
-- 0040 — User-level profiles + account types.
--
-- The platform serves many kinds of people, not just students:
--   • student      — undergrad/postgrad building ventures (the default)
--   • mentor       — experienced founder, operator, or domain expert
--                    willing to advise; paid or pro-bono
--   • instructor   — university faculty or accelerator partner running
--                    cohorts on the platform
--   • investor     — angel, VC, or family-office writing checks into
--                    Sankofa-incubated ventures
--   • funder       — grant program, accelerator partner, foundation
--                    distributing non-dilutive capital
--   • journalist   — covering the African startup ecosystem; gets
--                    discoverable access to ventures that opted in
--   • institution  — admin account representing a partner organization
--   • general      — none of the above; visiting member
--
-- Each row carries shared profile fields (display_name, bio, country,
-- language, avatar, social links) AND a free-form persona_data jsonb
-- for account-type-specific fields (mentor expertise, investor
-- check-size, instructor courses, etc.). We keep the persona data
-- jsonb instead of polymorphic columns so adding new account types
-- doesn't require a migration each time.
--
-- The `slug` is a stable, URL-safe handle for public profiles at
-- /people/[slug]. is_public gates whether the row appears in the
-- public directory or only to authenticated viewers.
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  account_type text not null default 'student'
    check (account_type in ('student', 'mentor', 'instructor', 'investor', 'funder', 'journalist', 'institution', 'general')),
  slug text unique,
  display_name text not null default '',
  headline text default '',
  bio text default '',
  country text default '',
  city text default '',
  primary_language text default '',
  avatar_url text,
  website_url text,
  linkedin_url text,
  twitter_url text,
  -- Persona-specific fields. Shape depends on account_type; the API
  -- validates per type. Examples:
  --   student:     { institution, schoolId, departmentId, programId, year, field }
  --   mentor:      { expertise: string[], yearsExperience: number,
  --                  availability: 'paid'|'pro-bono'|'both',
  --                  hourlyRate?: number, sectors: string[],
  --                  pastVentures: string[] }
  --   instructor:  { institution, department, courses: string[] }
  --   investor:    { firmName?: string, typicalCheckSize?: number,
  --                  sectors: string[], stages: string[] }
  --   funder:      { programName, focusAreas: string[],
  --                  applicationUrl?: string, fundingRange?: string }
  --   journalist:  { outletName, beats: string[] }
  --   institution: { name, kind: 'university'|'accelerator'|'bootcamp',
  --                  partnersSince?: string }
  persona_data jsonb not null default '{}'::jsonb,
  -- Discovery: appear in /people directory + public profile page.
  is_public boolean not null default false,
  -- 'open' = open to connection requests + DMs from any signed-in user.
  -- 'institution' = only members of the same institution.
  -- 'closed' = no inbound contact.
  contact_policy text not null default 'open'
    check (contact_policy in ('open', 'institution', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_profiles_account_type
  on public.user_profiles(account_type) where is_public = true;
create index if not exists idx_user_profiles_country
  on public.user_profiles(country) where is_public = true;
-- For directory text search across name + headline:
create index if not exists idx_user_profiles_search
  on public.user_profiles using gin (
    to_tsvector('simple', coalesce(display_name, '') || ' ' || coalesce(headline, '') || ' ' || coalesce(bio, ''))
  ) where is_public = true;

alter table public.user_profiles enable row level security;

-- Read: anyone authenticated can read public profiles; signed-in
-- users can always read their own row regardless of is_public.
drop policy if exists "user_profiles_read_public" on public.user_profiles;
create policy "user_profiles_read_public"
  on public.user_profiles for select
  using (is_public = true or auth.uid() = user_id);

-- Write: only the owner can write their own row.
drop policy if exists "user_profiles_write_self" on public.user_profiles;
create policy "user_profiles_write_self"
  on public.user_profiles for insert
  with check (auth.uid() = user_id);
drop policy if exists "user_profiles_update_self" on public.user_profiles;
create policy "user_profiles_update_self"
  on public.user_profiles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
drop policy if exists "user_profiles_delete_self" on public.user_profiles;
create policy "user_profiles_delete_self"
  on public.user_profiles for delete
  using (auth.uid() = user_id);

-- Auto-touch updated_at on every UPDATE.
create or replace function public.touch_user_profiles_updated_at()
returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists user_profiles_touch_updated on public.user_profiles;
create trigger user_profiles_touch_updated
  before update on public.user_profiles
  for each row execute function public.touch_user_profiles_updated_at();
