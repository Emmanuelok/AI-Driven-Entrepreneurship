-- ─────────────────────────────────────────────────────────────────────────
-- Discount codes — per-seller promo codes that knock down the price on a
-- specific cohort or build (or, when target is null, any of the seller's
-- products). We manage discounts in-app rather than via Stripe coupons
-- because Stripe coupons are platform-wide on Connect, not per-seller.
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.discount_codes (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references auth.users(id) on delete cascade,
  code text not null,                                  -- case-insensitive: stored as upper
  kind text not null check (kind in ('percent', 'fixed')),
  value integer not null check (value > 0),            -- percent: 1-100; fixed: cents
  applies_to_kind text check (applies_to_kind in ('cohort', 'build')),  -- null = any product owned by this seller
  applies_to_ref text,                                 -- cohort uuid OR build slug; null = global to seller
  max_redemptions integer,                             -- null = unlimited
  redemptions integer not null default 0,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Codes are case-insensitive; we store them uppercased.
create unique index if not exists uniq_discount_codes_seller_code on public.discount_codes(seller_id, upper(code));
create index if not exists idx_discount_codes_seller on public.discount_codes(seller_id, created_at desc);

alter table public.discount_codes enable row level security;
drop policy if exists "discount_codes_seller_read" on public.discount_codes;
create policy "discount_codes_seller_read" on public.discount_codes for select using (auth.uid() = seller_id);
drop policy if exists "discount_codes_seller_insert" on public.discount_codes;
create policy "discount_codes_seller_insert" on public.discount_codes for insert with check (auth.uid() = seller_id);
drop policy if exists "discount_codes_seller_update" on public.discount_codes;
create policy "discount_codes_seller_update" on public.discount_codes for update using (auth.uid() = seller_id) with check (auth.uid() = seller_id);
drop policy if exists "discount_codes_seller_delete" on public.discount_codes;
create policy "discount_codes_seller_delete" on public.discount_codes for delete using (auth.uid() = seller_id);

-- Public validation goes via service-role + the /validate endpoint —
-- we don't expose codes to anonymous SELECTs because that would let
-- people enumerate everyone's promos.

create or replace function public.touch_discount_code() returns trigger as $$
begin new.updated_at = now(); return new; end$$ language plpgsql;
drop trigger if exists touch_discount_code_trg on public.discount_codes;
create trigger touch_discount_code_trg before update on public.discount_codes
  for each row execute function public.touch_discount_code();
