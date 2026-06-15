-- ─────────────────────────────────────────────────────────────────────────
-- 0026 — Workspace file attachments.
--
-- Adds Sankofa's first Supabase Storage bucket plus a metadata table so
-- workspace members can share files (PDFs, images, datasets, drafts)
-- attached to tasks, notes, or floating in the workspace.
--
-- Upload flow:
--   1. Client asks /api/v2/workspaces/[id]/files/upload-url for a
--      one-time signed upload URL (validates membership + size).
--   2. Client PUTs the file directly to that signed URL (no proxy).
--   3. Client confirms with POST /api/v2/workspaces/[id]/files to
--      register the metadata row.
--
-- Download: list returns a fresh 10-minute signed URL per row.
--
-- RLS on storage.objects is keyed by the first path segment — every
-- object lives under `<workspace_id>/<nanoid>/<filename>`, so the
-- workspace id is in storage.foldername(name)[1] and the policy can
-- check membership cheaply.
-- ─────────────────────────────────────────────────────────────────────────

-- ── Bucket (idempotent) ─────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('workspace-files', 'workspace-files', false, 26214400, null)  -- 25 MiB cap
  on conflict (id) do update set file_size_limit = excluded.file_size_limit;

-- ── Metadata table ──────────────────────────────────────────────────────
create table if not exists public.workspace_files (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.workspaces(id) on delete cascade,
  uploaded_by uuid references auth.users(id) on delete set null,
  uploaded_by_name text,
  -- Original filename — preserved for display + downloads. Path holds
  -- the disambiguated storage location.
  name text not null,
  path text not null unique,
  size_bytes bigint not null,
  content_type text not null,
  -- Optional attachment to another workspace object. Convention:
  --   task    — workspace_tasks.id (uuid)
  --   doc     — workspace_docs.id (uuid)
  --   message — workspace_messages.id (uuid)
  --   null    — floating file
  attached_to_kind text,
  attached_to_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_workspace_files_ws on public.workspace_files(workspace_id, created_at desc);
create index if not exists idx_workspace_files_attached on public.workspace_files(attached_to_kind, attached_to_id);

alter table public.workspace_files enable row level security;

drop policy if exists "workspace_files_member_read" on public.workspace_files;
create policy "workspace_files_member_read" on public.workspace_files for select using (
  auth.uid() in (select user_id from public.workspace_members where workspace_id = workspace_files.workspace_id)
  or auth.uid() in (select owner_id from public.workspaces where id = workspace_files.workspace_id)
);

-- All writes go through the service-role API routes (gated on
-- authWorkspace + role), so we leave write policies off the metadata
-- table on purpose.

-- ── Storage RLS — gate reads to workspace members ───────────────────────
-- The bucket is private; storage.objects holds the actual files. We
-- check the first folder segment of the path against workspace_members.
-- Writes are mediated by signed URLs, so we don't need an insert policy
-- here — the signed URL is the capability.
drop policy if exists "workspace_files_storage_member_read" on storage.objects;
create policy "workspace_files_storage_member_read" on storage.objects for select using (
  bucket_id = 'workspace-files'
  and (storage.foldername(name))[1] in (
    select workspace_id from public.workspace_members where user_id = auth.uid()
  )
);

-- ── Realtime publication ────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.workspace_files; exception when others then null; end;
  end if;
end$$;

-- ── Bump workspace updated_at when a file is added ──────────────────────
drop trigger if exists bump_ws_on_file on public.workspace_files;
create trigger bump_ws_on_file after insert on public.workspace_files
  for each row execute function public.bump_workspace_on_content();
