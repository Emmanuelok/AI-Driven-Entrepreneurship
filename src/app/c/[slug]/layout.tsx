import type { Metadata } from "next";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { StructuredData } from "@/components/structured-data";

const BASE = process.env.NEXT_PUBLIC_SITE_URL || "https://sankofa.studio";

type CohortForSeo = {
  name?: string; description?: string; kind?: string;
  status?: string; visibility?: string; organization_id?: string | null;
  start_date?: string | null; end_date?: string | null;
};

async function fetchCohortForSeo(slug: string): Promise<{ cohort: CohortForSeo | null; orgName: string | null }> {
  if (!isSupabaseConfigured()) return { cohort: null, orgName: null };
  const sb = supabaseAdmin();
  if (!sb) return { cohort: null, orgName: null };
  const { data } = await sb
    .from("cohorts")
    .select("name, description, kind, status, visibility, organization_id, start_date, end_date")
    .eq("slug", slug)
    .maybeSingle();
  const cohort = (data as CohortForSeo | null) ?? null;
  let orgName: string | null = null;
  if (cohort?.organization_id) {
    const { data: org } = await sb.from("organizations").select("name").eq("id", cohort.organization_id).maybeSingle();
    orgName = (org as { name?: string } | null)?.name ?? null;
  }
  return { cohort, orgName };
}

const KIND_LABEL: Record<string, string> = {
  course: "Course",
  program: "Program",
  accelerator: "Accelerator",
  bootcamp: "Bootcamp",
  study_group: "Study group",
  other: "Cohort",
};

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  let title = "Cohort on Sankofa Studio";
  let description = "A learning cohort on Sankofa Studio.";

  const { cohort: c } = await fetchCohortForSeo(slug);
  if (c && c.visibility !== "private") {
    const kindLabel = KIND_LABEL[c.kind ?? "other"] ?? "Cohort";
    title = `${c.name} — ${kindLabel} on Sankofa Studio`;
    const parts: string[] = [];
    if (c.description) parts.push(c.description);
    if (c.status === "open") parts.push("Enrolling now");
    else if (c.status === "running") parts.push("Live");
    description = parts.join(" · ").slice(0, 220) || description;
  }

  const url = `${BASE}/c/${slug}`;
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

export default async function CohortSlugLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { cohort: c, orgName } = await fetchCohortForSeo(slug);
  // Schema.org Course is the right primary type. We also add a nested
  // CourseInstance with the dates so Google can render a date-aware
  // rich result for "open" cohorts.
  const data: Record<string, unknown> | null = c && c.visibility !== "private"
    ? {
        "@type": "Course",
        name: c.name,
        description: c.description || undefined,
        url: `${BASE}/c/${slug}`,
        provider: orgName
          ? { "@type": "Organization", name: orgName }
          : { "@type": "Organization", name: "Sankofa Studio" },
        hasCourseInstance: (c.start_date || c.end_date)
          ? {
              "@type": "CourseInstance",
              startDate: c.start_date || undefined,
              endDate: c.end_date || undefined,
              courseMode: "Online",
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
