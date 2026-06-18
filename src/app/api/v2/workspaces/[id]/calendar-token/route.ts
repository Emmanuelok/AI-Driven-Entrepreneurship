import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { authWorkspace, requireWorkspaceRole, bearerToken } from "@/lib/workspace-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Per-workspace calendar feed tokens.
//
// GET  — return (and mint on first call) the caller's per-workspace
//        token. Idempotent. Any member can subscribe to their own
//        workspace's deadlines — viewers included.
// POST — rotate the token. Invalidates any calendar app currently
//        subscribed to the old URL.
//
// The feed URL itself is /api/calendar/workspace/<token>.ics — that
// route is unauthenticated (the token IS the capability) and
// re-verifies membership at serve time so revoking a member also
// stops their feed even if they keep the token.

async function resolveCaller(req: Request, workspaceId: string) {
  const me = await authWorkspace(bearerToken(req), workspaceId);
  const forbid = requireWorkspaceRole(me, "viewer");
  if (forbid) return { error: forbid };
  const sb = supabaseAdmin();
  if (!sb) return { error: Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 }) };
  return { sb, userId: me!.userId };
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await params;
  const r = await resolveCaller(req, id);
  if ("error" in r) return r.error;
  const { sb, userId } = r;

  // Upsert-on-read: the default expression on `token` mints a fresh
  // secret on insert, so a missing row produces a new token in one
  // round trip without us generating any secret in JS.
  let { data } = await sb
    .from("workspace_calendar_tokens")
    .select("token")
    .eq("workspace_id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) {
    const ins = await sb
      .from("workspace_calendar_tokens")
      .insert({ workspace_id: id, user_id: userId })
      .select("token")
      .single();
    if (ins.error) return Response.json({ ok: false, error: ins.error.message }, { status: 500 });
    data = ins.data;
  }
  return Response.json({ ok: true, token: (data as { token: string }).token });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await params;
  const r = await resolveCaller(req, id);
  if ("error" in r) return r.error;
  const { sb, userId } = r;

  const fresh = randomHex(24);
  const { data, error } = await sb
    .from("workspace_calendar_tokens")
    .upsert(
      { workspace_id: id, user_id: userId, token: fresh, rotated_at: new Date().toISOString() },
      { onConflict: "workspace_id,user_id" },
    )
    .select("token")
    .single();
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true, token: (data as { token: string }).token });
}

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}
