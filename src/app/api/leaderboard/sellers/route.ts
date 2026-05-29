import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Top sellers leaderboard. Aggregates seller_sales (the view added in
// 0012) over a time range. Sellers' display names come from the seller
// row's most recent public artifact (public_builds, public_ventures,
// or cohort_members).
//
// Query params:
//   ?range=7|30|all  default 30
//   ?limit=N         default 25, max 100

type SellerRow = {
  seller_id: string;
  display_name: string | null;
  revenue_cents: number;
  sales_count: number;
  currency: string;                                   // most common currency among the sales
};

export async function GET(req: Request) {
  if (!isSupabaseConfigured()) return Response.json({ ok: true, mode: "local", results: [] });
  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const url = new URL(req.url);
  const range = url.searchParams.get("range") ?? "30";
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? "25") || 25));

  let sinceIso: string | null = null;
  if (range === "7") sinceIso = new Date(Date.now() - 7 * 86_400_000).toISOString();
  else if (range === "30") sinceIso = new Date(Date.now() - 30 * 86_400_000).toISOString();

  // Service role bypasses RLS — that's the point of the leaderboard.
  let q = sb.from("seller_sales").select("seller_id, amount_cents, currency");
  if (sinceIso) q = q.gte("ts", sinceIso);
  const { data: sales, error } = await q.limit(50_000);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  // Aggregate per seller in JS — at this scale (≤50k rows) it's
  // much simpler than a SQL group-by + dynamic ordering.
  const bySeller = new Map<string, { revenue: number; count: number; ccyTally: Map<string, number> }>();
  for (const s of sales ?? []) {
    const row = s as { seller_id: string; amount_cents: number; currency: string };
    const cur = bySeller.get(row.seller_id) ?? { revenue: 0, count: 0, ccyTally: new Map<string, number>() };
    cur.revenue += row.amount_cents;
    cur.count += 1;
    cur.ccyTally.set(row.currency, (cur.ccyTally.get(row.currency) ?? 0) + 1);
    bySeller.set(row.seller_id, cur);
  }

  const top: SellerRow[] = Array.from(bySeller.entries())
    .map(([seller_id, agg]) => {
      // Dominant currency wins for the display total.
      let currency = "usd";
      let max = 0;
      for (const [c, n] of agg.ccyTally) if (n > max) { currency = c; max = n; }
      return { seller_id, display_name: null, revenue_cents: agg.revenue, sales_count: agg.count, currency };
    })
    .sort((a, b) => b.revenue_cents - a.revenue_cents)
    .slice(0, limit);

  if (top.length === 0) return Response.json({ ok: true, range, results: [] });

  // Hydrate display names. Best source: a public_build the seller has
  // published (most have one if they're listed). Fall back to a cached
  // cohort_member name. Email is never exposed on the leaderboard.
  const sellerIds = top.map((s) => s.seller_id);
  const [pb, cm] = await Promise.all([
    sb.from("public_builds").select("owner_id, title").in("owner_id", sellerIds).limit(sellerIds.length * 3),
    sb.from("cohort_members").select("user_id, display_name").in("user_id", sellerIds).not("display_name", "is", null).limit(sellerIds.length * 3),
  ]);
  const nameByUser = new Map<string, string>();
  for (const r of (cm.data ?? []) as Array<{ user_id: string; display_name: string | null }>) {
    if (r.display_name && !nameByUser.has(r.user_id)) nameByUser.set(r.user_id, r.display_name);
  }
  // public_builds has author-set titles, not the seller's name, so we
  // only use it as a backstop when no display_name exists.
  for (const r of (pb.data ?? []) as Array<{ owner_id: string; title: string }>) {
    if (!nameByUser.has(r.owner_id)) nameByUser.set(r.owner_id, "Author");
  }
  for (const s of top) s.display_name = nameByUser.get(s.seller_id) ?? "Anonymous";

  return Response.json({ ok: true, range, results: top });
}
