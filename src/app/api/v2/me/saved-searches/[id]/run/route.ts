import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { bearerToken } from "@/lib/workspace-auth";
import { normalizeCriteria, filterMatchingVentures, type MatchableVenture, type Stage } from "@/lib/saved-search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST — run a saved search NOW and return the matching ventures.
//        This is also the path the cron uses internally (via the
//        shared logic in /lib/saved-search.ts).
//
// Query params:
//   ?since=ISO  — limit matches to ventures updated since this ts
//                 (cron uses this to detect "new since last run").
//   ?limit=50   — bounded result count.
//   ?mark=1     — set last_run_at to now() so the next cron only
//                 picks up newer matches.

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await params;
  const token = bearerToken(req);
  if (!token) return Response.json({ ok: false, error: "missing_token" }, { status: 401 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const { data: u } = await sb.auth.getUser(token);
  if (!u?.user) return Response.json({ ok: false, error: "auth_failed" }, { status: 401 });

  const { data: row } = await sb
    .from("investor_saved_searches")
    .select("id, user_id, criteria, last_run_at")
    .eq("id", id)
    .maybeSingle();
  if (!row) return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  const search = row as { id: string; user_id: string; criteria: unknown; last_run_at: string | null };
  if (search.user_id !== u.user.id) return Response.json({ ok: false, error: "forbidden" }, { status: 403 });

  const criteria = normalizeCriteria(search.criteria as Record<string, unknown>);

  const url = new URL(req.url);
  const since = url.searchParams.get("since");
  const limit = Math.max(1, Math.min(100, parseInt(url.searchParams.get("limit") ?? "30", 10) || 30));
  const mark = url.searchParams.get("mark") === "1";

  // Pull a wide candidate set then filter via the pure predicate. We
  // could push some of this into the SQL (sectors @>, stage =, etc.)
  // but the pure path keeps API + cron + UI in lock-step on what
  // "matches" means; performance is fine at the volumes we target.
  let q = sb.from("public_ventures")
    .select("slug, payload, sectors, stage, is_raising, raising_amount_usd, region, updated_at")
    .order("updated_at", { ascending: false })
    .limit(500);
  if (since) q = q.gte("updated_at", since);

  const { data: vrows, error } = await q;
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  const candidates: MatchableVenture[] = (vrows ?? []).map((r) => {
    const v = r as { slug: string; payload: Record<string, unknown>; sectors: string[] | null; stage: string | null; is_raising: boolean; raising_amount_usd: number | null; region: string | null; updated_at: string };
    return {
      slug: v.slug,
      title: String(v.payload?.title ?? v.slug),
      tagline: String(v.payload?.tagline ?? ""),
      sectors: v.sectors ?? [],
      stage: (v.stage ?? null) as Stage | null,
      is_raising: v.is_raising,
      raising_amount_usd: v.raising_amount_usd,
      region: v.region,
      updated_at: v.updated_at,
    };
  });
  const matches = filterMatchingVentures(candidates, criteria).slice(0, limit);

  if (mark) {
    await sb
      .from("investor_saved_searches")
      .update({ last_run_at: new Date().toISOString() })
      .eq("id", id);
  }

  return Response.json({ ok: true, matches, total: matches.length, criteria });
}
