import type { Metadata } from "next";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { StructuredData } from "@/components/structured-data";

const BASE = process.env.NEXT_PUBLIC_SITE_URL || "https://sankofa.studio";

type VentureForSeo = {
  payload?: Record<string, unknown>;
  sectors?: string[]; region?: string | null;
  stage?: string | null; is_raising?: boolean;
  raising_amount_usd?: number | null;
  updated_at?: string;
};

async function fetchVentureForSeo(slug: string): Promise<VentureForSeo | null> {
  if (!isSupabaseConfigured()) return null;
  const sb = supabaseAdmin();
  if (!sb) return null;
  const { data } = await sb
    .from("public_ventures")
    .select("payload, sectors, region, stage, is_raising, raising_amount_usd, updated_at")
    .eq("slug", slug)
    .maybeSingle();
  return (data as VentureForSeo | null) ?? null;
}

// Per-venture metadata. The /v/[slug] reader is implemented as a
// client component for the publish/unpublish flow; this layout
// supplies the social + SEO metadata server-side. Venture pages are
// the platform's primary outbound asset — investors share them, so
// the Twitter card has to be informative on its own.

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  let title = "Venture on Sankofa Studio";
  let description = "A venture published on Sankofa Studio — the classroom-to-creator platform for African builders.";

  const p = await fetchVentureForSeo(slug);
  if (p) {
    const payload = p.payload ?? {};
    const ventureName = String(payload.title ?? payload.name ?? slug);
    const tagline = String(payload.tagline ?? "");
    title = `${ventureName} — Venture on Sankofa Studio`;
    const parts: string[] = [];
    if (tagline) parts.push(tagline);
    if (p.is_raising && p.raising_amount_usd) parts.push(`Raising $${(p.raising_amount_usd / 1000).toFixed(0)}k`);
    if (p.region) parts.push(p.region);
    if (p.stage) parts.push(`stage: ${p.stage}`);
    description = parts.join(" · ").slice(0, 220) || description;
  }

  const url = `${BASE}/v/${slug}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      url,
      title,
      description,
      siteName: "Sankofa Studio",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function VentureSlugLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const p = await fetchVentureForSeo(slug);
  // Schema.org doesn't have a perfect "venture" type, so we surface
  // as an Organization (for the company itself) + an Article (for the
  // pitch page). Investors crawling rich results prefer Organization
  // markup for sharing — we go with that.
  const data: Record<string, unknown> | null = p
    ? {
        "@type": "Organization",
        name: String((p.payload as { title?: string; name?: string } | undefined)?.title ?? (p.payload as { name?: string } | undefined)?.name ?? slug),
        description: String((p.payload as { tagline?: string } | undefined)?.tagline ?? ""),
        url: `${BASE}/v/${slug}`,
        address: p.region ? { "@type": "PostalAddress", addressRegion: p.region } : undefined,
        keywords: (p.sectors ?? []).join(", ") || undefined,
        foundingDate: p.updated_at,
      }
    : null;
  return (
    <>
      {data && <StructuredData data={data} />}
      {children}
    </>
  );
}
