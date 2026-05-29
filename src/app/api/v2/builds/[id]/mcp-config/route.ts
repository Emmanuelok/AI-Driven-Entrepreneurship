import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { authBuild, requireBuildRole } from "@/lib/build-auth";
import { isMcpConfig } from "@/lib/mcp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET   → return the cloud build's mcp_config (members only).
// PATCH → owner sets the mcp_config. Stored inside cloud_builds.data so
//         it ridealongs the existing collaborative sync layer.

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await ctx.params;
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const me = await authBuild(token, id);
  if (!me) return Response.json({ ok: false, error: "not_a_member" }, { status: 403 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const { data } = await sb.from("cloud_builds").select("data").eq("id", id).maybeSingle();
  const config = (data?.data as { mcp_config?: unknown })?.mcp_config ?? null;
  return Response.json({ ok: true, config });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await ctx.params;
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const me = await authBuild(token, id);
  const forbidden = requireBuildRole(me, "owner");
  if (forbidden) return forbidden;

  let body: { config?: unknown };
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: "invalid_json" }, { status: 400 }); }
  if (body.config !== null && !isMcpConfig(body.config)) {
    return Response.json({ ok: false, error: "invalid_config", message: "Config must be { enabled: boolean, tools: [...] }" }, { status: 400 });
  }

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  // Merge mcp_config into the existing data jsonb so we don't clobber
  // the rest of the build payload.
  const { data: row } = await sb.from("cloud_builds").select("data").eq("id", id).maybeSingle();
  const nextData = { ...((row?.data as Record<string, unknown>) ?? {}), mcp_config: body.config };
  const { error } = await sb.from("cloud_builds").update({ data: nextData }).eq("id", id);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  return Response.json({ ok: true });
}
