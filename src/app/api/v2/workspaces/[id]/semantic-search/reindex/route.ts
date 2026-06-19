import { isSupabaseConfigured } from "@/lib/supabase";
import { authWorkspace, requireWorkspaceRole, bearerToken } from "@/lib/workspace-auth";
import { reindexWorkspace } from "@/lib/workspace-search-indexer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Reindex can take 10-30s on a large workspace; allow Vercel up to
// 60s. (We don't background-queue this yet — Phase 64+ will).
export const maxDuration = 60;

// POST — full reindex of a workspace. Admin+ only.
//
// Use cases:
//   - The body-composer in workspace-search-indexer.ts changed.
//   - A workspace was created before Phase 63 and never had write
//     hooks fire.
//   - A bulk operation accidentally skipped indexing and the search
//     surface looks stale.
//
// We don't expose this on a cron — workspaces shouldn't pay the embed
// cost when nothing's changed. The admin clicks it consciously.

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await params;
  const me = await authWorkspace(bearerToken(req), id);
  const forbid = requireWorkspaceRole(me, "admin");
  if (forbid) return forbid;

  const result = await reindexWorkspace(id);
  return Response.json({ ok: result.ok, counts: result.counts });
}
