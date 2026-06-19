import type { Metadata } from "next";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { getAccountTypeDef } from "@/lib/account-types";
import { StructuredData } from "@/components/structured-data";

// Server-side metadata for /people/[slug]. The page itself stays a
// client component for interactivity (contact composer, vouch flow,
// agent dispatch). Next.js merges this metadata with the root
// layout's defaults and auto-wires the opengraph-image.tsx file in
// the same folder as the og:image.

const BASE = process.env.NEXT_PUBLIC_SITE_URL || "https://sankofa.studio";

// Shared helper — both metadata + layout (for the JSON-LD) need the
// same row, so we fetch it once with a tiny in-request cache.
type ProfileForSeo = {
  display_name?: string; headline?: string; bio?: string;
  account_type?: string; country?: string; city?: string;
  website_url?: string | null; linkedin_url?: string | null;
  twitter_url?: string | null;
  is_public?: boolean;
};

async function fetchProfileForSeo(slug: string): Promise<ProfileForSeo | null> {
  if (!isSupabaseConfigured()) return null;
  const sb = supabaseAdmin();
  if (!sb) return null;
  const { data } = await sb
    .from("user_profiles")
    .select("display_name, headline, bio, account_type, country, city, website_url, linkedin_url, twitter_url, is_public")
    .eq("slug", slug)
    .maybeSingle();
  return (data as ProfileForSeo | null) ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  let title = "Member on Sankofa Studio";
  let description = "A registered member of Sankofa Studio — the AI-driven learning + venture studio for African builders.";

  const p = await fetchProfileForSeo(slug);
  if (p && p.is_public) {
    const def = getAccountTypeDef((p.account_type as never) ?? "general");
    const name = p.display_name?.trim() || "Member";
    title = `${name} — ${def.label} on Sankofa Studio`;
    const where = [p.city, p.country].filter(Boolean).join(", ");
    description = (p.headline || p.bio || `${def.label} on Sankofa Studio${where ? ` · ${where}` : ""}`).slice(0, 220);
  }

  const url = `${BASE}/people/${slug}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "profile",
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

export default async function PeopleSlugLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const p = await fetchProfileForSeo(slug);
  // Emit JSON-LD only when the profile is actually public — otherwise
  // we'd be leaking SEO signal on a row search engines can't reach.
  const data: Record<string, unknown> | null = p && p.is_public
    ? {
        "@type": "Person",
        name: p.display_name || "Member",
        description: p.headline || p.bio || undefined,
        url: `${BASE}/people/${slug}`,
        jobTitle: getAccountTypeDef((p.account_type as never) ?? "general").label,
        address: (p.city || p.country)
          ? {
              "@type": "PostalAddress",
              addressLocality: p.city || undefined,
              addressCountry: p.country || undefined,
            }
          : undefined,
        sameAs: [p.website_url, p.linkedin_url, p.twitter_url].filter((u): u is string => !!u),
      }
    : null;
  return (
    <>
      {data && <StructuredData data={data} />}
      {children}
    </>
  );
}
