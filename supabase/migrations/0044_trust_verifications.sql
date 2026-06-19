-- ─────────────────────────────────────────────────────────────────────────
-- 0044 — Trust layer: verifications + peer attestations.
--
-- v1 let anyone claim to be a mentor at Paystack or an investor at
-- Sequoia. v2 needs a trust signal so founders can act on outreach
-- without manually researching every contact.
--
-- Two complementary primitives:
--
-- 1. verifications — system-attested facts about a user.
--    - email_institution: user controls an .edu / .ac.* / similar
--      institutional address. Evidence: { domain, email }.
--    - id_check: third-party ID verification (placeholder for v2.1).
--    - linkedin: linkedin URL claimed + (eventually) confirmed.
--
-- 2. peer_attestations — other members vouching for this user.
--    Example: a founder vouching that a mentor actually helped them
--    ship. The attestor's identity is visible; this is intentionally
--    not anonymous so attestations carry weight and bad-faith ones
--    can be socially counted.
--
-- A profile is "verified" (for the badge) when it has at least one
-- non-expired verification of kind email_institution OR at least 3
-- peer_attestations from distinct attestors. The badge surface
-- explains which signal earned it via the verifications/attestations
-- endpoints — we don't lie about thresholds.
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null
    check (kind in ('email_institution', 'id_check', 'linkedin', 'admin')),
  status text not null default 'pending'
    check (status in ('pending', 'verified', 'rejected', 'expired')),
  -- Per-kind evidence. Examples:
  --   email_institution: { email, domain }
  --   id_check:          { provider, reference_id }
  --   linkedin:          { url }
  --   admin:             { note, by_admin_id }
  evidence jsonb not null default '{}'::jsonb,
  -- Single-use claim token for email_institution. NULL once consumed
  -- or for non-email kinds.
  token text unique,
  -- For email_institution: when the token expires (24h is plenty for
  -- a magic link). NULL for non-time-boxed kinds.
  token_expires_at timestamptz,
  verified_at timestamptz,
  -- For 'admin' verifications: who flipped it. NULL otherwise.
  verified_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_verifications_user
  on public.verifications(user_id, status);
create index if not exists idx_verifications_token
  on public.verifications(token) where token is not null;

alter table public.verifications enable row level security;

-- Owner reads their own verifications. Admin verifications visible to
-- the user — they should always be able to see why their account
-- carries a verified badge.
drop policy if exists "verifications_owner_read" on public.verifications;
create policy "verifications_owner_read"
  on public.verifications for select
  using (auth.uid() = user_id);

-- All writes go through service-role API routes — no direct client
-- inserts. (No policy means RLS blocks everything else.)


-- Peer attestations — short, public, owner-signed vouches.
create table if not exists public.peer_attestations (
  id uuid primary key default gen_random_uuid(),
  -- Who's vouching.
  attestor_user_id uuid not null references auth.users(id) on delete cascade,
  -- Who they're vouching for.
  attested_user_id uuid not null references auth.users(id) on delete cascade,
  -- The role the attestor is endorsing them in. Lets a founder say
  -- "X was a great mentor" while a separate investor says "X was a
  -- great founder" — both add weight, both are visible.
  kind text not null
    check (kind in ('mentor', 'founder', 'investor', 'instructor', 'funder', 'collaborator')),
  body text not null check (length(body) between 8 and 600),
  created_at timestamptz not null default now(),
  -- One attestation per (attestor, attested, kind). Re-running edits
  -- the body via upsert.
  unique (attestor_user_id, attested_user_id, kind)
);

create index if not exists idx_peer_attestations_attested
  on public.peer_attestations(attested_user_id, created_at desc);

alter table public.peer_attestations enable row level security;

-- Public read: attestations are intentionally public; the attestor's
-- identity is part of the credibility signal.
drop policy if exists "peer_attestations_public_read" on public.peer_attestations;
create policy "peer_attestations_public_read"
  on public.peer_attestations for select using (true);

-- Owner-write: only the attestor can create / edit / delete their own
-- attestations. Self-attestation is blocked at insert.
drop policy if exists "peer_attestations_attestor_write" on public.peer_attestations;
create policy "peer_attestations_attestor_write"
  on public.peer_attestations for insert
  with check (auth.uid() = attestor_user_id and attestor_user_id <> attested_user_id);
drop policy if exists "peer_attestations_attestor_update" on public.peer_attestations;
create policy "peer_attestations_attestor_update"
  on public.peer_attestations for update
  using (auth.uid() = attestor_user_id)
  with check (auth.uid() = attestor_user_id);
drop policy if exists "peer_attestations_attestor_delete" on public.peer_attestations;
create policy "peer_attestations_attestor_delete"
  on public.peer_attestations for delete
  using (auth.uid() = attestor_user_id);

-- Convenience function: returns the aggregate verified state for a
-- user. Used by the profile read endpoint to set a top-level "verified"
-- flag on the public payload without a second round trip.
create or replace function public.profile_verified_state(_user_id uuid)
returns jsonb as $$
  with v as (
    select
      bool_or(kind = 'email_institution' and status = 'verified') as institution_email,
      bool_or(kind = 'id_check' and status = 'verified') as id_check,
      bool_or(kind = 'admin' and status = 'verified') as admin_verified
    from public.verifications
    where user_id = _user_id
  ),
  a as (
    select count(distinct attestor_user_id) as attestation_count
    from public.peer_attestations
    where attested_user_id = _user_id
  )
  select jsonb_build_object(
    'institution_email', coalesce(v.institution_email, false),
    'id_check', coalesce(v.id_check, false),
    'admin_verified', coalesce(v.admin_verified, false),
    'attestation_count', coalesce(a.attestation_count, 0),
    -- A profile is "verified" if any of these signals fire. The UI
    -- can also surface partial states (e.g. 3 attestations but no
    -- email check) — see the verifications detail endpoint.
    'verified', coalesce(
      v.institution_email
        or v.id_check
        or v.admin_verified
        or a.attestation_count >= 3,
      false
    )
  )
  from v, a;
$$ language sql stable;
