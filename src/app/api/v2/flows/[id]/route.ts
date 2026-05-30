import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { resolveAuthedUserId } from "@/lib/authed-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET    → fetch the full graph for one flow (owner-only via RLS)
// DELETE → drop the flow row

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await ctx.params;
  const me = await resolveAuthedUserId(req);
  if (!me) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const { data } = await sb.from("cloud_flows")
    .select("id, name, description, data, created_at, updated_at")
    .eq("id", id).eq("owner_id", me).maybeSingle();
  if (!data) return Response.json({ ok: false, error: "not_found" }, { status: 404 });

  const payload = (data.data ?? {}) as { nodes?: unknown[]; edges?: unknown[] };
  return Response.json({
    ok: true,
    flow: {
      id: data.id,
      name: data.name,
      description: data.description ?? "",
      nodes: payload.nodes ?? [],
      edges: payload.edges ?? [],
      createdAt: new Date(data.created_at).getTime(),
      updatedAt: new Date(data.updated_at).getTime(),
    },
  });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await ctx.params;
  const me = await resolveAuthedUserId(req);
  if (!me) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const { error } = await sb.from("cloud_flows").delete().eq("id", id).eq("owner_id", me);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
