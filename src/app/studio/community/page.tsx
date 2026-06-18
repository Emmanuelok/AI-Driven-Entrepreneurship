"use client";

import Link from "next/link";
import { Card, Button } from "@/components/ui";
import { Users, ArrowRight, Sparkles, MessageSquare } from "lucide-react";

// Community page — empty shell pending real circles + feed backend.
//
// The previous version showed a fabricated 18,000-member network and
// scripted posts. That kind of theater is exactly what this audit
// pass is meant to clear: when there are zero real circles, render
// an honest invitation instead of a fake feed. The Workspaces engine
// already provides the real collaboration primitive — point people
// there, and let public circles light up when they actually exist.

export default function CommunityPage() {
  return (
    <div className="max-w-4xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <div className="mb-8">
        <p className="text-xs uppercase tracking-[0.22em] text-emerald mb-2">Community</p>
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight">
          Build alongside other founders, mentors, and investors.
        </h1>
        <p className="mt-3 text-muted max-w-2xl leading-relaxed">
          The community surface is opening as the network grows. For now the place to build with other people is in a Workspace — invite teammates, mentors, instructors, and investors to a shared room with discussion, deadlines, files, and 1-on-1 DMs.
        </p>
      </div>

      <Card className="p-8 sm:p-10">
        <div className="size-12 rounded-2xl bg-emerald/10 border border-emerald/30 flex items-center justify-center mb-5">
          <Users className="size-6 text-emerald" />
        </div>
        <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold mb-3">
          Start in a workspace.
        </h2>
        <p className="text-muted leading-relaxed mb-6 max-w-xl">
          A workspace is your shared room with the people you&apos;re building with. Live discussion, threaded notes, kanban tasks, deadlines, file sharing, DMs, and a private Sage advisor — all scoped to that room, all real-time, all permissioned.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/studio/workspaces">
            <Button>Go to workspaces <ArrowRight className="size-4" /></Button>
          </Link>
          <Link href="/studio/mentors">
            <Button variant="secondary">Find a mentor</Button>
          </Link>
        </div>
      </Card>

      <div className="grid sm:grid-cols-2 gap-4 mt-6">
        <Card className="p-6">
          <Sparkles className="size-5 text-amber mb-3" />
          <h3 className="font-medium mb-2">Public circles — coming soon</h3>
          <p className="text-sm text-muted leading-relaxed">
            Discoverable peer groups organized by sector, region, and stage will open up here once the first cohort of founders has shipped real work. We&apos;d rather wait than seed a fake network.
          </p>
        </Card>
        <Card className="p-6">
          <MessageSquare className="size-5 text-emerald mb-3" />
          <h3 className="font-medium mb-2">Meetups + cohorts</h3>
          <p className="text-sm text-muted leading-relaxed">
            Regional meetups and cohort programs are organized through institution partners and instructor accounts. If you&apos;re running one, contact partnerships through the Institution page.
          </p>
        </Card>
      </div>
    </div>
  );
}
