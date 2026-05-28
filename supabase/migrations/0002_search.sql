-- ─────────────────────────────────────────────────────────────────────────
-- Sankofa Studio — semantic search via pgvector
--
-- Embed any text artifact (a venture canvas block, an interview note, a
-- brainstorm sticky, a build description) and search by meaning. The
-- platform calls /api/search/embed when artifacts are saved; queries hit
-- /api/search/query which converts the search to an embedding and runs
-- a kNN over the user's own rows.
--
-- Embeddings: voyage-3-lite (1024d) by default — cheap, multilingual,
-- matches African student traffic. Swap dims if changing model.
-- ─────────────────────────────────────────────────────────────────────────

create extension if not exists vector;

create table if not exists public.search_index (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,              -- 'venture-canvas-block', 'interview', 'brainstorm-sticky', 'build', etc.
  ref_id text not null,            -- the artifact's id within its store
  ref_url text,                    -- deep-link back to it in the studio
  title text,                      -- short label shown in results
  body text not null,              -- the indexed text (also embedded)
  embedding vector(1024),          -- voyage-3-lite output
  updated_at timestamptz not null default now()
);

-- Composite key on (user_id, kind, ref_id) lets us upsert when an
-- artifact gets edited — same row, new embedding.
create unique index if not exists uniq_search_index_user_kind_ref
  on public.search_index(user_id, kind, ref_id);

-- IVF index for fast cosine search. lists=100 is enough for the first
-- ~50k vectors; bump it when the table grows.
create index if not exists idx_search_embedding
  on public.search_index using ivfflat (embedding vector_cosine_ops) with (lists = 100);

create index if not exists idx_search_user
  on public.search_index(user_id, updated_at desc);

-- RLS — same as the rest: a user sees only their own rows.
alter table public.search_index enable row level security;
drop policy if exists "search_owner_read" on public.search_index;
create policy "search_owner_read" on public.search_index for select using (auth.uid() = user_id);
drop policy if exists "search_owner_write" on public.search_index;
create policy "search_owner_write" on public.search_index for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Helper RPC: nearest neighbours by cosine distance for a given user.
create or replace function public.search_artifacts(
  uid uuid,
  query_embedding vector(1024),
  match_count int default 10,
  kind_filter text default null
) returns table (
  id bigint,
  kind text,
  ref_id text,
  ref_url text,
  title text,
  body text,
  similarity float
)
language sql stable as $$
  select
    s.id, s.kind, s.ref_id, s.ref_url, s.title, s.body,
    1 - (s.embedding <=> query_embedding) as similarity
  from public.search_index s
  where s.user_id = uid
    and (kind_filter is null or s.kind = kind_filter)
  order by s.embedding <=> query_embedding
  limit match_count;
$$;

-- ─── Venture sharing (one-way clone via token) ───────────────────────────
-- The full real-time-collab refactor is a multi-week effort. This is the
-- pragmatic interim: a sharer creates a token; the recipient redeems it
-- to clone the venture snapshot into their own account. Not collaborative,
-- but unblocks "send my deck to my co-founder so they can iterate".

create table if not exists public.venture_shares (
  token text primary key default encode(gen_random_bytes(18), 'base64'),
  owner_id uuid not null references auth.users(id) on delete cascade,
  venture_id text not null,                         -- id within sankofa-v1 store
  payload jsonb not null,                           -- venture snapshot at share time
  uses integer not null default 0,
  max_uses integer not null default 25,
  expires_at timestamptz not null default (now() + interval '14 days'),
  created_at timestamptz not null default now()
);

create index if not exists idx_venture_shares_owner
  on public.venture_shares(owner_id, created_at desc);

alter table public.venture_shares enable row level security;
drop policy if exists "shares_owner_read" on public.venture_shares;
create policy "shares_owner_read" on public.venture_shares for select using (auth.uid() = owner_id);
drop policy if exists "shares_owner_write" on public.venture_shares;
create policy "shares_owner_write" on public.venture_shares for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
-- Anonymous redeem path uses service-role; no public select policy.
