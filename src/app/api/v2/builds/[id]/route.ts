import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { authBuild, requireBuildRole } from "@/lib/build-auth";

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

  const { data, error } = await sb.from("cloud_builds").select("id, owner_id, name, data, updated_at").eq("id", id).maybeSingle();
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  if (!data) return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  return Response.json({ ok: true, build: data, myRole: me.role });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await ctx.params;
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const me = await authBuild(token, id);
  const forbidden = requireBuildRole(me, "editor");
  if (forbidden) return forbidden;

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin unavailable" }, { status: 500 });

  let body: { data?: unknown; name?: string; ifVersionAt?: string };
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: "invalid_json" }, { status: 400 }); }

  if (body.ifVersionAt) {
    const { data: current } = await sb.from("cloud_builds").select("updated_at").eq("id", id).maybeSingle();
    if (current && current.updated_at !== body.ifVersionAt) {
      return Response.json({ ok: false, error: "stale_write", serverUpdatedAt: current.updated_at }, { status: 409 });
    }
  }

  const patch: Record<string, unknown> = {};
  if (body.data !== undefined) patch.data = body.data;
  if (body.name !== undefined) patch.name = String(body.name).slice(0, 200);
  if (Object.keys(patch).length === 0) return Response.json({ ok: true, noop: true });

  const { data, error } = await sb.from("cloud_builds").update(patch).eq("id", id).select("updated_at").maybeSingle();
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true, updatedAt: data?.updated_at });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await ctx.params;
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const me = await authBuild(token, id);
  const forbidden = requireBuildRole(me, "owner");
  if (forbidden) return forbidden;

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin unavailable" }, { status: 500 });
  const { error } = await sb.from("cloud_builds").delete().eq("id", id);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
