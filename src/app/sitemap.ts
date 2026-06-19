import type { MetadataRoute } from "next";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Re-generate at most every hour — public_ventures + user_profiles
// don't churn fast enough to warrant per-request DB hits.
export const revalidate = 3600;

// Dynamic sitemap.xml. Next.js's sitemap.ts convention turns this
// route into /sitemap.xml automatically. We list:
//   - Marketing pages (static, high priority)
//   - Every is_public user profile
//   - Every published public_venture
//   - Every is_public organization
//   - Every public/link-visible cohort (drops 'private' rows)
//
// Each entry carries a lastModified so search engines re-crawl the
// pages that actually changed.

const BASE = process.env.NEXT_PUBLIC_SITE_URL || "https://sankofa.studio";

// Hand-curated marketing/landing routes that should always be in
// the sitemap. /search and /people are anchor surfaces for discovery
// even though they're empty initially — Google indexes the shell.
const STATIC_ROUTES: Array<{ path: string; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"]; priority: number }> = [
  { path: "/", changeFrequency: "daily", priority: 1.0 },
  { path: "/people", changeFrequency: "daily", priority: 0.8 },
  { path: "/search", changeFrequency: "weekly", priority: 0.7 },
  { path: "/sign-in", changeFrequency: "yearly", priority: 0.3 },
  { path: "/institution", changeFrequency: "monthly", priority: 0.6 },
  { path: "/leaderboard", changeFrequency: "daily", priority: 0.6 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const out: MetadataRoute.Sitemap = STATIC_ROUTES.map((r) => ({
    url: `${BASE}${r.path}`,
    lastModified: new Date(),
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));

  if (!isSupabaseConfigured()) return out;
  const sb = supabaseAdmin();
  if (!sb) return out;

  // Pull entities in parallel. Caps are generous but bounded so the
  // sitemap doesn't grow unboundedly for an enormous deployment —
  // we split into multiple sitemaps if/when needed (Phase 60+).
  const [profilesRes, venturesRes, orgsRes, cohortsRes] = await Promise.all([
    sb.from("user_profiles")
      .select("slug, updated_at")
      .eq("is_public", true)
      .not("slug", "is", null)
      .order("updated_at", { ascending: false })
      .limit(2000),
    sb.from("public_ventures")
      .select("slug, updated_at")
      .order("updated_at", { ascending: false })
      .limit(2000),
    sb.from("organizations")
      .select("slug, updated_at")
      .eq("is_public", true)
      .order("updated_at", { ascending: false })
      .limit(1000),
    sb.from("cohorts")
      .select("slug, updated_at")
      .in("visibility", ["public", "link"])
      .order("updated_at", { ascending: false })
      .limit(2000),
  ]);

  for (const p of (profilesRes.data ?? []) as Array<{ slug: string; updated_at: string }>) {
    out.push({
      url: `${BASE}/people/${p.slug}`,
      lastModified: new Date(p.updated_at),
      changeFrequency: "weekly",
      priority: 0.7,
    });
  }
  for (const v of (venturesRes.data ?? []) as Array<{ slug: string; updated_at: string }>) {
    out.push({
      url: `${BASE}/v/${v.slug}`,
      lastModified: new Date(v.updated_at),
      changeFrequency: "weekly",
      priority: 0.8, // ventures are the platform's primary outbound asset
    });
  }
  for (const o of (orgsRes.data ?? []) as Array<{ slug: string; updated_at: string }>) {
    out.push({
      url: `${BASE}/o/${o.slug}`,
      lastModified: new Date(o.updated_at),
      changeFrequency: "weekly",
      priority: 0.7,
    });
  }
  for (const c of (cohortsRes.data ?? []) as Array<{ slug: string; updated_at: string }>) {
    out.push({
      url: `${BASE}/c/${c.slug}`,
      lastModified: new Date(c.updated_at),
      changeFrequency: "weekly",
      priority: 0.6,
    });
  }

  return out;
}
