import { z } from "zod";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { authWorkspace, requireWorkspaceRole, bearerToken } from "@/lib/workspace-auth";
import { parseBody } from "@/lib/parse-body";
import { embed } from "@/lib/embeddings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST — workspace-scoped semantic search. Members only.
//
// Body: { q: string, kind?: 'message'|'doc'|'task'|'deadline', limit?: number }
//
// Returns kNN hits from this workspace's index, with similarity scores
// so the caller can dim weaker matches. The workspace_search_match
// RPC enforces the workspace_id scope server-side; the route also
// gates on workspace membership for defense in depth.

const Body = z.object({
  q: z.string().min(2).max(500),
  kind: z.enum(["message", "doc", "task", "deadline"]).optional(),
  limit: z.number().int().min(1).max(30).optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await params;
  const me = await authWorkspace(bearerToken(req), id);
  const forbid = requireWorkspaceRole(me, "viewer");
  if (forbid) return forbid;

  const parsed = await parseBody(req, Body);
  if (!parsed.ok) return parsed.response;
  const { q, kind, limit } = parsed.data;

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  let queryVec: number[];
  try {
    const [v] = await embed([q]);
    if (!v || v.length === 0) return Response.json({ ok: true, results: [] });
    queryVec = v;
  } catch {
    return Response.json({ ok: true, results: [] });
  }

  const { data, error } = await sb.rpc("workspace_search_match", {
    _workspace_id: id,
    query_embedding: queryVec,
    match_count: limit ?? 12,
    kind_filter: kind ?? null,
  });
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  return Response.json({ ok: true, query: q, results: data ?? [] });
}
