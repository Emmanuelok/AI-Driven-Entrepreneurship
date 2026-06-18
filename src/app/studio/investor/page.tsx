"use client";

import Link from "next/link";
import { Card, Button } from "@/components/ui";
import { Wallet, Briefcase, ArrowRight, ArrowLeft } from "lucide-react";

// Investor portal — the empty shell.
//
// In production this page will read from a real `investor_holdings`
// table populated when a founder opens up a venture to a backer.
// Until that pipeline lands, we render an honest empty state instead
// of fabricating a portfolio of made-up companies and NAV charts —
// nobody benefits from a dashboard showing fake $1M MOICs.

export default function InvestorPortalPage() {
  return (
    <div className="max-w-5xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <Link href="/studio" className="text-xs text-muted hover:text-foreground inline-flex items-center gap-1.5 mb-4">
        <ArrowLeft className="size-3" /> Studio
      </Link>

      <div className="mb-8">
        <p className="text-xs uppercase tracking-[0.22em] text-emerald mb-2 flex items-center gap-1.5">
          <Briefcase className="size-3.5" /> Investor portal
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight">
          Your portfolio across the Sankofa ecosystem.
        </h1>
        <p className="mt-3 text-muted max-w-2xl leading-relaxed">
          Live mark-to-market on every Sankofa-incubated venture you&apos;ve backed. Quarterly LP letters, founder updates, and exit signals — all here, all in one place.
        </p>
      </div>

      <Card className="p-10 text-center">
        <div className="size-14 rounded-2xl bg-emerald/10 border border-emerald/30 mx-auto flex items-center justify-center mb-5">
          <Wallet className="size-6 text-emerald" />
        </div>
        <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold mb-3">
          No holdings yet.
        </h2>
        <p className="text-muted max-w-md mx-auto leading-relaxed mb-7">
          Your portfolio will populate here as you back ventures on the platform. Founders open access to their dataroom when they accept your check, and updates land in this view automatically.
        </p>
        <div className="flex items-center justify-center gap-2 flex-wrap">
          <Link href="/studio/marketplace">
            <Button>Browse ventures <ArrowRight className="size-4" /></Button>
          </Link>
          <Link href="/studio/me">
            <Button variant="secondary">Complete your investor profile</Button>
          </Link>
        </div>
      </Card>

      <p className="text-xs text-muted mt-6 leading-relaxed max-w-2xl">
        Are you registered as an investor and don&apos;t see holdings you&apos;ve made? Founders may need to formally connect you to their dataroom — ask them to add your email under their venture&apos;s investors list.
      </p>
    </div>
  );
}
