"use client";

import { use } from "react";
import Link from "next/link";
import { useStore } from "@/store";
import { notFound } from "next/navigation";
import { Card, Badge, Button, Stat } from "@/components/ui";
import { PROBLEMS } from "@/lib/problems";
import {
  Target, Users, Wallet, Trophy, Lightbulb, Wrench, Megaphone, TrendingUp,
  CheckCircle2, Clock, Sparkles, MapPin, Calendar, ArrowRight, Brain,
} from "lucide-react";

const PHASES = [
  { id: "ideate", label: "Ideate", icon: Lightbulb },
  { id: "discover", label: "Discover", icon: Users },
  { id: "mvp", label: "Build MVP", icon: Wrench },
  { id: "launch", label: "Launch", icon: Megaphone },
  { id: "scale", label: "Scale", icon: TrendingUp },
];

export default function VentureOverview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { ventures, updateVenture } = useStore();
  const found = ventures.find((x) => x.id === id);
  if (!found) { notFound(); return null; }
  const v = found;
  const problem = v.problemId ? PROBLEMS.find((p) => p.id === v.problemId) : undefined;
  const activePhaseIdx = PHASES.findIndex((p) => p.id === v.phase);
  const daysSinceStart = Math.floor((Date.now() - v.createdAt) / 86_400_000) || 0;
  const mvpDone = v.mvpTasks.filter((t) => t.done).length;
  const mvpPct = v.mvpTasks.length ? (mvpDone / v.mvpTasks.length) * 100 : 0;
  const interviewPct = (v.interviews.length / v.metrics.interviewsTarget) * 100;
  const fundPct = (v.fundingRaised / v.fundingTarget) * 100;

  return (
    <div className="max-w-6xl mx-auto px-5 sm:px-8 py-10">
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted mb-6">
        {v.region && <span className="flex items-center gap-1.5"><MapPin className="size-3.5 text-emerald" /> {v.region}</span>}
        <span className="flex items-center gap-1.5"><Calendar className="size-3.5 text-emerald" /> Day {daysSinceStart}</span>
        <span className="flex items-center gap-1.5"><Users className="size-3.5 text-emerald" /> {v.team.length} on team</span>
        {problem && (
          <Link href={`/studio/problems/${problem.id}`} className="flex items-center gap-1.5 text-emerald hover:underline">
            ← Problem brief: {problem.title.slice(0, 60)}
          </Link>
        )}
      </div>

      {/* Phase tracker */}
      <Card className="p-6 mb-6">
        <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold mb-5">Venture pipeline</h2>
        <div className="flex items-start justify-between relative gap-2">
          <div className="absolute top-5 left-[5%] right-[5%] h-px bg-border" />
          <div className="absolute top-5 left-[5%] h-px bg-emerald" style={{ width: `${(activePhaseIdx / (PHASES.length - 1)) * 90}%` }} />
          {PHASES.map((p, i) => {
            const Icon = p.icon;
            const done = i < activePhaseIdx;
            const active = i === activePhaseIdx;
            return (
              <button
                key={p.id}
                onClick={() => updateVenture(v.id, { phase: p.id as typeof v.phase })}
                className="flex flex-col items-center text-center relative z-10 flex-1 min-w-0 cursor-pointer hover:opacity-80 transition"
              >
                <div className={`size-11 rounded-full flex items-center justify-center border-2 transition ${
                  done ? "bg-emerald border-emerald text-black" : active ? "bg-amber border-amber text-black pulse-dot" : "bg-surface-2 border-border text-muted"
                }`}>
                  {done ? <CheckCircle2 className="size-5" /> : <Icon className="size-5" />}
                </div>
                <div className={`text-xs mt-2 ${active ? "text-amber font-medium" : "text-muted"}`}>{String(i + 1).padStart(2, "0")}</div>
                <div className={`text-xs sm:text-sm ${done || active ? "text-foreground" : "text-muted"}`}>{p.label}</div>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted mt-4 text-center">Tap a phase to move the venture there.</p>
      </Card>

      {/* metric cards */}
      <div className="grid sm:grid-cols-4 gap-3 mb-6">
        <Stat label="Interviews" value={`${v.interviews.length}/${v.metrics.interviewsTarget}`} color="emerald" sub={`${Math.round(interviewPct)}% to target`} />
        <Stat label="MVP tasks" value={`${mvpDone}/${v.mvpTasks.length || 0}`} color="amber" sub={`${Math.round(mvpPct)}% shipped`} />
        <Stat label="MRR" value={`$${v.metrics.mrr}`} color="emerald" sub={`${v.metrics.customers} customers`} />
        <Stat label="Funding" value={`$${v.fundingRaised.toLocaleString()}`} color="rust" sub={`${Math.round(fundPct)}% of ${(v.fundingTarget / 1000).toFixed(0)}k goal`} />
      </div>

      {/* quick links */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <QuickCard href={`/studio/venture/${v.id}/discover`} icon={Users} label="Run discovery" desc={`${v.interviews.length} / ${v.metrics.interviewsTarget} interviews logged`} />
        <QuickCard href={`/studio/venture/${v.id}/mvp`} icon={Wrench} label="MVP board" desc={`${v.mvpTasks.length} tasks tracked`} />
        <QuickCard href={`/studio/venture/${v.id}/pitch`} icon={Sparkles} label="Generate pitch deck" desc="AI-built 12-slide deck" />
        <QuickCard href={`/studio/venture/${v.id}/fundraise`} icon={Wallet} label="Find funding" desc="16 matched programs" />
      </div>

      {/* team */}
      {v.team.length > 0 && (
        <Card className="p-6 mb-6">
          <h3 className="font-medium mb-4 flex items-center gap-2"><Users className="size-4 text-emerald" /> Team</h3>
          <div className="grid sm:grid-cols-3 gap-3">
            {v.team.map((t) => (
              <div key={t.name} className="flex items-center gap-3 p-3 rounded-xl border border-border bg-surface-2/50">
                <div className="size-9 rounded-full bg-gradient-to-br from-emerald to-amber flex items-center justify-center text-black font-semibold text-sm">{t.name[0]}</div>
                <div className="leading-tight">
                  <div className="font-medium text-sm">{t.name}</div>
                  <div className="text-xs text-muted">{t.role}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* achievements */}
      {v.achievements.length > 0 && (
        <Card className="p-6">
          <h3 className="font-medium mb-4 flex items-center gap-2"><Trophy className="size-4 text-amber" /> Achievements</h3>
          <div className="flex flex-wrap gap-2">
            {v.achievements.map((a) => (
              <span key={a} className="text-sm px-3 py-1.5 rounded-full bg-emerald/10 border border-emerald/30 text-emerald">{a}</span>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function QuickCard({ href, icon: Icon, label, desc }: { href: string; icon: typeof Users; label: string; desc: string }) {
  return (
    <Link href={href} className="glass rounded-2xl p-5 hover:border-emerald/40 transition group">
      <Icon className="size-5 mb-3 text-emerald" />
      <div className="font-medium flex items-center gap-1">
        {label}
        <ArrowRight className="size-3.5 opacity-0 group-hover:opacity-100 transition" />
      </div>
      <p className="mt-1 text-xs text-muted">{desc}</p>
    </Link>
  );
}
