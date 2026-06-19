"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cohortApiV2, type CohortRow } from "@/lib/cohort-api-v2";
import { statusLabel, isAcceptingEnrollment, seatsRemaining, cohortCalendarProgress } from "@/lib/cohort-state";
import { Card, Badge, Button } from "@/components/ui";
import { VerifiedBadgeBool } from "@/components/verified-badge";
import { ArrowLeft, Loader2, GraduationCap, Users, CalendarRange, Building2 } from "lucide-react";

// /c/[slug] — public page for a cohort.
//
// Surfaces the cohort's name, kind, status, dates, capacity, and (if
// attached) the org running it. Honors the cohort's visibility flag —
// 'private' returns 404, 'link' and 'public' both render. The page
// never shows the roster or instructor names — those stay inside.

type PublicData = {
  cohort: CohortRow;
  organization: {
    id: string; slug: string; name: string; kind: string;
    logo_url: string | null; is_verified: boolean;
  } | null;
  counts: { occupied: number };
};

const KIND_LABEL: Record<string, string> = {
  course: "Course",
  program: "Program",
  accelerator: "Accelerator",
  bootcamp: "Bootcamp",
  study_group: "Study group",
  other: "Cohort",
};

export default function PublicCohortPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [data, setData] = useState<PublicData | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    (async () => {
      const r = await cohortApiV2.getPublic(slug);
      if (r.ok) setData({ cohort: r.cohort, organization: r.organization, counts: r.counts });
      else setMissing(true);
      setLoading(false);
    })();
  }, [slug]);

  if (loading) return <div className="min-h-[40vh] flex items-center justify-center"><Loader2 className="size-6 text-emerald animate-spin" /></div>;
  if (missing || !data) { notFound(); return null; }

  const c = data.cohort;
  const calendar = cohortCalendarProgress(c.start_date, c.end_date);
  const seats = seatsRemaining(c.capacity, data.counts.occupied);
  const accepting = isAcceptingEnrollment(c.status);

  const STATUS_COLOR: Record<typeof c.status, "muted" | "emerald" | "amber" | "indigo"> = {
    draft: "muted", open: "amber", running: "emerald", ended: "indigo", archived: "muted",
  };

  return (
    <div className="max-w-3xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      {data.organization && (
        <Link href={`/o/${data.organization.slug}`} className="text-xs text-muted hover:text-foreground inline-flex items-center gap-1.5 mb-4">
          <ArrowLeft className="size-3" /> {data.organization.name}
        </Link>
      )}

      <div className="flex items-start gap-5 flex-wrap mb-6">
        <div className="size-20 rounded-3xl bg-gradient-to-br from-emerald to-amber flex items-center justify-center text-3xl shrink-0">
          🎓
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-[0.22em] text-emerald mb-1 flex items-center gap-1.5">
            <GraduationCap className="size-3.5" /> {KIND_LABEL[c.kind] ?? "Cohort"}
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight">
            {c.name}
          </h1>
          {data.organization && (
            <div className="mt-2 text-muted flex items-center gap-2 flex-wrap text-sm">
              <Link href={`/o/${data.organization.slug}`} className="inline-flex items-center gap-1.5 text-emerald hover:underline">
                <Building2 className="size-3.5" /> Run by {data.organization.name}
                <VerifiedBadgeBool verified={data.organization.is_verified} size="xs" />
              </Link>
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2 items-center">
            <Badge color={STATUS_COLOR[c.status]}>{statusLabel(c.status)}</Badge>
            {calendar && (
              <Badge color="muted">
                <span className="inline-flex items-center gap-1">
                  <CalendarRange className="size-3" /> Week {calendar.weekIndex + 1} of {calendar.totalWeeks}
                </span>
              </Badge>
            )}
            {c.capacity != null && (
              <Badge color={accepting && seats != null && seats > 0 ? "emerald" : "muted"}>
                <span className="inline-flex items-center gap-1">
                  <Users className="size-3" />
                  {seats != null && seats > 0
                    ? `${seats} of ${c.capacity} seats left`
                    : `${data.counts.occupied} of ${c.capacity} enrolled`}
                </span>
              </Badge>
            )}
          </div>
        </div>
      </div>

      {c.description && (
        <Card className="p-6 mb-5">
          <p className="text-foreground/95 leading-relaxed whitespace-pre-wrap">{c.description}</p>
        </Card>
      )}

      {(c.start_date || c.end_date) && (
        <Card className="p-5 mb-5">
          <h3 className="text-[10px] uppercase tracking-widest text-muted mb-2 flex items-center gap-1.5">
            <CalendarRange className="size-3 text-emerald" /> Schedule
          </h3>
          <p className="text-sm text-foreground/90">
            {c.start_date ?? "TBA"} → {c.end_date ?? "TBA"}
          </p>
        </Card>
      )}

      <Card className={`p-6 ${accepting ? "bg-gradient-to-br from-emerald/10 to-amber/10" : "bg-surface-2/60"}`}>
        {accepting ? (
          <>
            <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold mb-2">Enrollment is open.</h2>
            <p className="text-sm text-muted leading-relaxed mb-4">
              Sign up to express interest. The instructor will review and admit students as seats open up.
            </p>
            <div className="flex gap-2 flex-wrap">
              <Link href="/studio/onboarding"><Button>Sign up to apply</Button></Link>
              <Link href="/sign-in"><Button variant="secondary">I already have an account</Button></Link>
            </div>
          </>
        ) : (
          <>
            <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold mb-2">
              {c.status === "draft" && "Not yet open."}
              {c.status === "running" && "Running."}
              {c.status === "ended" && "Ended."}
              {c.status === "archived" && "Archived."}
            </h2>
            <p className="text-sm text-muted leading-relaxed">
              {c.status === "running" && "This cohort is already underway and isn't accepting new students."}
              {c.status === "draft" && "The instructor is still setting things up. Check back soon."}
              {c.status === "ended" && "This cohort has finished."}
              {c.status === "archived" && "This cohort is closed."}
            </p>
          </>
        )}
      </Card>
    </div>
  );
}
