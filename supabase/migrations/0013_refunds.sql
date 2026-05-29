-- ─────────────────────────────────────────────────────────────────────────
-- Refunds — buyers request, sellers approve, Stripe executes.
-- Works for both cohort enrollments and build purchases via a single
-- polymorphic refund_requests table.
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.refund_requests (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('cohort', 'build')),
  ref_id text not null,                                -- cohort uuid (as text) or build slug
  stripe_payment_intent_id text not null,
  amount_cents integer not null,
  currency text not null,
  reason text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  decided_by uuid references auth.users(id) on delete set null,
  stripe_refund_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_refund_requests_buyer on public.refund_requests(buyer_id, created_at desc);
create index if not exists idx_refund_requests_target on public.refund_requests(kind, ref_id);
create index if not exists idx_refund_requests_status on public.refund_requests(status, created_at desc);

-- ─── RLS ─────────────────────────────────────────────────────────────────
alter table public.refund_requests enable row level security;

-- Buyer sees + writes their own pending request. Seller (cohort owner
-- or build owner) sees + can approve/decline anything pointed at their
-- product. After a decision, the row is read-only via RLS — service-
-- role does the Stripe call + status update.
drop policy if exists "refund_requests_buyer_self_read" on public.refund_requests;
create policy "refund_requests_buyer_self_read" on public.refund_requests for select using (
  auth.uid() = buyer_id
  or (
    kind = 'cohort'
    and auth.uid() in (select owner_id from public.cohorts where id::text = refund_requests.ref_id)
  )
  or (
    kind = 'build'
    and auth.uid() in (select owner_id from public.public_builds where slug = refund_requests.ref_id)
  )
);

drop policy if exists "refund_requests_buyer_insert" on public.refund_requests;
create policy "refund_requests_buyer_insert" on public.refund_requests for insert with check (auth.uid() = buyer_id);

-- Status updates happen only via service-role (in /api/v2/payments/refund-decide).

create or replace function public.touch_refund_request() returns trigger as $$
begin new.updated_at = now(); return new; end$$ language plpgsql;
drop trigger if exists touch_refund_request_trg on public.refund_requests;
create trigger touch_refund_request_trg before update on public.refund_requests
  for each row execute function public.touch_refund_request();

-- Realtime: sellers see incoming requests live in their inbox.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.refund_requests; exception when others then null; end;
  end if;
end$$;
