import type { Metadata } from "next";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { StructuredData } from "@/components/structured-data";

const BASE = process.env.NEXT_PUBLIC_SITE_URL || "https://sankofa.studio";

type OrgForSeo = {
  name?: string; description?: string; kind?: string;
  country?: string; city?: string; logo_url?: string | null;
  website_url?: string | null; is_public?: boolean;
};

async function fetchOrgForSeo(slug: string): Promise<OrgForSeo | null> {
  if (!isSupabaseConfigured()) return null;
  const sb = supabaseAdmin();
  if (!sb) return null;
  const { data } = await sb
    .from("organizations")
    .select("name, description, kind, country, city, logo_url, website_url, is_public")
    .eq("slug", slug)
    .maybeSingle();
  return (data as OrgForSeo | null) ?? null;
}

const KIND_LABEL: Record<string, string> = {
  university: "University",
  accelerator: "Accelerator",
  bootcamp: "Bootcamp",
  school: "School",
  program: "Program",
  other: "Organization",
};

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  let title = "Organization on Sankofa Studio";
  let description = "An organization running cohorts on Sankofa Studio.";

  const o = await fetchOrgForSeo(slug);
  if (o && o.is_public) {
    const kindLabel = KIND_LABEL[o.kind ?? "other"] ?? "Organization";
    title = `${o.name} — ${kindLabel} on Sankofa Studio`;
    const where = [o.city, o.country].filter(Boolean).join(", ");
    description = (o.description || `${kindLabel} on Sankofa Studio${where ? ` · ${where}` : ""}`).slice(0, 220);
  }

  const url = `${BASE}/o/${slug}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
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

export default async function OrgSlugLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const o = await fetchOrgForSeo(slug);
  // Schema.org has dedicated educational org types — we map kind to
  // the closest one. Anything else lands on Organization for the
  // safest rich-result eligibility.
  const ORG_TYPE: Record<string, string> = {
    university: "CollegeOrUniversity",
    school: "EducationalOrganization",
    bootcamp: "EducationalOrganization",
    accelerator: "Organization",
    program: "EducationalOrganization",
    other: "Organization",
  };
  const data: Record<string, unknown> | null = o && o.is_public
    ? {
        "@type": ORG_TYPE[o.kind ?? "other"] ?? "Organization",
        name: o.name,
        description: o.description || undefined,
        url: `${BASE}/o/${slug}`,
        logo: o.logo_url || undefined,
        sameAs: o.website_url ? [o.website_url] : undefined,
        address: (o.city || o.country)
          ? {
              "@type": "PostalAddress",
              addressLocality: o.city || undefined,
              addressCountry: o.country || undefined,
            }
          : undefined,
      }
    : null;
  return (
    <>
      {data && <StructuredData data={data} />}
      {children}
    </>
  );
}
