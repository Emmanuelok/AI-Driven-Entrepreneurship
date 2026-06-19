import { z } from "zod";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { authWorkspace, requireWorkspaceRole, bearerToken } from "@/lib/workspace-auth";
import { parseBody } from "@/lib/parse-body";
import { indexWorkspaceDoc, unindexWorkspaceRow } from "@/lib/workspace-search-indexer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET    — full note (with body). Any member.
// PATCH  — save title/body. Editor+. Optimistic concurrency: the client
//          sends the `version` it last loaded. If the server's version
//          is higher, someone else saved first — we 409 with the
//          current doc so the client can reconcile rather than silently
//          clobber. (The DB trigger bumps version on every content
//          change, so this stays honest.)
// DELETE — remove a note. Editor+.

const PatchBody = z.object({
  title: z.string().max(200).optional(),
  body: z.string().max(100_000).optional(),
  version: z.number().int().min(1),
});

export async function GET(req: Request, { params }: { params: Promise<{ id: string; docId: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id, docId } = await params;
  const me = await authWorkspace(bearerToken(req), id);
  if (!me) return Response.json({ ok: false, error: "not_a_member" }, { status: 403 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const { data, error } = await sb
    .from("workspace_docs")
    .select("*")
    .eq("id", docId)
    .eq("workspace_id", id)
    .maybeSingle();
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  if (!data) return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  return Response.json({ ok: true, doc: data });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; docId: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id, docId } = await params;
  const me = await authWorkspace(bearerToken(req), id);
  const forbid = requireWorkspaceRole(me, "editor");
  if (forbid) return forbid;

  const parsed = await parseBody(req, PatchBody);
  if (!parsed.ok) return parsed.response;
  const { title, body, version } = parsed.data;

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const { data: current } = await sb
    .from("workspace_docs")
    .select("*")
    .eq("id", docId)
    .eq("workspace_id", id)
    .maybeSingle();
  if (!current) return Response.json({ ok: false, error: "not_found" }, { status: 404 });

  // Stale write → 409 with the winning version so the client reconciles.
  if (current.version > version) {
    return Response.json({ ok: false, error: "version_conflict", current }, { status: 409 });
  }

  const displayName = (await displayNameFor(sb, me!.userId)) ?? me!.email ?? "Member";
  const update: Record<string, unknown> = { updated_by: me!.userId, updated_by_name: displayName };
  if (title !== undefined) update.title = title;
  if (body !== undefined) update.body = body;

  const { data, error } = await sb
    .from("workspace_docs")
    .update(update)
    .eq("id", docId)
    .eq("workspace_id", id)
    .select("*")
    .single();
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  // Phase 63: re-index after save. Title or body change → new
  // embedding. Best-effort, fire-and-forget.
  void indexWorkspaceDoc({
    id: data.id,
    workspace_id: data.workspace_id,
    title: data.title,
    body: data.body ?? "",
    updated_at: data.updated_at,
  });

  return Response.json({ ok: true, doc: data });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string; docId: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id, docId } = await params;
  const me = await authWorkspace(bearerToken(req), id);
  const forbid = requireWorkspaceRole(me, "editor");
  if (forbid) return forbid;

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const { error } = await sb.from("workspace_docs").delete().eq("id", docId).eq("workspace_id", id);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  // Phase 63: remove from index so the deleted doc stops surfacing
  // in Sage's RAG answers.
  void unindexWorkspaceRow(id, "doc", docId);

  return Response.json({ ok: true });
}

async function displayNameFor(sb: NonNullable<ReturnType<typeof supabaseAdmin>>, userId: string): Promise<string | null> {
  const { data } = await sb.auth.admin.getUserById(userId);
  return (data?.user?.user_metadata as { name?: string } | null)?.name ?? null;
}
