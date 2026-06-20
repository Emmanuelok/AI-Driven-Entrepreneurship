-- ─────────────────────────────────────────────────────────────────────────
-- 0052 — Founder dataroom: gated documents for investor diligence.
--
-- The /v/[slug] public page surfaces a pitch — headline, tagline,
-- bullets, raise status. That's the "lead" version. Investors who
-- engage seriously need more: the deck, the numbers, founder updates,
-- a one-pager. Sharing that material over email loses control;
-- sharing it publicly loses leverage.
--
-- The dataroom is the gated layer. The founder curates items
-- (documents, metrics, files, links, notes) and grants time-limited
-- access to specific viewers. When a founder accepts a contact
-- request from an investor and ticks "unlock dataroom," a grant is
-- minted automatically.
--
-- Grants are time-limited (default 90 days) and revocable. View
-- tracking lives in a small audit table so the founder sees who
-- actually looked at what — useful signal for a follow-up call.
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.venture_dataroom_items (
  id uuid primary key default gen_random_uuid(),
  -- We key by public_ventures.slug because that's the natural unit a
  -- founder works with on /v/[slug]. A venture must be published
  -- before a dataroom can be attached to it.
  venture_slug text not null references public.public_ventures(slug) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('doc', 'metric', 'file', 'link', 'note')),
  title text not null check (length(title) between 1 and 200),
  -- Body for docs + notes (markdown). Empty for the other kinds.
  body text default '',
  -- Single-value field for metrics (e.g. "$8.4k MRR") or links
  -- (URL). Empty for the document kinds.
  value text default '',
  -- Display position. We order ascending; ties broken by created_at.
  position int not null default 0,
  -- 'public' items also render on /v/[slug] (no grant needed). 'gated'
  -- requires an active dataroom grant OR ownership.
  visibility text not null default 'gated' check (visibility in ('public', 'gated')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_venture_dataroom_items_slug
  on public.venture_dataroom_items(venture_slug, position);

alter table public.venture_dataroom_items enable row level security;

-- Read: 'public' items are world-readable to signed-in members.
-- 'gated' items are visible to (a) the owner, OR (b) anyone with an
-- ACTIVE grant on this venture.
drop policy if exists "venture_dataroom_items_read" on public.venture_dataroom_items;
create policy "venture_dataroom_items_read"
  on public.venture_dataroom_items for select to authenticated using (
    visibility = 'public'
    or owner_user_id = auth.uid()
    or exists (
      select 1 from public.venture_dataroom_grants g
      where g.venture_slug = venture_dataroom_items.venture_slug
        and g.granted_to_user_id = auth.uid()
        and g.revoked_at is null
        and (g.expires_at is null or g.expires_at > now())
    )
  );

-- Writes via service-role API routes. RLS just guards reads.

-- Touch updated_at on every write.
create or replace function public.touch_venture_dataroom_items_updated_at()
returns trigger as $$
begin new.updated_at := now(); return new; end;
$$ language plpgsql;

drop trigger if exists venture_dataroom_items_touch on public.venture_dataroom_items;
create trigger venture_dataroom_items_touch
  before update on public.venture_dataroom_items
  for each row execute function public.touch_venture_dataroom_items_updated_at();


-- ─── Grants ─────────────────────────────────────────────────────────
-- One row per (venture, viewer). Owners can hold many grants per
-- venture (one per investor). Re-granting updates the existing row's
-- expiry rather than stacking rows.
create table if not exists public.venture_dataroom_grants (
  id uuid primary key default gen_random_uuid(),
  venture_slug text not null references public.public_ventures(slug) on delete cascade,
  granted_to_user_id uuid not null references auth.users(id) on delete cascade,
  granted_by_user_id uuid not null references auth.users(id) on delete cascade,
  -- Reason text (free-form, owner-supplied) — useful when reviewing
  -- the grant list later. Often "Accepted contact request" when minted
  -- via the Phase 46 contact flow.
  reason text not null default '',
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  -- Stamps the first time a grant was used. NULL means the investor
  -- received the link but never opened it — actionable signal.
  first_viewed_at timestamptz,
  last_viewed_at timestamptz,
  view_count int not null default 0,
  unique (venture_slug, granted_to_user_id)
);

create index if not exists idx_venture_dataroom_grants_venture
  on public.venture_dataroom_grants(venture_slug, granted_at desc);
create index if not exists idx_venture_dataroom_grants_user
  on public.venture_dataroom_grants(granted_to_user_id) where revoked_at is null;

alter table public.venture_dataroom_grants enable row level security;

-- Read: owner of the venture sees all grants; the grantee sees their
-- own row. Nobody else.
drop policy if exists "venture_dataroom_grants_read" on public.venture_dataroom_grants;
create policy "venture_dataroom_grants_read"
  on public.venture_dataroom_grants for select to authenticated using (
    granted_to_user_id = auth.uid()
    or granted_by_user_id = auth.uid()
    or exists (
      select 1 from public.public_ventures pv
      where pv.slug = venture_dataroom_grants.venture_slug and pv.owner_id = auth.uid()
    )
  );

-- Writes via service-role API.

-- Realtime — owner's "grant accepted" / view-count badges update
-- live when an investor opens the room.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.venture_dataroom_grants; exception when others then null; end;
  end if;
end$$;


-- ─── View-tracking RPC ──────────────────────────────────────────────
-- Bumps view_count + last_viewed_at (+ first_viewed_at on the very
-- first hit) atomically. Called from the dataroom read endpoint when
-- a grant-holder loads the page. We don't track owner reloads — they
-- aren't signal for the founder.
create or replace function public.record_dataroom_view(
  _venture_slug text,
  _viewer_user_id uuid
) returns void as $$
  update public.venture_dataroom_grants
     set view_count = view_count + 1,
         last_viewed_at = now(),
         first_viewed_at = coalesce(first_viewed_at, now())
   where venture_slug = _venture_slug
     and granted_to_user_id = _viewer_user_id
     and revoked_at is null
     and (expires_at is null or expires_at > now());
$$ language sql;
