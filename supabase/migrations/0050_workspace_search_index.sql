-- ─────────────────────────────────────────────────────────────────────────
-- 0050 — Workspace-private semantic search index.
--
-- v2 shipped two indexes:
--   - search_index (0002) — per-user, gates on user_id
--   - public_search_index (0045) — globally readable, only public rows
--
-- Neither answers the question "what did Achieng say in our workspace
-- last Tuesday?" That's PRIVATE to the workspace members but isn't
-- per-user. Phase 63 adds a third index scoped to each workspace,
-- powering RAG over the room's own messages, docs, tasks, and
-- deadlines.
--
-- Sage's existing workspace context loader (api/v2/workspaces/[id]/
-- sage) joins the workspace tables fresh on every call. That's fine
-- when "right now" is the answer; it can't answer historical or
-- semantic questions. This table fixes that without changing Sage's
-- existing surface — it's additive, RLS-protected, and only Sage's
-- new grounded variant reads from it.
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.workspace_search_index (
  id bigserial primary key,
  -- RLS anchor. Members of this workspace_id can read; nobody else can.
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  -- What's indexed. Each kind maps to a workspace_* table:
  --   message  → workspace_messages.body
  --   doc      → workspace_docs.title + body
  --   task     → workspace_tasks.title + detail
  --   deadline → workspace_deadlines.title + detail
  kind text not null check (kind in ('message', 'doc', 'task', 'deadline')),
  -- Source row id in the kind's table. Composite (workspace_id, kind,
  -- ref_id) is unique so upserts are idempotent on edit.
  ref_id text not null,
  -- Deep-link the Sage answer can drop into a citation badge. For
  -- messages this points at the tab; for docs/tasks/deadlines it's
  -- the workspace surface for that kind.
  ref_url text,
  title text,
  body text not null,
  -- Voyage-3-lite embeddings, matching search_index + public_search_
  -- index dim. Nullable so a failed embed doesn't drop the row from
  -- the table — we just skip it from kNN until next reindex.
  embedding vector(1024),
  updated_at timestamptz not null default now()
);

create unique index if not exists uniq_workspace_search_kind_ref
  on public.workspace_search_index(workspace_id, kind, ref_id);
create index if not exists idx_workspace_search_workspace_updated
  on public.workspace_search_index(workspace_id, updated_at desc);
create index if not exists idx_workspace_search_embedding
  on public.workspace_search_index using ivfflat (embedding vector_cosine_ops) with (lists = 100);

alter table public.workspace_search_index enable row level security;

-- Read: any member of the workspace_id can read its index. Same
-- pattern as workspace_messages / workspace_docs RLS.
drop policy if exists "workspace_search_index_member_read" on public.workspace_search_index;
create policy "workspace_search_index_member_read"
  on public.workspace_search_index for select using (
    workspace_id in (
      select workspace_id from public.workspace_members where user_id = auth.uid()
    )
    or workspace_id in (
      select id from public.workspaces where owner_id = auth.uid()
    )
  );

-- Writes via service-role API routes only — agents/indexers run
-- through the admin client.


-- ─── Cosine kNN RPC scoped to one workspace ──────────────────────────
-- Mirrors public_search_match + search_artifacts but with a hard
-- workspace_id gate so even an admin-client caller can't bleed
-- another workspace's index into a member's results.
create or replace function public.workspace_search_match(
  _workspace_id uuid,
  query_embedding vector(1024),
  match_count int default 12,
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
  from public.workspace_search_index s
  where s.workspace_id = _workspace_id
    and s.embedding is not null
    and (kind_filter is null or s.kind = kind_filter)
  order by s.embedding <=> query_embedding asc
  limit greatest(match_count, 1);
$$;
