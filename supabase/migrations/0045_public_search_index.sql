-- ─────────────────────────────────────────────────────────────────────────
-- 0045 — Public semantic search index.
--
-- v1's search_index (0002) was per-user — RLS enforces same-user reads
-- so the index is private. That's right for personal artifacts
-- (interviews, builds, decks) but wrong for the v2 stakeholder
-- surface: a founder wants to find "a mentor who shipped fintech in
-- Kenya" across EVERYONE who's published a public profile.
--
-- This table is the public mirror. Any signed-in user can query it.
-- Rows are indexed from PUBLIC entities only — user_profiles where
-- is_public=true, and public_ventures (every row is public by
-- definition). The indexer pipeline keeps it fresh via PATCH /api/v2/
-- me/profile and POST /api/public/publish.
--
-- We don't store user_id here because the entity_kind + entity_id pair
-- already locates each row, and access is uniformly public.
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.public_search_index (
  id bigserial primary key,
  -- What we're indexing. profile and venture are the v2 essentials;
  -- workspace_public (link/world visibility), public_build, etc. can
  -- be added later without a schema change.
  entity_kind text not null check (entity_kind in ('profile', 'venture')),
  -- The row's natural key in its source table. 'profile' uses
  -- user_profiles.slug; 'venture' uses public_ventures.slug.
  entity_id text not null,
  -- Deep-link path (e.g. '/people/<slug>', '/v/<slug>') so the search
  -- UI can wire results without a per-row lookup.
  href text not null,
  -- Short label shown as the result title (display_name, venture
  -- title, etc.).
  title text not null,
  -- Compact body composed by the indexer (headline + bio + persona
  -- tags + sectors + country + etc.). This is what gets embedded;
  -- changes here drive a re-embed.
  body text not null,
  -- The embedded vector. voyage-3-lite output to match v1's index.
  embedding vector(1024),
  updated_at timestamptz not null default now()
);

create unique index if not exists uniq_public_search_kind_id
  on public.public_search_index(entity_kind, entity_id);

create index if not exists idx_public_search_embedding
  on public.public_search_index using ivfflat (embedding vector_cosine_ops) with (lists = 100);

create index if not exists idx_public_search_kind_updated
  on public.public_search_index(entity_kind, updated_at desc);

alter table public.public_search_index enable row level security;

-- Any signed-in user reads the public index. (Anonymous fetches go
-- through the API route, which uses service-role.)
drop policy if exists "public_search_index_authed_read" on public.public_search_index;
create policy "public_search_index_authed_read"
  on public.public_search_index for select to authenticated using (true);

-- All writes via service-role API routes — no direct client inserts.

-- Cosine kNN over the public index. kind_filter constrains by entity
-- kind (profile or venture) so the search UI can scope a query.
create or replace function public.public_search_match(
  query_embedding vector(1024),
  match_count int default 12,
  kind_filter text default null
) returns table (
  id bigint,
  entity_kind text,
  entity_id text,
  href text,
  title text,
  body text,
  similarity float
)
language sql stable as $$
  select
    s.id, s.entity_kind, s.entity_id, s.href, s.title, s.body,
    1 - (s.embedding <=> query_embedding) as similarity
  from public.public_search_index s
  where (kind_filter is null or s.entity_kind = kind_filter)
    and s.embedding is not null
  order by s.embedding <=> query_embedding asc
  limit greatest(match_count, 1);
$$;
