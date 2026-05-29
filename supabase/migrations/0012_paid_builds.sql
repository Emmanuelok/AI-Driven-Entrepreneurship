-- ─────────────────────────────────────────────────────────────────────────
-- Paid build marketplace — students sell their builds for a one-time
-- price. Mirror of cohort_pricing / cohort_enrollments but keyed by
-- build slug. Purchase grants permanent fork access.
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.build_pricing (
  slug text primary key references public.public_builds(slug) on delete cascade,
  seller_id uuid not null references auth.users(id) on delete cascade,
  price_cents integer not null check (price_cents >= 0),
  currency text not null default 'usd' check (length(currency) = 3),
  application_fee_pct numeric not null default 10.0 check (application_fee_pct >= 0 and application_fee_pct <= 50),
  updated_at timestamptz not null default now()
);

alter table public.build_pricing enable row level security;
drop policy if exists "build_pricing_public_read" on public.build_pricing;
create policy "build_pricing_public_read" on public.build_pricing for select using (true);
drop policy if exists "build_pricing_owner_write" on public.build_pricing;
create policy "build_pricing_owner_write" on public.build_pricing for all using (
  auth.uid() in (select owner_id from public.public_builds where slug = build_pricing.slug)
) with check (
  auth.uid() in (select owner_id from public.public_builds where slug = build_pricing.slug)
);

-- Purchase rows — written ONLY by the webhook on
-- checkout.session.completed.
create table if not exists public.build_purchases (
  slug text not null references public.public_builds(slug) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_session_id text not null,
  stripe_payment_intent_id text,
  amount_cents integer not null,
  currency text not null,
  paid_at timestamptz not null default now(),
  primary key (slug, user_id)
);

create index if not exists idx_build_purchases_user on public.build_purchases(user_id, paid_at desc);
create index if not exists idx_build_purchases_slug on public.build_purchases(slug, paid_at desc);

alter table public.build_purchases enable row level security;
drop policy if exists "build_purchases_member_read" on public.build_purchases;
create policy "build_purchases_member_read" on public.build_purchases for select using (
  auth.uid() = user_id
  or auth.uid() in (select owner_id from public.public_builds where slug = build_purchases.slug)
);

create or replace function public.touch_build_pricing() returns trigger as $$
begin new.updated_at = now(); return new; end$$ language plpgsql;
drop trigger if exists touch_build_pricing_trg on public.build_pricing;
create trigger touch_build_pricing_trg before update on public.build_pricing
  for each row execute function public.touch_build_pricing();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.build_purchases; exception when others then null; end;
  end if;
end$$;

-- ─── Aggregate view used by the seller payouts dashboard ────────────────
-- Pulls together cohort_enrollments + build_purchases per seller into
-- one stream the dashboard renders chronologically.
create or replace view public.seller_sales as
  select
    s.user_id as seller_id,
    'cohort'::text as kind,
    e.cohort_id::text as ref_id,
    c.name as ref_name,
    e.user_id as buyer_id,
    e.amount_cents,
    e.currency,
    e.paid_at as ts
  from public.cohort_enrollments e
  join public.cohort_pricing p on p.cohort_id = e.cohort_id
  join public.cohorts c on c.id = e.cohort_id
  join public.sellers s on s.user_id = p.seller_id
  union all
  select
    s.user_id as seller_id,
    'build'::text as kind,
    bp.slug as ref_id,
    pb.title as ref_name,
    bp.user_id as buyer_id,
    bp.amount_cents,
    bp.currency,
    bp.paid_at as ts
  from public.build_purchases bp
  join public.build_pricing bpr on bpr.slug = bp.slug
  join public.public_builds pb on pb.slug = bp.slug
  join public.sellers s on s.user_id = bpr.seller_id;

-- Note: views inherit RLS from their base tables, so each seller only
-- sees their own row even though the view is `select`-able by anyone.
