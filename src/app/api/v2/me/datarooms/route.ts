import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { bearerToken } from "@/lib/workspace-auth";
import { resolveViewerAccess, type ViewerAccess } from "@/lib/dataroom-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — the investor deal room. Every venture dataroom the signed-in
//       user has been granted access to, hydrated with the venture's
//       public metadata + the live access state (active / expired /
//       revoked) computed from the grant row.
//
// This is the investor-side counterpart to Phase 66's founder manage
// view. A founder grants access on /studio/venture/[id]/investor-access;
// the grantee finds the venture here.
//
// We surface ALL grants (including expired/revoked) so the investor
// keeps a history of deals they've had access to, but sort active
// ones first.

type GrantRow = {
  id: string;
  venture_slug: string;
  granted_to_user_id: string;
  granted_by_user_id: string;
  reason: string;
  granted_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  first_viewed_at: string | null;
  last_viewed_at: string | null;
  view_count: number;
};

// Active first, then expired, then revoked. Within a bucket, most
// recently granted first.
function accessRank(state: ViewerAccess["state"]): number {
  switch (state) {
    case "granted": return 0;
    case "expired": return 1;
    case "revoked": return 2;
    default: return 3;
  }
}

export async function GET(req: Request) {
  if (!isSupabaseConfigured()) return Response.json({ ok: true, mode: "local", results: [] });
  const token = bearerToken(req);
  if (!token) return Response.json({ ok: false, error: "missing_token" }, { status: 401 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const { data: u, error } = await sb.auth.getUser(token);
  if (error || !u?.user) return Response.json({ ok: false, error: "auth_failed" }, { status: 401 });
  const userId = u.user.id;

  // Every grant where I'm the grantee.
  const { data: grantsData } = await sb
    .from("venture_dataroom_grants")
    .select("id, venture_slug, granted_to_user_id, granted_by_user_id, reason, granted_at, expires_at, revoked_at, first_viewed_at, last_viewed_at, view_count")
    .eq("granted_to_user_id", userId);
  const grants = (grantsData ?? []) as GrantRow[];
  if (grants.length === 0) return Response.json({ ok: true, results: [] });

  // Hydrate the ventures + founder names in parallel.
  const slugs = Array.from(new Set(grants.map((g) => g.venture_slug)));
  const founderIds = Array.from(new Set(grants.map((g) => g.granted_by_user_id)));

  const [venturesRes, foundersRes, itemCountsRes] = await Promise.all([
    sb.from("public_ventures")
      .select("slug, owner_id, payload, sectors, region, stage, is_raising, raising_amount_usd, updated_at")
      .in("slug", slugs),
    sb.from("user_profiles")
      .select("user_id, display_name, slug, avatar_url")
      .in("user_id", founderIds),
    sb.from("venture_dataroom_items")
      .select("venture_slug, visibility")
      .in("venture_slug", slugs),
  ]);

  const ventureBySlug = new Map<string, {
    slug: string; owner_id: string; payload: Record<string, unknown>;
    sectors: string[] | null; region: string | null; stage: string | null;
    is_raising: boolean; raising_amount_usd: number | null; updated_at: string;
  }>();
  for (const v of (venturesRes.data ?? []) as Array<typeof ventureBySlug extends Map<string, infer V> ? V : never>) {
    ventureBySlug.set(v.slug, v);
  }

  const founderById = new Map<string, { display_name: string; slug: string | null; avatar_url: string | null }>();
  for (const f of (foundersRes.data ?? []) as Array<{ user_id: string; display_name: string; slug: string | null; avatar_url: string | null }>) {
    founderById.set(f.user_id, { display_name: f.display_name, slug: f.slug, avatar_url: f.avatar_url });
  }

  // Count gated items per venture so the investor knows how much is
  // behind the grant.
  const gatedCountBySlug = new Map<string, number>();
  for (const it of (itemCountsRes.data ?? []) as Array<{ venture_slug: string; visibility: string }>) {
    if (it.visibility === "gated") {
      gatedCountBySlug.set(it.venture_slug, (gatedCountBySlug.get(it.venture_slug) ?? 0) + 1);
    }
  }

  const now = new Date();
  const results = grants
    .map((g) => {
      const v = ventureBySlug.get(g.venture_slug);
      // Compute this grant's access state via the pure helper. The
      // owner here is the venture owner; we pass just this single grant.
      const access = v
        ? resolveViewerAccess({
            viewerUserId: userId,
            ownerUserId: v.owner_id,
            grants: [{
              granted_to_user_id: g.granted_to_user_id,
              granted_at: g.granted_at,
              expires_at: g.expires_at,
              revoked_at: g.revoked_at,
            }],
            now,
          })
        : ({ state: "no_grant" } as ViewerAccess);

      const payload = (v?.payload ?? {}) as { title?: string; name?: string; tagline?: string };
      return {
        grantId: g.id,
        ventureSlug: g.venture_slug,
        title: String(payload.title ?? payload.name ?? g.venture_slug),
        tagline: String(payload.tagline ?? ""),
        sectors: v?.sectors ?? [],
        region: v?.region ?? null,
        stage: v?.stage ?? null,
        isRaising: v?.is_raising ?? false,
        raisingAmountUsd: v?.raising_amount_usd ?? null,
        founder: founderById.get(g.granted_by_user_id) ?? { display_name: "Founder", slug: null, avatar_url: null },
        reason: g.reason,
        grantedAt: g.granted_at,
        expiresAt: g.expires_at,
        revokedAt: g.revoked_at,
        gatedItemCount: gatedCountBySlug.get(g.venture_slug) ?? 0,
        access,
        ventureExists: Boolean(v),
      };
    })
    // Don't surface grants whose venture was unpublished/deleted.
    .filter((r) => r.ventureExists)
    .sort((a, b) => {
      const ra = accessRank(a.access.state);
      const rb = accessRank(b.access.state);
      if (ra !== rb) return ra - rb;
      return new Date(b.grantedAt).getTime() - new Date(a.grantedAt).getTime();
    });

  return Response.json({ ok: true, results });
}
