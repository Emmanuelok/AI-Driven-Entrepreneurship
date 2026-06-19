import type { MetadataRoute } from "next";

const BASE = process.env.NEXT_PUBLIC_SITE_URL || "https://sankofa.studio";

// Tell crawlers what they can and can't index. /studio/* is the
// signed-in surface; we keep it out of search results because the
// content there is per-user and won't render usefully to a crawler.
// /api/* is never indexable. /verify/* + /org-invite/* + /i/* + /sign-in
// + /onboarding shouldn't appear in search results either — they're
// transient flow endpoints.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/"],
        disallow: [
          "/api/",
          "/studio/",
          "/verify/",
          "/org-invite/",
          "/i/",
          "/sign-in",
        ],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
    host: BASE,
  };
}
