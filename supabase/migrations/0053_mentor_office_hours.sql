-- ─────────────────────────────────────────────────────────────────────────
-- 0053 — Mentor office hours: group sessions with per-seat payment.
--
-- Phase 64 (0051) shipped 1:1 mentor sessions where one founder pays
-- one mentor for a private slot. Phase 67 extends that to office
-- hours: a mentor publishes a single offering at a fixed time with a
-- capacity > 1, and multiple founders each pay per-seat using the same
-- Stripe Connect rails.
--
-- The two tables here mirror the 1:1 design:
--
--   mentor_office_hours        — the offering (mentor curates)
--   mentor_office_hours_seats  — one row per founder booking
--
-- A founder can book at most one seat per offering. Seats are
-- 'pending' on creation and flip to 'paid' via the Stripe webhook
-- (sankofa_office_hours_seat_id metadata). Capacity is enforced in
-- the API on booking, NOT via a DB constraint — race conditions
-- between checkout sessions are tolerable here because Stripe's
-- application_fee_amount path is idempotent and over-capacity
-- refunds can be handled out-of-band.
--
-- Mentors set price_per_seat_cents directly when creating the
-- offering (cheaper than 1:1 since the time amortizes across seats).
-- The same application_fee_pct platform default applies.
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.mentor_office_hours (
  id uuid primary key default gen_random_uuid(),
  mentor_user_id uuid not null references auth.users(id) on delete cascade,

  title text not null check (length(title) between 4 and 200),
  description text not null default '' check (length(description) <= 4000),

  -- Scheduling.
  scheduled_at timestamptz not null,
  duration_minutes int not null default 60
    check (duration_minutes in (15, 30, 45, 60, 90, 120)),

  -- Group size: 2..50.
  capacity int not null check (capacity between 2 and 50),

  -- Optional location (Zoom / Meet / Spaces / WhatsApp Live URL).
  -- Visible only to paid attendees in the API response.
  location_url text default '',

  -- Pricing.
  price_per_seat_cents int not null check (price_per_seat_cents >= 0),
  currency text not null default 'usd' check (length(currency) = 3),
  application_fee_pct numeric not null default 10.0
    check (application_fee_pct >= 0 and application_fee_pct <= 50),

  -- Status: open (accepts bookings) | cancelled (refunds all paid
  -- seats) | completed (after the session ran; mentor marks).
  status text not null default 'open'
    check (status in ('open', 'cancelled', 'completed')),

  cancelled_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_office_hours_mentor
  on public.mentor_office_hours(mentor_user_id, scheduled_at desc);
create index if not exists idx_office_hours_status_time
  on public.mentor_office_hours(status, scheduled_at);

alter table public.mentor_office_hours enable row level security;

-- Read: open offerings are publicly listable. Mentor sees their own
-- in any status. We don't expose cancelled offerings publicly because
-- they'd clutter the discovery view.
drop policy if exists "office_hours_public_read" on public.mentor_office_hours;
create policy "office_hours_public_read"
  on public.mentor_office_hours for select
  using (status = 'open' or status = 'completed' or auth.uid() = mentor_user_id);

-- Inserts / updates / deletes via service-role API.

create or replace function public.touch_office_hours_updated_at()
returns trigger as $$
begin new.updated_at := now(); return new; end;
$$ language plpgsql;

drop trigger if exists office_hours_touch on public.mentor_office_hours;
create trigger office_hours_touch
  before update on public.mentor_office_hours
  for each row execute function public.touch_office_hours_updated_at();


create table if not exists public.mentor_office_hours_seats (
  id uuid primary key default gen_random_uuid(),
  office_hours_id uuid not null
    references public.mentor_office_hours(id) on delete cascade,
  founder_user_id uuid not null references auth.users(id) on delete cascade,

  status text not null default 'pending'
    check (status in ('pending', 'paid', 'cancelled', 'refunded', 'attended')),

  -- Optional question / context the founder shares with the mentor
  -- before the session.
  founder_question text not null default '' check (length(founder_question) <= 1000),

  -- Stripe linkage.
  stripe_session_id text,
  stripe_payment_intent_id text,
  paid_at timestamptz,
  refunded_at timestamptz,
  cancelled_at timestamptz,

  -- Whether the founder showed up (mentor sets after the session).
  attended boolean not null default false,
  -- Optional rating + review post-session, like 1:1 sessions.
  review_rating int check (review_rating between 1 and 5),
  review_body text check (length(review_body) <= 2000),
  reviewed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (office_hours_id, founder_user_id)
);

create index if not exists idx_office_hours_seats_offering
  on public.mentor_office_hours_seats(office_hours_id, status);
create index if not exists idx_office_hours_seats_founder
  on public.mentor_office_hours_seats(founder_user_id, created_at desc);
create index if not exists idx_office_hours_seats_stripe_session
  on public.mentor_office_hours_seats(stripe_session_id)
  where stripe_session_id is not null;
create index if not exists idx_office_hours_seats_stripe_intent
  on public.mentor_office_hours_seats(stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

alter table public.mentor_office_hours_seats enable row level security;

-- Read: the founder reads their own seats. The mentor reads ALL seats
-- on offerings they own.
drop policy if exists "office_hours_seats_party_read" on public.mentor_office_hours_seats;
create policy "office_hours_seats_party_read"
  on public.mentor_office_hours_seats for select
  using (
    auth.uid() = founder_user_id
    or auth.uid() in (
      select mentor_user_id from public.mentor_office_hours
      where id = office_hours_id
    )
  );

create or replace function public.touch_office_hours_seats_updated_at()
returns trigger as $$
begin new.updated_at := now(); return new; end;
$$ language plpgsql;

drop trigger if exists office_hours_seats_touch on public.mentor_office_hours_seats;
create trigger office_hours_seats_touch
  before update on public.mentor_office_hours_seats
  for each row execute function public.touch_office_hours_seats_updated_at();

-- Realtime so the mentor's roster + the founder's seat status update
-- live when bookings + payments happen.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.mentor_office_hours; exception when others then null; end;
    begin alter publication supabase_realtime add table public.mentor_office_hours_seats; exception when others then null; end;
  end if;
end$$;
