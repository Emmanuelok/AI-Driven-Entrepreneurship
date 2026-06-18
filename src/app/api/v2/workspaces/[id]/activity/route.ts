import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { authWorkspace, bearerToken } from "@/lib/workspace-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — filtered activity feed for one workspace. Filters via query
// params (all optional):
//   kinds=joined,task_done   restrict to these activity kinds
//   userId=<uuid>            only events by this user
//   since=ISO                events created at or after this time
//   until=ISO                events created at or before this time
//   limit=N (max 500)        cap rows
//   offset=N                 pagination
//
// Returns rows newest-first, plus a 'kinds' summary (distinct kinds
// present in this workspace) so the UI's kind-filter picker has the
// right options without a second query.

const MAX_LIMIT = 500;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await params;
  const me = await authWorkspace(bearerToken(req), id);
  if (!me) return Response.json({ ok: false, error: "not_a_member" }, { status: 403 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const url = new URL(req.url);
  const limit = Math.max(1, Math.min(MAX_LIMIT, parseInt(url.searchParams.get("limit") ?? "100") || 100));
  const offset = Math.max(0, parseInt(url.searchParams.get("offset") ?? "0") || 0);
  const kindsParam = url.searchParams.get("kinds");
  const userId = url.searchParams.get("userId");
  const since = url.searchParams.get("since");
  const until = url.searchParams.get("until");

  let q = sb
    .from("workspace_activity")
    .select("id, workspace_id, user_id, kind, title, body, created_at", { count: "exact" })
    .eq("workspace_id", id)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (kindsParam) {
    const kinds = kindsParam.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 30);
    if (kinds.length > 0) q = q.in("kind", kinds);
  }
  if (userId) q = q.eq("user_id", userId);
  if (since) {
    const d = new Date(since);
    if (!isNaN(d.getTime())) q = q.gte("created_at", d.toISOString());
  }
  if (until) {
    const d = new Date(until);
    if (!isNaN(d.getTime())) q = q.lte("created_at", d.toISOString());
  }

  const { data, error, count } = await q;
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  // Distinct kinds in this workspace (for the filter picker). Cheap
  // separate query — limited to a recent slice so it scales.
  const { data: recent } = await sb
    .from("workspace_activity")
    .select("kind")
    .eq("workspace_id", id)
    .order("created_at", { ascending: false })
    .limit(2000);
  const kindSet = new Set<string>();
  for (const r of recent ?? []) kindSet.add((r as { kind: string }).kind);

  return Response.json({
    ok: true,
    results: data ?? [],
    total: count ?? null,
    distinctKinds: Array.from(kindSet).sort(),
  });
}
