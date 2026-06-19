-- ─────────────────────────────────────────────────────────────────────────
-- 0051 — Mentor sessions: real money moves to mentors.
--
-- v1 had cohort pricing + enrollments via Stripe Connect (sellers
-- table from 0011). A mentor's hourly rate was just metadata on
-- persona_data — there was no way for a founder to actually book
-- a session and have money flow.
--
-- Phase 64 builds the mentor-session primitive on top of the existing
-- Stripe Connect infra:
--
--   founder requests → mentor accepts → founder pays via Connect
--   Checkout → session happens off-platform (voice/video is v3) →
--   mentor marks complete → founder leaves review.
--
-- Pricing comes from the mentor's persona_data.hourlyRate at request
-- time (cached on the row), so a rate change after request doesn't
-- shift the contracted price. Application fee follows the platform
-- default (10%) and is applied via Stripe destination charges.
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.mentor_sessions (
  id uuid primary key default gen_random_uuid(),
  -- The mentor providing the session. Must have account_type='mentor'
  -- AND a sellers row with charges_enabled=true to be book-able. The
  -- API gates this; we don't enforce it at the schema level so admin
  -- workflows can backfill.
  mentor_user_id uuid not null references auth.users(id) on delete cascade,
  -- The founder (or any signed-in member) requesting the session.
  founder_user_id uuid not null references auth.users(id) on delete cascade,
  -- Status state machine. See lib/mentor-session-state.ts for the
  -- allowed transitions. requested → accepted → paid → completed →
  -- reviewed. cancelled / refunded are terminal off-ramps.
  status text not null default 'requested' check (status in (
    'requested',  -- founder asked, mentor hasn't responded
    'accepted',   -- mentor said yes; needs payment
    'paid',       -- founder paid via Stripe; session is locked in
    'completed',  -- mentor marked the session as done
    'reviewed',   -- founder left a review post-completion
    'cancelled',  -- either party cancelled before payment
    'refunded'    -- mentor or admin refunded after payment
  )),
  -- Session shape. duration_minutes is the agreed length; price is
  -- mentor's hourly rate × (duration / 60), rounded to cents,
  -- captured at request time so rate edits don't move the contract.
  duration_minutes int not null default 30 check (duration_minutes in (15, 30, 45, 60, 90)),
  scheduled_at timestamptz,
  topic text not null check (length(topic) between 8 and 2000),
  -- Notes the founder added at request time (optional context for the
  -- mentor before they accept).
  founder_notes text default '',
  -- Notes the mentor added after the session (private to the founder).
  mentor_notes text default '',
  -- Pricing snapshot at request time.
  price_cents int not null check (price_cents >= 0),
  currency text not null default 'usd' check (length(currency) = 3),
  application_fee_pct numeric not null default 10.0 check (application_fee_pct >= 0 and application_fee_pct <= 50),
  -- Stripe identifiers — populated when the founder hits the
  -- Checkout endpoint and on webhook callbacks.
  stripe_session_id text,
  stripe_payment_intent_id text,
  paid_at timestamptz,
  -- Review (founder's rating of the mentor post-session). Optional.
  review_rating int check (review_rating between 1 and 5),
  review_body text check (length(review_body) <= 2000),
  reviewed_at timestamptz,
  -- Timestamps tracking the lifecycle.
  accepted_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by_user_id uuid references auth.users(id) on delete set null,
  refunded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_mentor_sessions_mentor
  on public.mentor_sessions(mentor_user_id, created_at desc);
create index if not exists idx_mentor_sessions_founder
  on public.mentor_sessions(founder_user_id, created_at desc);
create index if not exists idx_mentor_sessions_status
  on public.mentor_sessions(status, scheduled_at);
create index if not exists idx_mentor_sessions_stripe_session
  on public.mentor_sessions(stripe_session_id) where stripe_session_id is not null;
create index if not exists idx_mentor_sessions_stripe_intent
  on public.mentor_sessions(stripe_payment_intent_id) where stripe_payment_intent_id is not null;

alter table public.mentor_sessions enable row level security;

-- Read: either party reads. Nobody else — even sessions for the same
-- mentor are private to each founder.
drop policy if exists "mentor_sessions_party_read" on public.mentor_sessions;
create policy "mentor_sessions_party_read"
  on public.mentor_sessions for select
  using (auth.uid() = mentor_user_id or auth.uid() = founder_user_id);

-- Inserts via service-role API (the API checks role + status). Same
-- for updates / deletes. RLS just provides the read backstop.

-- Updated_at trigger.
create or replace function public.touch_mentor_sessions_updated_at()
returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists mentor_sessions_touch on public.mentor_sessions;
create trigger mentor_sessions_touch
  before update on public.mentor_sessions
  for each row execute function public.touch_mentor_sessions_updated_at();

-- Realtime so the founder's "Session accepted" UI lights up live
-- when the mentor responds (and the mentor's inbox lights when a new
-- request lands).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.mentor_sessions; exception when others then null; end;
  end if;
end$$;
