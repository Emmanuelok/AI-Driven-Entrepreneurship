-- ─────────────────────────────────────────────────────────────────────────
-- 0046 — Agentic Sage: agent_runs.
--
-- v1's Sage was a chat partner — it advised; you executed. v2 ships
-- the same Sage as an autonomous operator that takes a task,
-- executes the work (research, draft, schedule), and produces an
-- output you approve before it leaves the platform.
--
-- agent_runs is the durable record of every run: what was asked,
-- what context was passed in, what Sage produced, who approved it,
-- when it shipped. The same row drives the inbox card, the bell
-- notification, and the per-agent dashboards.
--
-- Status machine:
--   pending          → row exists, work hasn't started (queued)
--   running          → Sage is actively producing
--   needs_approval   → output is ready; the user must approve before
--                       any external side-effect (a contact request,
--                       a posted announcement, a sent email)
--   completed        → user approved and the side effect was applied
--   failed           → Sage couldn't finish; error in last step
--   cancelled        → user cancelled before completion
--
-- output is the agent's final structured result. steps is the
-- ordered trace of what Sage did (each step has a label, status,
-- timestamp, and any data the UI wants to surface). Keeping the trace
-- in the row lets us render "Sage's work" without a side table.
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Which agent function ran. Examples: 'outreach_drafter',
  -- 'research_brief', 'fundraise_pack', 'discussion_summary'.
  agent_kind text not null,
  -- Short label the user can scan in their runs list.
  title text not null,
  -- Free-form prompt / instruction the user provided. May be empty
  -- when the agent was kicked off by a structured form rather than
  -- chat.
  prompt text default '',
  -- Structured input — slugs, ids, context passed by the launching
  -- surface. Free shape per agent.
  input jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'needs_approval', 'completed', 'failed', 'cancelled')),
  -- Final output once produced. Per-agent shape; the UI renders
  -- whatever the agent decided to populate.
  output jsonb,
  -- Trace of work. Each entry: { label, status, started_at, finished_at, data? }
  steps jsonb not null default '[]'::jsonb,
  error text,
  -- When the run started actually executing (after queueing) and
  -- when it finished (any terminal status).
  started_at timestamptz,
  completed_at timestamptz,
  -- Approval gate. NULL until the user signs off on a needs_approval run.
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_agent_runs_user
  on public.agent_runs(user_id, created_at desc);
create index if not exists idx_agent_runs_pending
  on public.agent_runs(user_id, status) where status in ('pending', 'running', 'needs_approval');

alter table public.agent_runs enable row level security;

-- Owner reads + writes their own runs. The actual agent execution
-- happens server-side via service-role; the user can cancel + approve
-- through routes that also gate on user_id.
drop policy if exists "agent_runs_owner_read" on public.agent_runs;
create policy "agent_runs_owner_read"
  on public.agent_runs for select using (auth.uid() = user_id);

-- Realtime: the UI subscribes to its own runs so the status badge
-- updates without polling.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.agent_runs; exception when others then null; end;
  end if;
end$$;
