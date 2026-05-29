-- ─────────────────────────────────────────────────────────────────────────
-- Payments — Stripe Connect Express for paid cohort enrollments.
-- Sellers (cohort owners + any future paid-creator) onboard via Connect
-- Express, get a Stripe account, set a price on their cohort, and
-- collect via Stripe Checkout. The platform takes an application fee.
--
-- We use Stripe Connect because:
--   - The seller is responsible for KYC + tax (Stripe handles it).
--   - Payouts go directly to the seller (no money laundering exposure).
--   - The platform earns a transparent application fee, not the whole sale.
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.sellers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_account_id text not null unique,
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  details_submitted boolean not null default false,
  country text,                                        -- ISO 2-letter; informs UI ("Stripe doesn't operate here yet")
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.sellers enable row level security;
drop policy if exists "sellers_self_read" on public.sellers;
create policy "sellers_self_read" on public.sellers for select using (auth.uid() = user_id);
-- Writes via service-role only (we don't trust clients to mutate
-- their Stripe account id).

-- Per-cohort pricing. One row per cohort; absence = free.
create table if not exists public.cohort_pricing (
  cohort_id uuid primary key references public.cohorts(id) on delete cascade,
  seller_id uuid not null references auth.users(id) on delete cascade,
  price_cents integer not null check (price_cents >= 0),
  currency text not null default 'usd' check (length(currency) = 3),
  application_fee_pct numeric not null default 10.0 check (application_fee_pct >= 0 and application_fee_pct <= 50),
  updated_at timestamptz not null default now()
);

alter table public.cohort_pricing enable row level security;
-- Anyone in the cohort sees the price (so paid students can confirm).
-- Public reads are fine too — pricing isn't sensitive.
drop policy if exists "cohort_pricing_public_read" on public.cohort_pricing;
create policy "cohort_pricing_public_read" on public.cohort_pricing for select using (true);
-- Only the cohort owner can set or change pricing.
drop policy if exists "cohort_pricing_owner_write" on public.cohort_pricing;
create policy "cohort_pricing_owner_write" on public.cohort_pricing for all using (
  auth.uid() in (select owner_id from public.cohorts where id = cohort_id)
) with check (
  auth.uid() in (select owner_id from public.cohorts where id = cohort_id)
);

-- Enrollments — one row per (cohort, student) once they've paid.
-- Created by webhook on checkout.session.completed; never written by
-- the client directly.
create table if not exists public.cohort_enrollments (
  cohort_id uuid not null references public.cohorts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_session_id text not null,
  stripe_payment_intent_id text,
  amount_cents integer not null,
  currency text not null,
  paid_at timestamptz not null default now(),
  primary key (cohort_id, user_id)
);

alter table public.cohort_enrollments enable row level security;
-- Student sees their own enrollment; cohort instructors see all.
drop policy if exists "cohort_enrollments_member_read" on public.cohort_enrollments;
create policy "cohort_enrollments_member_read" on public.cohort_enrollments for select using (
  auth.uid() = user_id
  or auth.uid() in (select owner_id from public.cohorts where id = cohort_enrollments.cohort_id)
  or auth.uid() in (select user_id from public.cohort_members where cohort_id = cohort_enrollments.cohort_id and role = 'instructor')
);

-- Triggers
create or replace function public.touch_seller() returns trigger as $$
begin new.updated_at = now(); return new; end$$ language plpgsql;
drop trigger if exists touch_seller_trg on public.sellers;
create trigger touch_seller_trg before update on public.sellers
  for each row execute function public.touch_seller();

create or replace function public.touch_cohort_pricing() returns trigger as $$
begin new.updated_at = now(); return new; end$$ language plpgsql;
drop trigger if exists touch_cohort_pricing_trg on public.cohort_pricing;
create trigger touch_cohort_pricing_trg before update on public.cohort_pricing
  for each row execute function public.touch_cohort_pricing();

-- Realtime: enrollments + seller status updates feed live UI badges.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.sellers; exception when others then null; end;
    begin alter publication supabase_realtime add table public.cohort_enrollments; exception when others then null; end;
  end if;
end$$;
