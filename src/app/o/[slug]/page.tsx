"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { orgApi, type Organization } from "@/lib/org-api";
import { Card, Button, Badge } from "@/components/ui";
import { VerifiedBadgeBool } from "@/components/verified-badge";
import { ArrowLeft, Building2, Users, GraduationCap, Globe, MapPin, Loader2 } from "lucide-react";

// /o/[slug] — public organization page. No auth required. Shows the
// org's public-safe profile: name, kind, description, location,
// member + cohort counts, website. Members link comes from a future
// public-cohort listing (Phase 56).

export default function PublicOrgPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [data, setData] = useState<{ organization: Organization; counts: { members: number; cohorts: number } } | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    (async () => {
      const r = await orgApi.getPublic(slug);
      if (r.ok) setData({ organization: r.organization, counts: r.counts });
      else setMissing(true);
      setLoading(false);
    })();
  }, [slug]);

  if (loading) return <div className="min-h-[40vh] flex items-center justify-center"><Loader2 className="size-6 text-emerald animate-spin" /></div>;
  if (missing || !data) { notFound(); return null; }

  const org = data.organization;
  const KIND_LABELS: Record<string, string> = {
    university: "University", accelerator: "Accelerator", bootcamp: "Bootcamp",
    school: "School", program: "Program", other: "Organization",
  };

  return (
    <div className="max-w-4xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <Link href="/people" className="text-xs text-muted hover:text-foreground inline-flex items-center gap-1.5 mb-6">
        <ArrowLeft className="size-3" /> Directory
      </Link>

      <div className="flex items-start gap-5 flex-wrap mb-7">
        {org.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={org.logo_url} alt="" className="size-24 rounded-3xl object-cover" />
        ) : (
          <div className="size-24 rounded-3xl bg-gradient-to-br from-emerald to-amber flex items-center justify-center text-black font-bold text-3xl shadow-xl shadow-emerald/20">
            {org.name[0]?.toUpperCase() ?? "?"}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-[0.22em] text-emerald mb-1 flex items-center gap-1.5">
            <Building2 className="size-3.5" /> {KIND_LABELS[org.kind] ?? "Organization"}
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight inline-flex items-center gap-2 flex-wrap">
            {org.name}
            <VerifiedBadgeBool verified={org.is_verified} size="md" />
          </h1>
          <div className="mt-3 flex flex-wrap gap-2 items-center">
            {(org.city || org.country) && (
              <Badge color="muted"><span className="inline-flex items-center gap-1"><MapPin className="size-3" />{[org.city, org.country].filter(Boolean).join(", ")}</span></Badge>
            )}
            <Badge color="muted"><span className="inline-flex items-center gap-1"><Users className="size-3" />{data.counts.members} member{data.counts.members === 1 ? "" : "s"}</span></Badge>
            <Badge color="muted"><span className="inline-flex items-center gap-1"><GraduationCap className="size-3" />{data.counts.cohorts} cohort{data.counts.cohorts === 1 ? "" : "s"}</span></Badge>
            {org.website_url && (
              <a href={org.website_url} target="_blank" rel="noopener noreferrer" className="text-xs text-emerald hover:underline inline-flex items-center gap-1">
                <Globe className="size-3" /> Website
              </a>
            )}
          </div>
        </div>
      </div>

      {org.description && (
        <Card className="p-6 mb-5">
          <p className="text-foreground/95 leading-relaxed whitespace-pre-wrap">{org.description}</p>
        </Card>
      )}

      <Card className="p-6 bg-gradient-to-br from-emerald/5 to-amber/5">
        <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold mb-2">Join Sankofa to engage</h2>
        <p className="text-sm text-muted leading-relaxed mb-4">
          Sign up to join this organization&apos;s cohorts, follow its updates, and connect with its founders, instructors, and alumni.
        </p>
        <div className="flex gap-2 flex-wrap">
          <Link href="/studio/onboarding"><Button>Sign up</Button></Link>
          <Link href="/sign-in"><Button variant="secondary">I already have an account</Button></Link>
        </div>
      </Card>
    </div>
  );
}
