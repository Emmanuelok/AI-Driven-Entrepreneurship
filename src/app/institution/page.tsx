"use client";

import Link from "next/link";
import { Card, Button } from "@/components/ui";
import { Building2, ArrowLeft, ArrowRight, Globe2, GraduationCap, BookOpen } from "lucide-react";

// Institution dashboard — empty shell pending real cohort connections.
//
// Previously this rendered a fabricated KNUST dashboard with 671
// learners and made-up venture leads. Until a real institution has
// connected, we render the partnership pitch (which IS real) and a
// CTA to talk to the team. Once real cohorts wire in, this page
// will pull live numbers from cohort_members / workspace_activity.

export default function InstitutionPage() {
  return (
    <div className="max-w-5xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <div className="mb-8 flex items-end justify-between flex-wrap gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-emerald mb-2 flex items-center gap-2">
            <Building2 className="size-3.5" /> Institution partnerships
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight">
            Bring Sankofa into your university or program.
          </h1>
          <p className="mt-3 text-muted max-w-2xl leading-relaxed">
            Cohort licensing, faculty dashboards, employer pipeline access, and co-branded credentials. We work with universities, accelerators, secondary schools, and bootcamps across Africa.
          </p>
        </div>
        <Link href="/studio" className="text-sm text-muted hover:text-foreground inline-flex items-center gap-1.5">
          <ArrowLeft className="size-3.5" /> My studio
        </Link>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="p-6 lg:col-span-2 bg-gradient-to-br from-emerald/5 to-amber/5">
          <h3 className="font-[family-name:var(--font-display)] text-xl font-semibold flex items-center gap-2">
            <Globe2 className="size-5 text-emerald" /> What partnership includes
          </h3>
          <ul className="mt-5 space-y-3 text-sm leading-relaxed">
            <li className="flex gap-3">
              <span className="text-emerald mt-1">→</span>
              <div>
                <strong className="text-foreground">Cohort licensing</strong> — bring a class, lab group, or full program onto the platform with a shared cohort space, instructor controls, and aggregated progress reporting.
              </div>
            </li>
            <li className="flex gap-3">
              <span className="text-emerald mt-1">→</span>
              <div>
                <strong className="text-foreground">Faculty dashboards</strong> — instructors see what their students are working on, where they&apos;re blocked, and which credentials they&apos;ve earned, without having to chase status updates.
              </div>
            </li>
            <li className="flex gap-3">
              <span className="text-emerald mt-1">→</span>
              <div>
                <strong className="text-foreground">Co-branded portfolios + credentials</strong> — verifiable credentials issued under your institution&apos;s name, hosted on a custom subdomain.
              </div>
            </li>
            <li className="flex gap-3">
              <span className="text-emerald mt-1">→</span>
              <div>
                <strong className="text-foreground">Employer pipeline</strong> — partner companies see students&apos; verifiable skill credentials and shipped artifacts directly, with student consent.
              </div>
            </li>
          </ul>
          <Button className="mt-6"><a href="mailto:partnerships@sankofa.studio">Talk to partnerships <ArrowRight className="size-4" /></a></Button>
        </Card>

        <Card className="p-6">
          <h3 className="font-medium mb-3 flex items-center gap-2"><GraduationCap className="size-4 text-amber" /> Who this is for</h3>
          <ul className="space-y-3 text-sm leading-relaxed text-muted">
            <li><strong className="text-foreground">Universities</strong> — entrepreneurship programs, engineering schools, design schools, business schools.</li>
            <li><strong className="text-foreground">Accelerators</strong> — running multi-week cohorts and want shared infrastructure.</li>
            <li><strong className="text-foreground">Secondary schools</strong> — STEM and innovation tracks introducing real-world venture work.</li>
            <li><strong className="text-foreground">Bootcamps + fellowships</strong> — short-cycle programs that need lightweight cohort coordination.</li>
          </ul>
        </Card>
      </div>

      <Card className="p-6 mt-6">
        <h3 className="font-medium mb-3 flex items-center gap-2"><BookOpen className="size-4 text-emerald" /> Already a partner?</h3>
        <p className="text-sm text-muted leading-relaxed mb-4">
          Faculty members signed in with an instructor account see their connected cohorts on the Cohorts page. Aggregated dashboards populate once at least one student has joined a cohort and started shipping.
        </p>
        <Link href="/studio/cohorts">
          <Button variant="secondary">Open Cohorts <ArrowRight className="size-3.5" /></Button>
        </Link>
      </Card>
    </div>
  );
}
