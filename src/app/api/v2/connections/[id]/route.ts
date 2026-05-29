import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// DELETE a single connection by id. RLS lets users only delete their
// own edges; we don't need a user check beyond that.

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await ctx.params;
  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const { data: u } = await sb.auth.getUser(token);
  if (!u?.user) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { error } = await sb.from("connections").delete().eq("id", id).eq("user_id", u.user.id);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  return Response.json({ ok: true });
}
