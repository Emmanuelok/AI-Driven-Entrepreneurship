import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { authBuild } from "@/lib/build-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await ctx.params;
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const me = await authBuild(token, id);
  if (!me) return Response.json({ ok: false, error: "not_a_member" }, { status: 403 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin unavailable" }, { status: 500 });

  const [collabs, invites] = await Promise.all([
    sb.from("build_collaborators").select("user_id, role, email, display_name, joined_at").eq("build_id", id),
    me.role === "owner"
      ? sb.from("build_invites").select("id, email, role, expires_at, created_at").eq("build_id", id).gt("expires_at", new Date().toISOString())
      : Promise.resolve({ data: [] as Array<{ id: string; email: string; role: string; expires_at: string; created_at: string }> }),
  ]);

  return Response.json({
    ok: true,
    collaborators: collabs.data ?? [],
    pendingInvites: invites.data ?? [],
    myRole: me.role,
  });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await ctx.params;
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const me = await authBuild(token, id);
  if (!me) return Response.json({ ok: false, error: "not_a_member" }, { status: 403 });

  const url = new URL(req.url);
  const targetId = url.searchParams.get("userId");
  if (!targetId) return Response.json({ ok: false, error: "missing userId" }, { status: 400 });

  if (targetId !== me.userId && me.role !== "owner") {
    return Response.json({ ok: false, error: "only_owner_can_remove_others" }, { status: 403 });
  }
  if (targetId === me.userId && me.role === "owner") {
    return Response.json({ ok: false, error: "owner_cannot_leave_must_delete_or_transfer" }, { status: 400 });
  }

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin unavailable" }, { status: 500 });

  const { error } = await sb.from("build_collaborators").delete().eq("build_id", id).eq("user_id", targetId);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
