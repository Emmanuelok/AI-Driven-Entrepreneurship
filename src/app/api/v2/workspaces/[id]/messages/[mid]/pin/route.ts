import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { authWorkspace, bearerToken } from "@/lib/workspace-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST   — pin a message. Admin/owner OR the author can pin.
// DELETE — unpin. Same authorization.
//
// Pinning is intentionally cheap: just stamps pinned_at + pinned_by on
// the existing message row. No fan-out, no separate pins table.

async function authPin(req: Request, workspaceId: string, mid: string) {
  if (!isSupabaseConfigured()) return { error: Response.json({ ok: false, mode: "local" }, { status: 503 }) };
  const me = await authWorkspace(bearerToken(req), workspaceId);
  if (!me) return { error: Response.json({ ok: false, error: "not_a_member" }, { status: 403 }) };
  const sb = supabaseAdmin();
  if (!sb) return { error: Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 }) };

  const { data: msg } = await sb
    .from("workspace_messages")
    .select("workspace_id, user_id")
    .eq("id", mid)
    .maybeSingle();
  if (!msg || msg.workspace_id !== workspaceId) {
    return { error: Response.json({ ok: false, error: "message_not_in_workspace" }, { status: 404 }) };
  }

  const isAdmin = me.role === "owner" || me.role === "admin";
  const isAuthor = msg.user_id === me.userId;
  if (!isAdmin && !isAuthor) {
    return { error: Response.json({ ok: false, error: "forbidden", note: "Only the message author, an admin, or the owner can pin or unpin." }, { status: 403 }) };
  }
  return { sb, me };
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string; mid: string }> }) {
  const { id, mid } = await params;
  const r = await authPin(req, id, mid);
  if ("error" in r) return r.error;
  const { sb, me } = r;

  const now = new Date().toISOString();
  const { error } = await sb
    .from("workspace_messages")
    .update({ pinned_at: now, pinned_by: me.userId })
    .eq("id", mid)
    .eq("workspace_id", id);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true, pinned_at: now });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string; mid: string }> }) {
  const { id, mid } = await params;
  const r = await authPin(req, id, mid);
  if ("error" in r) return r.error;
  const { sb } = r;

  const { error } = await sb
    .from("workspace_messages")
    .update({ pinned_at: null, pinned_by: null })
    .eq("id", mid)
    .eq("workspace_id", id);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
