import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 15-minute edge cache — ventures publish on a slow cadence and a
// feed reader pulling every 5 minutes shouldn't hit Postgres each time.
export const revalidate = 900;

const BASE = process.env.NEXT_PUBLIC_SITE_URL || "https://sankofa.studio";

// RSS 2.0 feed at /feed.xml — the latest 50 published ventures plus
// the latest 25 public orgs. A feed reader subscribing once becomes a
// distribution channel forever; an investor following the feed sees
// every new "Raising $N" venture without having to come back to the
// site.
//
// We output RSS rather than Atom because more readers default to it,
// and we don't need Atom's richer metadata fields for this use case.

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function rfc822(d: Date): string {
  return d.toUTCString();
}

type Item = {
  title: string;
  link: string;
  description: string;
  pubDate: Date;
  guid: string;
  category?: string;
};

function itemXml(item: Item): string {
  return `    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${escapeXml(item.link)}</link>
      <guid isPermaLink="true">${escapeXml(item.guid)}</guid>
      <pubDate>${rfc822(item.pubDate)}</pubDate>
      <description>${escapeXml(item.description)}</description>${item.category ? `\n      <category>${escapeXml(item.category)}</category>` : ""}
    </item>`;
}

export async function GET() {
  const items: Item[] = [];

  if (isSupabaseConfigured()) {
    const sb = supabaseAdmin();
    if (sb) {
      const [venturesRes, orgsRes] = await Promise.all([
        sb.from("public_ventures")
          .select("slug, payload, sectors, region, stage, is_raising, raising_amount_usd, updated_at, published_at")
          .order("updated_at", { ascending: false })
          .limit(50),
        sb.from("organizations")
          .select("slug, name, description, kind, country, updated_at")
          .eq("is_public", true)
          .order("updated_at", { ascending: false })
          .limit(25),
      ]);

      for (const v of (venturesRes.data ?? []) as Array<Record<string, unknown>>) {
        const slug = v.slug as string;
        const payload = (v.payload ?? {}) as Record<string, unknown>;
        const name = String(payload.title ?? payload.name ?? slug);
        const tagline = String(payload.tagline ?? "");
        const parts: string[] = [];
        if (tagline) parts.push(tagline);
        if (v.is_raising && v.raising_amount_usd) parts.push(`Raising $${((v.raising_amount_usd as number) / 1000).toFixed(0)}k`);
        if (v.region) parts.push(String(v.region));
        const ts = new Date(String(v.updated_at ?? v.published_at ?? Date.now()));
        items.push({
          title: `${name} — venture on Sankofa`,
          link: `${BASE}/v/${slug}`,
          guid: `${BASE}/v/${slug}`,
          description: parts.join(" · ") || "A venture published on Sankofa Studio.",
          pubDate: ts,
          category: "Venture",
        });
      }

      for (const o of (orgsRes.data ?? []) as Array<Record<string, unknown>>) {
        const slug = o.slug as string;
        items.push({
          title: `${o.name as string} — organization on Sankofa`,
          link: `${BASE}/o/${slug}`,
          guid: `${BASE}/o/${slug}`,
          description: (o.description as string | null) ?? `An organization running cohorts on Sankofa Studio.`,
          pubDate: new Date(String(o.updated_at ?? Date.now())),
          category: "Organization",
        });
      }
    }
  }

  // Interleave by pubDate so the top of the feed is the freshest
  // thing of any kind, not all ventures then all orgs.
  items.sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());

  const lastBuild = items[0]?.pubDate ?? new Date();
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Sankofa Studio — latest ventures &amp; programs</title>
    <link>${BASE}</link>
    <atom:link href="${BASE}/feed.xml" rel="self" type="application/rss+xml" />
    <description>Fresh ventures, organizations, and programs from African student-founders on Sankofa Studio.</description>
    <language>en</language>
    <lastBuildDate>${rfc822(lastBuild)}</lastBuildDate>
    <ttl>15</ttl>
${items.map(itemXml).join("\n")}
  </channel>
</rss>
`;

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=900, s-maxage=900",
    },
  });
}
