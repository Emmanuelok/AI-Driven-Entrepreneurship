import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Nightly orphan-connection cleanup.
//
// The connections table doesn't FK to entity tables (deliberate — its
// `from_kind`/`to_kind` span ~10 different tables AND client-only
// zustand artifacts). So over time, edges accumulate for entities
// that have been deleted.
//
// We can verify existence for SERVER-BACKED kinds only:
//   - cohort  → cohorts.id
//   - mcp     → cloud_builds.id (and only if mcp_config.enabled)
//   - marketplace → public_builds.slug
//
// For client-only kinds (venture/build/sketch/letter) the entity lives
// in the user's localStorage and we can't tell from the server whether
// it's still there. We leave those edges alone — a future migration
// could mirror the relevant subset of zustand state to Supabase, at
// which point those become verifiable too.
//
// problem/lesson/mentor are static catalogs — those never get deleted,
// so no janitor needed for them either.
//
// Cron schedule (vercel.json): nightly 3:00 UTC.

export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = url.searchParams.get("secret");
  const expected = process.env.CRON_SECRET;
  if (!expected || secret !== expected) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  // Per kind, collect the unique IDs referenced by edges. Then issue
  // one query to fetch which still exist. The set difference is the
  // orphan set. Delete in a single batched call per kind.
  const stats: Record<string, { scanned: number; orphans: number; deleted: number }> = {};

  const checks: { kind: string; sourceTable: string; sourceCol: string; extraFilter?: { col: string; val: unknown } }[] = [
    { kind: "cohort", sourceTable: "cohorts", sourceCol: "id" },
    // mcp uses cloud_builds.id AND mcp_config.enabled. We can only
    // cheap-filter existence here; the "no longer published as MCP"
    // case is treated as orphan too.
    { kind: "mcp", sourceTable: "cloud_builds", sourceCol: "id" },
    { kind: "marketplace", sourceTable: "public_builds", sourceCol: "slug" },
  ];

  for (const c of checks) {
    // Fetch all edges where this kind appears on either side.
    const referenced = new Set<string>();
    for (const side of ["from", "to"] as const) {
      const { data } = await sb.from("connections")
        .select(side === "from" ? "from_id" : "to_id")
        .eq(side === "from" ? "from_kind" : "to_kind", c.kind);
      for (const r of (data ?? []) as Array<{ from_id?: string; to_id?: string }>) {
        const id = side === "from" ? r.from_id : r.to_id;
        if (id) referenced.add(id);
      }
    }
    const ids = Array.from(referenced);
    stats[c.kind] = { scanned: ids.length, orphans: 0, deleted: 0 };
    if (ids.length === 0) continue;

    // Which of those still exist?
    const existing = new Set<string>();
    // Batch to keep the .in() query small (Postgres handles a few k IDs
    // but Supabase REST gets unhappy past ~1k).
    const BATCH = 500;
    for (let i = 0; i < ids.length; i += BATCH) {
      const slice = ids.slice(i, i + BATCH);
      const { data } = await sb.from(c.sourceTable).select(c.sourceCol).in(c.sourceCol, slice);
      for (const r of (data ?? []) as unknown as Record<string, string>[]) {
        const v = r[c.sourceCol];
        if (v) existing.add(v);
      }
    }

    // Special case for MCP: also require mcp_config.enabled. Fetch
    // those builds' data and prune any not currently publishing MCP.
    if (c.kind === "mcp" && existing.size > 0) {
      const stillMcp = new Set<string>();
      const live = Array.from(existing);
      for (let i = 0; i < live.length; i += BATCH) {
        const slice = live.slice(i, i + BATCH);
        const { data } = await sb.from("cloud_builds").select("id, data").in("id", slice);
        for (const r of (data ?? []) as Array<{ id: string; data: { mcp_config?: { enabled?: boolean } } | null }>) {
          if (r.data?.mcp_config?.enabled) stillMcp.add(r.id);
        }
      }
      existing.clear();
      for (const id of stillMcp) existing.add(id);
    }

    const orphans = ids.filter((id) => !existing.has(id));
    stats[c.kind].orphans = orphans.length;
    if (orphans.length === 0) continue;

    // Delete in batches. RLS would block this in a user context — we're
    // on the service-role admin client, which intentionally bypasses
    // RLS for housekeeping.
    let deleted = 0;
    for (let i = 0; i < orphans.length; i += BATCH) {
      const slice = orphans.slice(i, i + BATCH);
      const { error: e1 } = await sb.from("connections").delete()
        .eq("from_kind", c.kind).in("from_id", slice);
      if (!e1) deleted += slice.length;
      const { error: e2 } = await sb.from("connections").delete()
        .eq("to_kind", c.kind).in("to_id", slice);
      if (!e2) deleted += slice.length;
    }
    stats[c.kind].deleted = deleted;
  }

  return Response.json({ ok: true, stats });
}
