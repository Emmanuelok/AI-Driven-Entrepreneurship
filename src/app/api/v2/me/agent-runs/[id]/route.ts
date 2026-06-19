import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { bearerToken } from "@/lib/workspace-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET    — fetch a single agent run by id. Owner-only; the row's RLS
//          would already block other readers, but we double-check on
//          the service-role read so an attacker who knows an id can't
//          see someone else's draft.
// DELETE — cancel a run that isn't yet terminal, OR archive a completed
//          one. We use the same verb for both because the user-facing
//          intent ("get this out of my list") is identical.

async function resolveCaller(req: Request) {
  const token = bearerToken(req);
  if (!token) return { error: Response.json({ ok: false, error: "missing_token" }, { status: 401 }) };
  const sb = supabaseAdmin();
  if (!sb) return { error: Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 }) };
  const { data: u, error } = await sb.auth.getUser(token);
  if (error || !u?.user) return { error: Response.json({ ok: false, error: "auth_failed" }, { status: 401 }) };
  return { sb, user: u.user };
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await params;
  const r = await resolveCaller(req);
  if ("error" in r) return r.error;
  const { sb, user } = r;
  const { data } = await sb
    .from("agent_runs")
    .select("id, user_id, agent_kind, title, prompt, input, status, output, steps, error, started_at, completed_at, approved_at, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!data || (data as { user_id: string }).user_id !== user.id) {
    return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  return Response.json({ ok: true, run: data });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await params;
  const r = await resolveCaller(req);
  if ("error" in r) return r.error;
  const { sb, user } = r;
  await sb.from("agent_runs").delete().eq("id", id).eq("user_id", user.id);
  return Response.json({ ok: true });
}
