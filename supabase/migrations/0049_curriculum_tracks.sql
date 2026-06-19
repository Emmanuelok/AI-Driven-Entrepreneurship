-- ─────────────────────────────────────────────────────────────────────────
-- 0049 — DB-driven curriculum tracks.
--
-- v1 had 5 static tracks defined in src/lib/curriculum.ts. They worked
-- for the Learn page but weren't editable by instructors — every
-- cohort that wanted a custom track had to ship JS. v2 ships tracks as
-- a forkable database object: an org can own its own tracks, an
-- instructor can fork a public track and tweak it for their cohort,
-- and the system tracks the lineage.
--
-- Modules live in a jsonb array on the track row, NOT as a separate
-- table. The schema is intentionally loose so we can evolve the
-- module shape (add timestamps, peer-review hooks, completion
-- rubrics) without a migration each time. The shape is:
--
-- {
--   id: string,
--   title: string,
--   summary: string,
--   order: number,
--   duration_min: number,
--   kind: 'concept' | 'interactive' | 'code' | 'lab' | 'venture' |
--         'reading' | 'milestone',
--   resources: [{ kind: 'url'|'reading'|'video', title, url }],
--   milestones: string[]   // human checkpoints
-- }
--
-- cohort_curriculum: a cohort adopts one track. Cohorts that don't
-- adopt one keep using the ad-hoc cohort_assignments path from 0009.
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.curriculum_tracks (
  id uuid primary key default gen_random_uuid(),
  -- Stable slug for /studio/curriculum/[slug] + nicer URLs.
  slug text unique not null,
  -- Optional org owner. NULL = privately owned by owner_user_id, OR
  -- system-seeded (when owner_user_id is NULL — used by the seed below).
  organization_id uuid references public.organizations(id) on delete set null,
  -- Optional user owner. NULL for system-seeded tracks. Always set
  -- for user-created tracks.
  owner_user_id uuid references auth.users(id) on delete set null,
  -- Forking: when this track was forked from another, store the
  -- parent so the UI can render lineage. The parent stays intact;
  -- the fork evolves independently.
  forked_from uuid references public.curriculum_tracks(id) on delete set null,
  version int not null default 1,
  title text not null,
  tagline text not null default '',
  description text not null default '',
  pillar text,
  level text not null default 'foundation'
    check (level in ('foundation', 'intermediate', 'advanced')),
  duration_hours numeric,
  modules jsonb not null default '[]'::jsonb,
  -- Publication gates discovery in the library + the cohort adoption
  -- picker. A track is is_published=false while the instructor is
  -- still building; flipping to true exposes it.
  is_published boolean not null default false,
  -- is_public=true makes it discoverable in the public library
  -- (anyone signed in). is_public=false keeps it visible only to the
  -- owning org + the creator. The seed-tracks below ship is_public=
  -- true so they show up immediately on day-one.
  is_public boolean not null default false,
  fork_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_curriculum_tracks_owner
  on public.curriculum_tracks(owner_user_id, updated_at desc);
create index if not exists idx_curriculum_tracks_org
  on public.curriculum_tracks(organization_id) where organization_id is not null;
create index if not exists idx_curriculum_tracks_public
  on public.curriculum_tracks(is_public, is_published, updated_at desc)
  where is_public = true and is_published = true;

alter table public.curriculum_tracks enable row level security;

-- Read: published-and-public tracks are world-readable to signed-in
-- members; owners always read their own tracks (published or not);
-- org members read org-owned tracks.
drop policy if exists "curriculum_tracks_read" on public.curriculum_tracks;
create policy "curriculum_tracks_read"
  on public.curriculum_tracks for select to authenticated
  using (
    (is_public = true and is_published = true)
    or owner_user_id = auth.uid()
    or (
      organization_id is not null and organization_id in (
        select organization_id from public.organization_members where user_id = auth.uid()
      )
    )
    or (
      organization_id is not null and organization_id in (
        select id from public.organizations where owner_user_id = auth.uid()
      )
    )
  );

-- Write: owner only at the row level (org-track edits go through the
-- service-role API which checks org admin+ role).
drop policy if exists "curriculum_tracks_owner_write" on public.curriculum_tracks;
create policy "curriculum_tracks_owner_write"
  on public.curriculum_tracks for update
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());
drop policy if exists "curriculum_tracks_owner_insert" on public.curriculum_tracks;
create policy "curriculum_tracks_owner_insert"
  on public.curriculum_tracks for insert
  with check (owner_user_id = auth.uid());
drop policy if exists "curriculum_tracks_owner_delete" on public.curriculum_tracks;
create policy "curriculum_tracks_owner_delete"
  on public.curriculum_tracks for delete
  using (owner_user_id = auth.uid());

-- Touch-updated_at trigger.
create or replace function public.touch_curriculum_tracks_updated_at()
returns trigger as $$ begin new.updated_at := now(); return new; end; $$ language plpgsql;
drop trigger if exists curriculum_tracks_touch on public.curriculum_tracks;
create trigger curriculum_tracks_touch
  before update on public.curriculum_tracks
  for each row execute function public.touch_curriculum_tracks_updated_at();


-- ─── cohort_curriculum link ──────────────────────────────────────────
-- A cohort can adopt one track. The link is a separate row so we can
-- carry started_at (for week-1 calculation) + customizations (per-
-- cohort overrides without forking the whole track).
create table if not exists public.cohort_curriculum (
  cohort_id uuid primary key references public.cohorts(id) on delete cascade,
  track_id uuid not null references public.curriculum_tracks(id) on delete restrict,
  started_at timestamptz,
  customizations jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_cohort_curriculum_track
  on public.cohort_curriculum(track_id);

alter table public.cohort_curriculum enable row level security;

-- Read: cohort members (uses the existing membership check).
drop policy if exists "cohort_curriculum_member_read" on public.cohort_curriculum;
create policy "cohort_curriculum_member_read"
  on public.cohort_curriculum for select using (
    cohort_id in (select cohort_id from public.cohort_members where user_id = auth.uid())
    or cohort_id in (select id from public.cohorts where owner_id = auth.uid())
  );


-- ─── Seed the 5 v1 tracks into the DB ────────────────────────────────
-- We mirror src/lib/curriculum.ts so day-one cohorts can adopt the
-- existing tracks. Lessons collapse into the new module shape (kind
-- maps 1-1 for concept/interactive/code/lab/venture; duration_min
-- carries minutes). owner_user_id stays NULL — these are system
-- tracks. RLS lets anyone signed in read them (is_public + is_published).
insert into public.curriculum_tracks
  (slug, title, tagline, description, pillar, level, duration_hours, modules, is_published, is_public)
values
  ('stem-intuition', 'Seeing Through Systems',
   'Build intuition for how the physical world works — circuits, forces, waves, code.',
   '',
   'STEM Intuition', 'foundation', 42,
   jsonb_build_array(
     jsonb_build_object('id','circuits-1','order',0,'title','Why electrons move (without scary equations)','duration_min',18,'kind','interactive','summary','Drag-and-drop circuit playground.','resources',jsonb_build_array(),'milestones',jsonb_build_array()),
     jsonb_build_object('id','force-1','order',1,'title','Forces in a Lagos traffic jam','duration_min',22,'kind','concept','summary','Newton''s laws through honking taxis.','resources',jsonb_build_array(),'milestones',jsonb_build_array()),
     jsonb_build_object('id','waves-1','order',2,'title','Hearing the difference between a kora and a guitar','duration_min',25,'kind','interactive','summary','Fourier intuition via local instruments.','resources',jsonb_build_array(),'milestones',jsonb_build_array()),
     jsonb_build_object('id','logic-1','order',3,'title','Boolean logic = market haggling','duration_min',15,'kind','concept','summary','AND/OR/NOT from a mama-put pricing rules.','resources',jsonb_build_array(),'milestones',jsonb_build_array())
   ),
   true, true),
  ('math-mastery', 'The Problem-Solving Mind',
   'AoPS-grade depth: olympiad combinatorics, abstract algebra, real analysis — built up from scratch.',
   '',
   'Mathematical Mastery', 'advanced', 180,
   jsonb_build_array(
     jsonb_build_object('id','induct-1','order',0,'title','The art of mathematical induction','duration_min',35,'kind','concept','summary','Master proof by induction with 12 worked problems.','resources',jsonb_build_array(),'milestones',jsonb_build_array()),
     jsonb_build_object('id','combo-1','order',1,'title','Counting without overcounting','duration_min',40,'kind','interactive','summary','Stars-and-bars, bijections, double-counting.','resources',jsonb_build_array(),'milestones',jsonb_build_array()),
     jsonb_build_object('id','number-1','order',2,'title','Why prime numbers are everything','duration_min',50,'kind','concept','summary','From Euclid to RSA.','resources',jsonb_build_array(),'milestones',jsonb_build_array())
   ),
   true, true),
  ('coding-craft', 'Code That Ships',
   'Codecademy-style, but you ship a real working tool by lesson 4.',
   '',
   'Coding Craft', 'foundation', 60,
   jsonb_build_array(
     jsonb_build_object('id','py-1','order',0,'title','Your first Python script — a M-Pesa expense tracker','duration_min',20,'kind','code','summary','Run code in the browser. No setup.','resources',jsonb_build_array(),'milestones',jsonb_build_array()),
     jsonb_build_object('id','py-2','order',1,'title','Loops by sorting jollof rice orders','duration_min',25,'kind','code','summary','for/while loops with a real lunch-counter dataset.','resources',jsonb_build_array(),'milestones',jsonb_build_array()),
     jsonb_build_object('id','web-1','order',2,'title','Build a WhatsApp-style chat UI in 30 min','duration_min',30,'kind','code','summary','HTML/CSS/JS from zero to deployed.','resources',jsonb_build_array(),'milestones',jsonb_build_array()),
     jsonb_build_object('id','ai-1','order',3,'title','Wire a Claude API call into your tool','duration_min',25,'kind','code','summary','First contact with foundation models.','resources',jsonb_build_array(),'milestones',jsonb_build_array())
   ),
   true, true),
  ('ai-for-your-field', 'AI for Your Field',
   'You''re studying agriculture / law / history / medicine / fashion — here''s how AI changes everything you''ll do.',
   '',
   'AI for Your Field', 'intermediate', 35,
   jsonb_build_array(
     jsonb_build_object('id','agri-ai','order',0,'title','AI for the smallholder farmer','duration_min',30,'kind','concept','summary','Vision-graded produce, voice-bot extension officers, climate forecasting.','resources',jsonb_build_array(),'milestones',jsonb_build_array()),
     jsonb_build_object('id','law-ai','order',1,'title','AI for the African lawyer','duration_min',30,'kind','concept','summary','Case-law RAG, contract review in Pidgin, access-to-justice bots.','resources',jsonb_build_array(),'milestones',jsonb_build_array()),
     jsonb_build_object('id','health-ai','order',2,'title','AI for the community health worker','duration_min',30,'kind','concept','summary','Multimodal triage, drug-interaction checks, maternal monitoring.','resources',jsonb_build_array(),'milestones',jsonb_build_array()),
     jsonb_build_object('id','creative-ai','order',3,'title','AI for the kente-pattern designer','duration_min',30,'kind','concept','summary','Generative design, rights protection, global distribution.','resources',jsonb_build_array(),'milestones',jsonb_build_array())
   ),
   true, true),
  ('venture-building', 'Classroom to Creator',
   'Pick a real local problem. Validate it. Build the MVP. Get paying customers. We walk you through every step.',
   '',
   'Venture Building', 'advanced', 120,
   jsonb_build_array(
     jsonb_build_object('id','v-1','order',0,'title','Picking a problem you''ll actually care about in 5 years','duration_min',25,'kind','venture','summary','Problem-founder fit canvas.','resources',jsonb_build_array(),'milestones',jsonb_build_array()),
     jsonb_build_object('id','v-2','order',1,'title','Customer discovery — 20 interviews in 14 days','duration_min',45,'kind','venture','summary','Scripts, recording, synthesis with AI.','resources',jsonb_build_array(),'milestones',jsonb_build_array()),
     jsonb_build_object('id','v-3','order',2,'title','Build an MVP in a weekend — even if you can''t code','duration_min',90,'kind','lab','summary','No-code + AI co-pilot.','resources',jsonb_build_array(),'milestones',jsonb_build_array()),
     jsonb_build_object('id','v-4','order',3,'title','Pitch like a YC partner — and survive Q&A','duration_min',35,'kind','venture','summary','AI pitch coach drills you on hostile questions.','resources',jsonb_build_array(),'milestones',jsonb_build_array()),
     jsonb_build_object('id','v-5','order',4,'title','Your first 10 paying customers','duration_min',60,'kind','venture','summary','Distribution playbook for African markets.','resources',jsonb_build_array(),'milestones',jsonb_build_array())
   ),
   true, true)
on conflict (slug) do nothing;
