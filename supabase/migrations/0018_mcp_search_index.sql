-- ─────────────────────────────────────────────────────────────────────────
-- MCP catalog search index.
--
-- A generated tsvector on cloud_builds extracting the searchable bits
-- from data.mcp_config (server name, description, every tool's name +
-- description). Indexed GIN so to_tsquery hits are millisecond.
--
-- The /api/mcp/catalog route still uses the in-memory substring filter
-- because the catalog is small enough today. When it crosses a few
-- thousand rows, swap the route to:
--
--   .textSearch('mcp_search_vec', q, { type: 'websearch' })
--
-- and the index pays off without a single other change. The generated
-- column is automatically null for non-MCP builds, so it stays free.
-- ─────────────────────────────────────────────────────────────────────────

-- jsonb_path_query_array → text accumulator. Postgres doesn't have a
-- one-liner for "stringify every leaf under a path" so we use a CTE-
-- backed immutable function. Marked immutable so it can be used in a
-- generated column (Postgres requires immutability there).
create or replace function public.mcp_searchable_text(d jsonb)
returns text language sql immutable as $$
  select case
    when d is null or d->'mcp_config' is null then null
    else
      coalesce(d->'mcp_config'->>'name', '') || ' ' ||
      coalesce(d->'mcp_config'->>'description', '') || ' ' ||
      coalesce(
        (
          select string_agg(
            coalesce(t->>'name', '') || ' ' || coalesce(t->>'description', ''),
            ' '
          )
          from jsonb_array_elements(coalesce(d->'mcp_config'->'tools', '[]'::jsonb)) as t
        ),
        ''
      )
  end;
$$;

-- The generated column. STORED so the GIN index can use it directly.
alter table public.cloud_builds
  add column if not exists mcp_search_vec tsvector
  generated always as (to_tsvector('simple', coalesce(public.mcp_searchable_text(data), ''))) stored;

create index if not exists idx_cloud_builds_mcp_search
  on public.cloud_builds using gin (mcp_search_vec);
