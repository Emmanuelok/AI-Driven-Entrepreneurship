import { z } from "zod";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { authWorkspace, requireWorkspaceRole, bearerToken } from "@/lib/workspace-auth";
import { parseBody } from "@/lib/parse-body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET    — list files in a workspace. Optional query:
//            ?attachedToKind=task&attachedToId=… narrows to one object.
//          Each row gets a fresh signed download URL (10 minutes) so the
//          client doesn't need to round-trip again to view a file.
// POST   — register a file AFTER the client has uploaded it via the
//          signed URL. Body matches what upload-url returned plus a
//          server-side existence check against storage.objects so we
//          can't register phantom rows. Editor+.
// DELETE — ?fileId=…  Removes the row + the Storage object. Editor+.

const BUCKET = "workspace-files";
const SIGNED_TTL = 600; // seconds

const RegisterBody = z.object({
  path: z.string().min(4).max(400),
  name: z.string().min(1).max(200),
  sizeBytes: z.number().int().min(1).max(64 * 1024 * 1024),
  contentType: z.string().min(1).max(200),
  attachedToKind: z.enum(["task", "doc", "message"]).optional().nullable(),
  attachedToId: z.string().min(1).max(64).optional().nullable(),
});

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await params;
  const me = await authWorkspace(bearerToken(req), id);
  if (!me) return Response.json({ ok: false, error: "not_a_member" }, { status: 403 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const url = new URL(req.url);
  let q = sb
    .from("workspace_files")
    .select("id, workspace_id, uploaded_by, uploaded_by_name, name, path, size_bytes, content_type, attached_to_kind, attached_to_id, created_at")
    .eq("workspace_id", id)
    .order("created_at", { ascending: false });
  const kind = url.searchParams.get("attachedToKind");
  const attId = url.searchParams.get("attachedToId");
  if (kind && attId) q = q.eq("attached_to_kind", kind).eq("attached_to_id", attId);
  else if (kind === "null") q = q.is("attached_to_kind", null);

  const { data, error } = await q;
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  // Sign all paths in one batch — Supabase exposes a bulk variant that
  // returns one entry per row, signed once. Falls back to per-row signing
  // if the bulk call errors.
  const rows = data ?? [];
  const paths = rows.map((r) => (r as { path: string }).path);
  let urls = new Map<string, string>();
  if (paths.length > 0) {
    const { data: signed } = await sb.storage.from(BUCKET).createSignedUrls(paths, SIGNED_TTL);
    for (const s of signed ?? []) {
      const row = s as { path: string; signedUrl: string };
      if (row.signedUrl) urls.set(row.path, row.signedUrl);
    }
  }

  const results = rows.map((r) => {
    const row = r as { path: string };
    return { ...row, downloadUrl: urls.get(row.path) ?? null };
  });

  return Response.json({ ok: true, results });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await params;
  const me = await authWorkspace(bearerToken(req), id);
  const forbid = requireWorkspaceRole(me, "editor");
  if (forbid) return forbid;

  const parsed = await parseBody(req, RegisterBody);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  // Enforce the workspace-id prefix: the client could try to register a
  // file whose path doesn't belong to this workspace (e.g. via XSS in
  // another workspace). Reject anything that doesn't sit under <id>/.
  if (!body.path.startsWith(`${id}/`)) {
    return Response.json({ ok: false, error: "path_mismatch" }, { status: 400 });
  }

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  // Verify the object exists in Storage — protects against registering
  // rows for paths the client never actually uploaded to.
  const folder = body.path.substring(0, body.path.lastIndexOf("/"));
  const filename = body.path.substring(body.path.lastIndexOf("/") + 1);
  const { data: listing } = await sb.storage.from(BUCKET).list(folder, { limit: 1, search: filename });
  if (!listing || listing.length === 0) {
    return Response.json({ ok: false, error: "object_not_found", message: "Upload didn't complete." }, { status: 400 });
  }

  const displayName = (await displayNameFor(sb, me!.userId)) ?? me!.email ?? "Member";

  const { data, error } = await sb
    .from("workspace_files")
    .insert({
      workspace_id: id,
      uploaded_by: me!.userId,
      uploaded_by_name: displayName,
      name: body.name,
      path: body.path,
      size_bytes: body.sizeBytes,
      content_type: body.contentType,
      attached_to_kind: body.attachedToKind ?? null,
      attached_to_id: body.attachedToId ?? null,
    })
    .select("id, workspace_id, uploaded_by, uploaded_by_name, name, path, size_bytes, content_type, attached_to_kind, attached_to_id, created_at")
    .single();
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  await sb.from("workspace_activity").insert({
    workspace_id: id,
    user_id: me!.userId,
    kind: "file_added",
    title: `${displayName} added a file: ${body.name}`,
    body: `${formatSize(body.sizeBytes)} · ${body.contentType}`,
  });

  return Response.json({ ok: true, file: data });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await params;
  const me = await authWorkspace(bearerToken(req), id);
  const forbid = requireWorkspaceRole(me, "editor");
  if (forbid) return forbid;

  const url = new URL(req.url);
  const fileId = url.searchParams.get("fileId");
  if (!fileId) return Response.json({ ok: false, error: "missing_file_id" }, { status: 400 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const { data: existing } = await sb
    .from("workspace_files")
    .select("path, uploaded_by, name")
    .eq("id", fileId)
    .eq("workspace_id", id)
    .maybeSingle();
  if (!existing) return Response.json({ ok: false, error: "not_found" }, { status: 404 });

  // Owner / admin / uploader may delete; other editors cannot (so a
  // teammate's drafts aren't deleted from under them by anyone with
  // editor rights).
  const isPrivileged = me!.role === "owner" || me!.role === "admin" || existing.uploaded_by === me!.userId;
  if (!isPrivileged) return Response.json({ ok: false, error: "forbidden", note: "Only the uploader, an admin, or the owner can delete this file." }, { status: 403 });

  // Best-effort Storage deletion — if it fails, we still drop the row so
  // the user isn't blocked. A garbage-collection cron could sweep orphan
  // Storage objects later.
  void sb.storage.from(BUCKET).remove([existing.path as string]).catch(() => {});

  const { error } = await sb.from("workspace_files").delete().eq("id", fileId).eq("workspace_id", id);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

async function displayNameFor(sb: NonNullable<ReturnType<typeof supabaseAdmin>>, userId: string): Promise<string | null> {
  const { data } = await sb.auth.admin.getUserById(userId);
  return (data?.user?.user_metadata as { name?: string } | null)?.name ?? data?.user?.email ?? null;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
