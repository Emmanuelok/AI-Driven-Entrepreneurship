"use client";

import { supabaseBrowser } from "@/lib/supabase";
import { workspaceApi, type AttachmentKind, type WorkspaceFile } from "@/lib/workspace-api";

// Three-step client-side file upload to a workspace.
//
//   1. Ask the server for a one-time signed upload URL.
//   2. Push the bytes to that URL directly via Supabase Storage.
//   3. Tell the server the upload completed → metadata row created.
//
// Returns the registered WorkspaceFile on success, or an error
// message. Designed to be called from a single click handler.

export type UploadOk = { ok: true; file: WorkspaceFile };
export type UploadErr = { ok: false; error: string };

export async function uploadWorkspaceFile(
  workspaceId: string,
  file: File,
  attach?: { kind: AttachmentKind; id: string },
  onProgress?: (uploadedBytes: number, totalBytes: number) => void,
): Promise<UploadOk | UploadErr> {
  if (file.size === 0) return { ok: false, error: "Empty file." };

  const sb = supabaseBrowser();
  if (!sb) return { ok: false, error: "Cloud storage isn't configured in this environment." };

  // 1. Sign.
  const signed = await workspaceApi.signFileUpload(workspaceId, {
    filename: file.name,
    contentType: file.type || "application/octet-stream",
    sizeBytes: file.size,
    attachedToKind: attach?.kind,
    attachedToId: attach?.id,
  });
  if (!signed.ok) return { ok: false, error: signed.error };
  const grant = signed.upload;

  // 2. Upload via the signed URL. uploadToSignedUrl handles the
  // protocol details so we don't need to hand-craft headers; if it ever
  // gets stale we can drop down to a raw fetch PUT to grant.signedUrl.
  onProgress?.(0, file.size);
  const up = await sb.storage.from(grant.bucket).uploadToSignedUrl(grant.path, grant.token, file, {
    contentType: grant.contentType,
    upsert: false,
  });
  if (up.error) return { ok: false, error: up.error.message };
  onProgress?.(file.size, file.size);

  // 3. Register the metadata row.
  const reg = await workspaceApi.registerFile(workspaceId, {
    path: grant.path,
    name: grant.name,
    sizeBytes: grant.sizeBytes,
    contentType: grant.contentType,
    attachedToKind: grant.attachedToKind ?? undefined,
    attachedToId: grant.attachedToId ?? undefined,
  });
  if (!reg.ok) return { ok: false, error: reg.error };

  return { ok: true, file: reg.file };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
