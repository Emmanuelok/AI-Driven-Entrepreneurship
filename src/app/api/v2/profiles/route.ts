import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public profile directory. List + filter signed-up, public profiles
// across the platform.
//
// Query params:
//   type    — single account_type to filter to (mentor, investor, …)
//   country — exact country match
//   q       — free-text search on display_name + headline + bio
//   limit   — page size, default 24, capped at 60
//   offset  — pagination
//
// Returns: { results, total } — the count uses head:true so we don't
// re-fetch the rows just to count them.

export async function GET(req: Request) {
  if (!isSupabaseConfigured()) return Response.json({ ok: true, results: [], total: 0, mode: "local" });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const url = new URL(req.url);
  const type = url.searchParams.get("type");
  const country = url.searchParams.get("country");
  const q = url.searchParams.get("q")?.trim();
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "24"), 1), 60);
  const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0"), 0);

  // Two queries: one for the rows, one for the count. We use the
  // built-in PostgREST count rather than a separate SELECT count(*)
  // so we hit the same RLS-filtered surface.
  let rows = sb
    .from("user_profiles")
    .select("user_id, slug, account_type, display_name, headline, country, city, avatar_url, persona_data, contact_policy")
    .eq("is_public", true)
    .order("updated_at", { ascending: false });
  let countQ = sb
    .from("user_profiles")
    .select("user_id", { count: "exact", head: true })
    .eq("is_public", true);

  if (type) {
    rows = rows.eq("account_type", type);
    countQ = countQ.eq("account_type", type);
  }
  if (country) {
    rows = rows.eq("country", country);
    countQ = countQ.eq("country", country);
  }
  if (q) {
    // Simple substring search — Postgres ILIKE works fine on the row
    // counts we expect here; the tsvector index is there for the day
    // we need to upgrade to full-text rank ordering.
    const safe = q.replace(/[%_]/g, (m) => `\\${m}`);
    const ors = `display_name.ilike.%${safe}%,headline.ilike.%${safe}%,bio.ilike.%${safe}%`;
    rows = rows.or(ors);
    countQ = countQ.or(ors);
  }

  const [{ data, error }, { count }] = await Promise.all([
    rows.range(offset, offset + limit - 1),
    countQ,
  ]);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  // Annotate each row with its verified state so the directory cards
  // can render the badge without a per-row RPC. We aggregate the
  // signals in one batch — the inner expression maps user_id →
  // boolean(verified) so the join is O(N) on the page size.
  const rowsArr = (data ?? []) as { user_id: string }[];
  const userIds = rowsArr.map((r) => r.user_id);
  const verifiedByUser = new Map<string, boolean>();
  if (userIds.length > 0) {
    const [vRes, aRes] = await Promise.all([
      sb.from("verifications").select("user_id, kind, status").in("user_id", userIds).eq("status", "verified"),
      sb.from("peer_attestations").select("attested_user_id, attestor_user_id").in("attested_user_id", userIds),
    ]);
    const attCount = new Map<string, Set<string>>();
    for (const a of (aRes.data ?? []) as { attested_user_id: string; attestor_user_id: string }[]) {
      const set = attCount.get(a.attested_user_id) ?? new Set();
      set.add(a.attestor_user_id);
      attCount.set(a.attested_user_id, set);
    }
    const hasSystemVerify = new Map<string, boolean>();
    for (const v of (vRes.data ?? []) as { user_id: string; kind: string }[]) {
      hasSystemVerify.set(v.user_id, true);
    }
    for (const id of userIds) {
      verifiedByUser.set(id, hasSystemVerify.get(id) === true || (attCount.get(id)?.size ?? 0) >= 3);
    }
  }
  const results = rowsArr.map((r) => ({ ...r, verified: verifiedByUser.get(r.user_id) === true }));

  return Response.json({ ok: true, results, total: count ?? 0 });
}
