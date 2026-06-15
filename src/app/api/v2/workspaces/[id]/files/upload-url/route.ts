import { z } from "zod";
import { nanoid } from "nanoid";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { authWorkspace, requireWorkspaceRole, bearerToken } from "@/lib/workspace-auth";
import { parseBody } from "@/lib/parse-body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST — mint a one-time signed upload URL for a single file.
//
// The client supplies the original filename, content type, and exact
// size. We:
//   1. Verify the caller is at least an editor in this workspace.
//   2. Cap the size (25 MiB) and reject empty bodies.
//   3. Pick a disambiguated storage path under <workspace_id>/<nanoid>/
//      so we never collide and the RLS policy on storage.objects can
//      check the workspace_id from the first folder segment.
//   4. Return { signedUrl, token, path } — the client then PUTs the
//      bytes directly to Storage (no proxy through our route).
// Confirmation of the upload happens via POST /files (the parent route).

const MAX_BYTES = 25 * 1024 * 1024;
const BUCKET = "workspace-files";

// We allow common doc / image / data MIME types out of the box; anything
// else can be added per-deployment. We DO accept arbitrary octet-stream
// — it's the size cap + member-only RLS that contain risk, not the MIME.
const Body = z.object({
  filename: z.string().min(1).max(200),
  contentType: z.string().min(1).max(200),
  sizeBytes: z.number().int().min(1).max(MAX_BYTES),
  attachedToKind: z.enum(["task", "doc", "message"]).optional().nullable(),
  attachedToId: z.string().min(1).max(64).optional().nullable(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await params;
  const me = await authWorkspace(bearerToken(req), id);
  const forbid = requireWorkspaceRole(me, "editor");
  if (forbid) return forbid;

  const parsed = await parseBody(req, Body);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  // Sanitize filename — keep human-readable but strip path separators
  // and weird characters. The folder layer is the nanoid, so two users
  // can upload "draft.pdf" without colliding.
  const cleanName = body.filename.replace(/[\\/]/g, "_").replace(/[^\w.\-]/g, "_").slice(0, 180) || "file";
  const path = `${id}/${nanoid(10)}/${cleanName}`;

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const { data, error } = await sb.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return Response.json({ ok: false, error: error?.message ?? "signed_url_failed" }, { status: 500 });

  return Response.json({
    ok: true,
    upload: {
      signedUrl: data.signedUrl,
      token: data.token,
      path,
      name: cleanName,
      contentType: body.contentType,
      sizeBytes: body.sizeBytes,
      attachedToKind: body.attachedToKind ?? null,
      attachedToId: body.attachedToId ?? null,
      bucket: BUCKET,
    },
  });
}
