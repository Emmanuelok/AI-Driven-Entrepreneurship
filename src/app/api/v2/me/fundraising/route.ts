import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { bearerToken } from "@/lib/workspace-auth";
import {
  aggregateVentureEngagement, scoreInvestor,
  type GrantSignal, type VentureEngagement, type ScoredInvestor,
} from "@/lib/dataroom-engagement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — the founder's fundraising-engagement dashboard. For every
//       venture the caller has published (public_ventures.owner_id),
//       aggregates the dataroom grants + view tracking into an
//       engagement picture, and lists the warm/cold investors so the
//       founder knows who to follow up with.
//
// Everything is the caller's own data. Investor display names are
// hydrated for the founder's manage view (they already see grantee
// names on the per-venture investor-access page).

type GrantRow = {
  venture_slug: string;
  granted_to_user_id: string;
  granted_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  first_viewed_at: string | null;
  last_viewed_at: string | null;
  view_count: number;
};

export type FundraisingVenture = {
  slug: string;
  title: string;
  isRaising: boolean;
  raisingAmountUsd: number | null;
  gatedItemCount: number;
  engagement: VentureEngagement;
  investors: Array<ScoredInvestor & { displayName: string; slug: string | null }>;
};

export async function GET(req: Request) {
  if (!isSupabaseConfigured()) return Response.json({ ok: true, mode: "local", ventures: [] });
  const token = bearerToken(req);
  if (!token) return Response.json({ ok: false, error: "missing_token" }, { status: 401 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const { data: u, error } = await sb.auth.getUser(token);
  if (error || !u?.user) return Response.json({ ok: false, error: "auth_failed" }, { status: 401 });
  const userId = u.user.id;
  const now = new Date();

  // The caller's published ventures.
  const { data: venturesData } = await sb
    .from("public_ventures")
    .select("slug, payload, is_raising, raising_amount_usd")
    .eq("owner_id", userId);
  const ventures = (venturesData ?? []) as Array<{ slug: string; payload: Record<string, unknown>; is_raising: boolean; raising_amount_usd: number | null }>;
  if (ventures.length === 0) return Response.json({ ok: true, ventures: [], totals: emptyTotals() });

  const slugs = ventures.map((v) => v.slug);

  // Grants + gated item counts across all of them, in parallel.
  const [grantsRes, itemsRes] = await Promise.all([
    sb.from("venture_dataroom_grants")
      .select("venture_slug, granted_to_user_id, granted_at, expires_at, revoked_at, first_viewed_at, last_viewed_at, view_count")
      .in("venture_slug", slugs),
    sb.from("venture_dataroom_items")
      .select("venture_slug, visibility")
      .in("venture_slug", slugs),
  ]);

  const grants = (grantsRes.data ?? []) as GrantRow[];

  // Hydrate investor names.
  const investorIds = Array.from(new Set(grants.map((g) => g.granted_to_user_id)));
  const nameById = new Map<string, { displayName: string; slug: string | null }>();
  if (investorIds.length > 0) {
    const { data: profiles } = await sb
      .from("user_profiles")
      .select("user_id, display_name, slug")
      .in("user_id", investorIds);
    for (const p of (profiles ?? []) as Array<{ user_id: string; display_name: string; slug: string | null }>) {
      nameById.set(p.user_id, { displayName: p.display_name, slug: p.slug });
    }
  }

  // Gated item counts per slug.
  const gatedCount = new Map<string, number>();
  for (const it of (itemsRes.data ?? []) as Array<{ venture_slug: string; visibility: string }>) {
    if (it.visibility === "gated") gatedCount.set(it.venture_slug, (gatedCount.get(it.venture_slug) ?? 0) + 1);
  }

  // Group grants by venture.
  const grantsBySlug = new Map<string, GrantRow[]>();
  for (const g of grants) {
    const arr = grantsBySlug.get(g.venture_slug) ?? [];
    arr.push(g);
    grantsBySlug.set(g.venture_slug, arr);
  }

  const result: FundraisingVenture[] = ventures.map((v) => {
    const vGrants = grantsBySlug.get(v.slug) ?? [];
    const signals: GrantSignal[] = vGrants.map((g) => ({
      granteeUserId: g.granted_to_user_id,
      grantedAt: g.granted_at,
      expiresAt: g.expires_at,
      revokedAt: g.revoked_at,
      firstViewedAt: g.first_viewed_at,
      lastViewedAt: g.last_viewed_at,
      viewCount: g.view_count,
    }));
    const engagement = aggregateVentureEngagement(signals, now);
    const investors = signals
      .map((s) => {
        const scored = scoreInvestor(s, now);
        const name = nameById.get(s.granteeUserId) ?? { displayName: "Investor", slug: null };
        return { ...scored, displayName: name.displayName, slug: name.slug };
      })
      // Most-engaged first: hot, then warm, then cold, then expired/revoked.
      .sort((a, b) => tempRank(a.temperature) - tempRank(b.temperature) || b.viewCount - a.viewCount);

    const payload = v.payload as { title?: string; name?: string };
    return {
      slug: v.slug,
      title: String(payload.title ?? payload.name ?? v.slug),
      isRaising: v.is_raising,
      raisingAmountUsd: v.raising_amount_usd,
      gatedItemCount: gatedCount.get(v.slug) ?? 0,
      engagement,
      investors,
    };
  })
  // Surface ventures with the most engagement first.
  .sort((a, b) => b.engagement.totalGrants - a.engagement.totalGrants);

  // Portfolio totals across all ventures.
  const totals = result.reduce((acc, v) => ({
    ventures: acc.ventures + 1,
    grants: acc.grants + v.engagement.totalGrants,
    activeGrants: acc.activeGrants + v.engagement.activeGrants,
    views: acc.views + v.engagement.totalViews,
    hot: acc.hot + v.engagement.hotCount,
    cold: acc.cold + v.engagement.coldCount,
  }), emptyTotals());

  return Response.json({ ok: true, ventures: result, totals });
}

function emptyTotals() {
  return { ventures: 0, grants: 0, activeGrants: 0, views: 0, hot: 0, cold: 0 };
}

function tempRank(t: ScoredInvestor["temperature"]): number {
  switch (t) {
    case "hot": return 0;
    case "warm": return 1;
    case "cold": return 2;
    case "expired": return 3;
    case "revoked": return 4;
  }
}
