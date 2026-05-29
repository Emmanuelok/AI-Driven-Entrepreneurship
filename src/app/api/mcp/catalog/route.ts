import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { isMcpConfig } from "@/lib/mcp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public catalog of MCP servers published on Sankofa. Scans cloud_builds
// for rows where data.mcp_config.enabled is true. Service-role bypasses
// RLS — that's intentional, the catalog is meant to be discoverable.
//
// Pairs with 30-day invocation counts so callers see what's popular.

type Entry = {
  slug: string;
  name: string;
  description: string;
  toolCount: number;
  tools: { name: string; description: string }[];
  ownerName: string;
  calls30d: number;
  updatedAt: string;
};

export async function GET(req: Request) {
  if (!isSupabaseConfigured()) return Response.json({ ok: true, mode: "local", results: [] });
  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const url = new URL(req.url);
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") ?? "50") || 50));
  const q = (url.searchParams.get("q") || "").trim().toLowerCase();

  // Pull cloud builds, then filter to ones with mcp_config.enabled. We
  // can't easily filter JSONB in supabase-js, so we over-fetch and
  // filter in memory. Cap is 500.
  const { data: rows, error } = await sb.from("cloud_builds")
    .select("id, name, owner_id, data, updated_at")
    .order("updated_at", { ascending: false })
    .limit(500);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  const candidates = (rows ?? []).filter((r) => {
    const cfg = (r.data as { mcp_config?: unknown } | null)?.mcp_config;
    if (!(isMcpConfig(cfg) && cfg.enabled && Array.isArray(cfg.tools) && cfg.tools.length > 0)) return false;
    if (!q) return true;
    // Server-side full-text-ish: hit name + description + tool names +
    // tool descriptions. Cheap substring; replace with a tsvector if we
    // ever cross a few thousand catalog rows.
    const haystack = [
      cfg.name ?? r.name,
      cfg.description ?? "",
      ...cfg.tools.map((t) => `${t.name} ${t.description}`),
    ].join(" ").toLowerCase();
    return haystack.includes(q);
  }).slice(0, limit);

  if (candidates.length === 0) return Response.json({ ok: true, results: [] });

  // Invocation counts in the last 30 days.
  const sinceIso = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const slugs = candidates.map((c) => (c as { id: string }).id);
  const { data: invocs } = await sb.from("mcp_invocations")
    .select("build_slug")
    .in("build_slug", slugs)
    .gte("created_at", sinceIso)
    .limit(20_000);
  const callsBySlug = new Map<string, number>();
  for (const i of invocs ?? []) {
    const s = (i as { build_slug: string }).build_slug;
    callsBySlug.set(s, (callsBySlug.get(s) ?? 0) + 1);
  }

  // Owner display names — same trick as the sellers leaderboard:
  // cohort_members has cached names; never expose emails.
  const ownerIds = Array.from(new Set(candidates.map((c) => (c as { owner_id: string }).owner_id)));
  const { data: cm } = await sb.from("cohort_members")
    .select("user_id, display_name")
    .in("user_id", ownerIds)
    .not("display_name", "is", null)
    .limit(ownerIds.length * 3);
  const nameByUser = new Map<string, string>();
  for (const r of (cm ?? []) as Array<{ user_id: string; display_name: string | null }>) {
    if (r.display_name && !nameByUser.has(r.user_id)) nameByUser.set(r.user_id, r.display_name);
  }

  const results: Entry[] = candidates.map((row) => {
    const r = row as { id: string; name: string; owner_id: string; data: { mcp_config?: unknown }; updated_at: string };
    const cfg = r.data.mcp_config as { name?: string; description?: string; tools: Array<{ name: string; description: string }> };
    return {
      slug: r.id,
      name: cfg.name ?? r.name,
      description: cfg.description ?? "",
      toolCount: cfg.tools.length,
      tools: cfg.tools.slice(0, 6).map((t) => ({ name: t.name, description: t.description })),
      ownerName: nameByUser.get(r.owner_id) ?? "Anonymous",
      calls30d: callsBySlug.get(r.id) ?? 0,
      updatedAt: r.updated_at,
    };
  }).sort((a, b) => b.calls30d - a.calls30d || a.name.localeCompare(b.name));

  return Response.json({ ok: true, results });
}
