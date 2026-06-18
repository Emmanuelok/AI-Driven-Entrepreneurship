-- ─────────────────────────────────────────────────────────────────────────
-- 0041 — Profile contact requests.
--
-- Person-to-person outreach between platform members. A founder reaches
-- out to a mentor, an investor reaches out to a founder, a journalist
-- requests an interview. Distinct from the `connections` table (0016)
-- which links artifacts, and from workspace DMs (0035) which are scoped
-- to a shared workspace. This is the cold-outreach primitive that makes
-- the "Open to contact" badge on a public profile actually do something.
--
-- Flow:
--   1. Sender writes a short intro → row inserted with status 'pending'.
--   2. Recipient sees it in their inbox, replies + sets status to
--      'accepted' or 'declined' (optionally with a reply_body).
--   3. Sender sees the response. On 'accepted', the recipient's reply
--      (which may include how to continue — email, a workspace invite,
--      a calendar link) is revealed.
--
-- Contact policy is enforced at the API layer at send time (open /
-- same-institution / closed), not in the schema, because "same
-- institution" is a fuzzy match the app owns.
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.profile_contacts (
  id uuid primary key default gen_random_uuid(),
  from_user_id uuid not null references auth.users(id) on delete cascade,
  to_user_id uuid not null references auth.users(id) on delete cascade,
  -- Denormalized sender identity so the recipient's inbox renders
  -- without a join (and survives the sender later going private).
  from_name text not null default '',
  from_account_type text not null default 'general',
  -- Where the outreach originated, for the recipient's context:
  -- 'mentor' | 'funder' | 'investor' | 'directory' | 'profile' | …
  context text not null default 'profile',
  subject text not null default '',
  body text not null,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'archived')),
  reply_body text,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  -- Recipient watermark: when they last viewed their inbox, so we can
  -- show an unread count without a separate reads table.
  read_by_recipient boolean not null default false
);

create index if not exists idx_profile_contacts_to
  on public.profile_contacts(to_user_id, created_at desc);
create index if not exists idx_profile_contacts_from
  on public.profile_contacts(from_user_id, created_at desc);
-- Fast unread badge: pending + unread for a recipient.
create index if not exists idx_profile_contacts_unread
  on public.profile_contacts(to_user_id) where read_by_recipient = false;

-- Rate-limit cold outreach: at most one PENDING request from the same
-- sender to the same recipient at a time. Once it's responded to (or
-- archived) they can send again. Prevents inbox spam.
create unique index if not exists ux_profile_contacts_one_pending
  on public.profile_contacts(from_user_id, to_user_id)
  where status = 'pending';

alter table public.profile_contacts enable row level security;

-- Read: either party to the thread can read it.
drop policy if exists "profile_contacts_party_read" on public.profile_contacts;
create policy "profile_contacts_party_read"
  on public.profile_contacts for select
  using (auth.uid() = from_user_id or auth.uid() = to_user_id);

-- Insert: only the sender, and never to themselves.
drop policy if exists "profile_contacts_sender_insert" on public.profile_contacts;
create policy "profile_contacts_sender_insert"
  on public.profile_contacts for insert
  with check (auth.uid() = from_user_id and from_user_id <> to_user_id);

-- Update: only the recipient (to respond / archive / mark read). The
-- sender can't edit after sending.
drop policy if exists "profile_contacts_recipient_update" on public.profile_contacts;
create policy "profile_contacts_recipient_update"
  on public.profile_contacts for update
  using (auth.uid() = to_user_id)
  with check (auth.uid() = to_user_id);

-- Realtime so a new request lights up the recipient's inbox badge live.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.profile_contacts; exception when others then null; end;
  end if;
end$$;
