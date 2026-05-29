-- ─────────────────────────────────────────────────────────────────────────
-- MCP (Model Context Protocol) — turn student-built AI agents into
-- tools that any MCP client (Claude Desktop, Cursor, etc.) can install.
--
-- A cloud build is MCP-enabled when its data.mcp_config is set. The
-- config declares: server name + description + a list of tools, each
-- with a JSON schema for its input and an agent prompt that handles
-- the call. /api/mcp/[slug] implements the JSON-RPC protocol.
--
-- We don't add a column on cloud_builds — mcp_config lives inside the
-- existing data jsonb so the cloud-build sync layer carries it for
-- free. This migration adds mcp_tokens only.
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.mcp_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,                     -- sha256 of the secret; raw token never stored
  name text not null,                                  -- human label set by the user
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_mcp_tokens_user on public.mcp_tokens(user_id, created_at desc);

alter table public.mcp_tokens enable row level security;
drop policy if exists "mcp_tokens_self_read" on public.mcp_tokens;
create policy "mcp_tokens_self_read" on public.mcp_tokens for select using (auth.uid() = user_id);
drop policy if exists "mcp_tokens_self_insert" on public.mcp_tokens;
create policy "mcp_tokens_self_insert" on public.mcp_tokens for insert with check (auth.uid() = user_id);
drop policy if exists "mcp_tokens_self_delete" on public.mcp_tokens;
create policy "mcp_tokens_self_delete" on public.mcp_tokens for delete using (auth.uid() = user_id);
-- last_used_at is bumped via service-role only (during /api/mcp/[slug] auth).

-- ─── Audit / metering ────────────────────────────────────────────────────
-- One row per tools/call invocation. Used for rate limiting + the build
-- author's "who's using my tools" dashboard.
create table if not exists public.mcp_invocations (
  id bigserial primary key,
  caller_user_id uuid not null references auth.users(id) on delete cascade,
  build_slug text not null,
  tool_name text not null,
  duration_ms integer,
  tokens_in integer not null default 0,
  tokens_out integer not null default 0,
  ok boolean not null default true,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists idx_mcp_invocations_build on public.mcp_invocations(build_slug, created_at desc);
create index if not exists idx_mcp_invocations_caller on public.mcp_invocations(caller_user_id, created_at desc);

alter table public.mcp_invocations enable row level security;
-- Caller sees their own invocations; build author sees calls against
-- their builds (cross-join to public_builds.owner_id at policy time).
drop policy if exists "mcp_invocations_read" on public.mcp_invocations;
create policy "mcp_invocations_read" on public.mcp_invocations for select using (
  auth.uid() = caller_user_id
  or auth.uid() in (select owner_id from public.public_builds where slug = mcp_invocations.build_slug)
);
