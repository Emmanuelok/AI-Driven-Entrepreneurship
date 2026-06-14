"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Brain, Compass, FlaskConical, Rocket, Globe2, Flame, Trophy, TrendingUp,
  ArrowUpRight, Sparkles, Clock, Target, Wallet, BookMarked, Map, Lightbulb,
  Bot, Network, FileText, Notebook, Paintbrush, MessageSquare,
  GraduationCap, User, Timer, Sun, RefreshCcw, Hammer, Activity,
  TrendingDown, Minus, ArrowRight, Zap,
} from "lucide-react";
import { useStore, level, xpInLevel, xpToNextLevel } from "@/store";
import { useMe } from "@/store/me";
import { usePulse } from "@/lib/use-pulse";
import { useDisciplineCheckinTrigger } from "@/lib/auto-checkin";
import { Card, Badge, Stat } from "@/components/ui";
import { CohortAssignmentsWidget } from "@/components/cohort-assignments-widget";
import { DeadlinesWidget } from "@/components/deadlines-widget";
import { getRecommendations } from "@/lib/recommendations";
import { buildSiteContextSnapshotAsync } from "@/lib/site-brain-snapshot";
import type { PulseAction } from "@/lib/pulse-engine";

// Pool of quick-access tiles. Re-ranked per user by usage frequency.
const ALL_TILES: { href: string; icon: typeof Brain; label: string; c: string }[] = [
  { href: "/studio/tutor", icon: Brain, label: "Sage", c: "emerald" },
  { href: "/studio/me", icon: User, label: "Me", c: "emerald" },
  { href: "/studio/path", icon: GraduationCap, label: "My Path", c: "amber" },
  { href: "/studio/flows", icon: Network, label: "Flows", c: "emerald" },
  { href: "/studio/brainstorm", icon: Lightbulb, label: "Sketch", c: "amber" },
  { href: "/studio/agents", icon: Bot, label: "Agents", c: "indigo" },
  { href: "/studio/atlas", icon: Map, label: "Atlas", c: "emerald" },
  { href: "/studio/arena", icon: Trophy, label: "Arena", c: "amber" },
  { href: "/studio/venture", icon: Rocket, label: "Ventures", c: "rust" },
  { href: "/studio/conglomerate", icon: Network, label: "Conglomerate", c: "indigo" },
  { href: "/studio/lab", icon: FlaskConical, label: "Lab", c: "indigo" },
  { href: "/studio/learn", icon: Compass, label: "Learn", c: "amber" },
  { href: "/studio/srs", icon: BookMarked, label: "Review", c: "emerald" },
  { href: "/studio/documents", icon: FileText, label: "Documents", c: "amber" },
  { href: "/studio/brand", icon: Paintbrush, label: "Brand", c: "rust" },
  { href: "/studio/okrs", icon: Target, label: "OKRs", c: "emerald" },
  { href: "/studio/notebook", icon: Notebook, label: "Notebook", c: "indigo" },
  { href: "/studio/funding", icon: Wallet, label: "Funding", c: "amber" },
  { href: "/studio/focus", icon: Timer, label: "Focus", c: "emerald" },
  { href: "/studio/coaches", icon: MessageSquare, label: "Coaches", c: "indigo" },
  { href: "/studio/problems", icon: Globe2, label: "Problems", c: "rust" },
];

const ACTION_ICONS: Record<PulseAction["kind"], typeof Brain> = {
  review: BookMarked,
  venture: Rocket,
  learn: Compass,
  goal: Target,
  ship: Zap,
  focus: Timer,
  build: Hammer,
  discipline: GraduationCap,
};

export default function Dashboard() {
  const { user, xp, streak, ventures, progress, dueCards } = useStore();
  const { goals, recentActivity, memories, prefs, todaysBrief, setBrief, markPriorityDone, sampleMomentum } = useMe();
  const pulse = usePulse();
  const [briefing, setBriefing] = useState(false);
  const [greeting, setGreeting] = useState("Welcome back");

  // Record today's momentum trajectory point whenever the pulse settles.
  // The store dedupes same-day no-ops, so this is cheap on every recompute.
  useEffect(() => {
    if (pulse) sampleMomentum(pulse.momentum, pulse.learningVelocity);
  }, [pulse?.momentum, pulse?.learningVelocity, sampleMomentum]);

  // Auto-fires a discipline check-in letter (once per session, cooled
  // down 14 days) when the user's connection-graph signal is strong.
  useDisciplineCheckinTrigger();

  // Compute time-dependent values only on the client to avoid SSR/CSR mismatch.
  useEffect(() => {
    const h = new Date().getHours();
    setGreeting(h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening");
  }, []);

  useEffect(() => {
    if (!user) return;
    const brief = todaysBrief();
    if (!brief) generateBrief();
  }, [user]);

  if (!user) return null;

  const lvl = level(xp);
  const due = dueCards();
  const completed = Object.values(progress).filter((p) => p.status === "completed").length;
  const activeGoals = goals.filter((g) => g.status === "active");
  const rec = getRecommendations(user.field);
  const activeVenture = ventures[0];
  const activeHealth = activeVenture && pulse ? pulse.ventureHealth.find((h) => h.ventureId === activeVenture.id) : undefined;

  // Adaptive tile order
  const freq = prefs.routeFrequency ?? {};
  const tiles = ALL_TILES.slice().sort((a, b) => (freq[b.href] ?? 0) - (freq[a.href] ?? 0)).slice(0, 10);

  async function generateBrief() {
    setBriefing(true);
    try {
      const res = await fetch("/api/generate/daily-brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: user?.name ?? "",
          field: user?.field ?? "",
          level: lvl,
          streak,
          activeVenture: activeVenture ? `${activeVenture.name} (${activeVenture.phase})` : null,
          dueCards: due.length,
          activeGoals: activeGoals.map((g) => g.text),
          recentActivity: recentActivity(6).map((a) => a.title),
          memoryFacts: memories.slice(0, 5).map((m) => m.fact),
          siteContext: await buildSiteContextSnapshotAsync("daily-brief"),
        }),
      });
      const data = await res.json();
      setBrief({ date: new Date().toISOString().slice(0, 10), morning: data.morning, priorities: data.priorities, generatedAt: Date.now() });
    } finally {
      setBriefing(false);
    }
  }

  const brief = todaysBrief();

  return (
    <div className="max-w-7xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      {/* ── Personal hero: narrative + momentum ring ─────────────────── */}
      <div className="rise grid lg:grid-cols-[1fr_auto] gap-8 items-center">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-accent">{greeting}, {user.name.split(" ")[0]}</p>
          <h1 className="font-[family-name:var(--font-display)] text-3xl sm:text-[2.6rem] font-semibold mt-2 leading-tight max-w-2xl text-balance">
            {pulse?.headline ?? (streak > 0 ? `${streak}-day streak. Keep it alive.` : "Welcome back. Today is the day.")}
          </h1>
          {pulse && <p className="mt-3 text-muted max-w-xl leading-relaxed text-balance">{pulse.subline}</p>}
          <div className="flex items-center gap-3 flex-wrap mt-5">
            <StatBadge icon={Flame} label="Streak" value={`${streak}d`} color="text-rust" />
            <StatBadge icon={Trophy} label="Level" value={`Lv ${lvl}`} color="text-amber" />
            <StatBadge icon={TrendingUp} label="XP" value={xp.toLocaleString()} color="text-emerald" />
          </div>
        </div>
        {pulse && <MomentumRing value={pulse.momentum} trend={pulse.momentumTrend} />}
      </div>

      {/* ── Live signal strip ────────────────────────────────────────── */}
      {pulse && (
        <div className="rise rise-1 mt-8 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <SignalCard
            icon={Activity}
            label="Momentum"
            value={`${pulse.momentum}`}
            sub={pulse.momentumTrend === "rising" ? "Rising" : pulse.momentumTrend === "cooling" ? "Cooling" : "Steady"}
            trend={pulse.momentumTrend}
          />
          <SignalCard
            icon={Compass}
            label="Learning velocity"
            value={`${pulse.learningVelocity}`}
            sub="Last 7 days"
            trend={pulse.learningVelocity >= 40 ? "rising" : pulse.learningVelocity >= 15 ? "steady" : "cooling"}
          />
          <SignalCard
            icon={Rocket}
            label="Venture health"
            value={pulse.ventureHealth[0] ? `${pulse.ventureHealth[0].score}` : "—"}
            sub={pulse.ventureHealth[0] ? pulse.ventureHealth[0].name : "No venture yet"}
            trend={pulse.ventureHealth[0] ? (pulse.ventureHealth[0].score >= 60 ? "rising" : pulse.ventureHealth[0].score >= 35 ? "steady" : "cooling") : "steady"}
          />
          <SignalCard
            icon={Timer}
            label="Deep work"
            value={`${pulse.focusMinutes7d}m`}
            sub="Focus, last 7 days"
            trend={pulse.focusMinutes7d >= 50 ? "rising" : pulse.focusMinutes7d > 0 ? "steady" : "cooling"}
          />
        </div>
      )}

      {/* ── Made for you: the live action queue ──────────────────────── */}
      {pulse && pulse.actions.length > 0 && (
        <section className="rise rise-2 mt-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold flex items-center gap-2">
              <Sparkles className="size-5 text-accent" /> Made for you, right now
            </h2>
            <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted">
              <span className="size-1.5 rounded-full bg-emerald pulse-dot" /> Live engine
            </span>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {pulse.actions.map((a, i) => {
              const Icon = ACTION_ICONS[a.kind];
              return (
                <Link
                  key={a.id}
                  href={a.href}
                  className={`glass lift rounded-2xl p-5 group flex gap-4 ${i === 0 ? "border-accent/40 ring-1 ring-accent/20" : ""}`}
                >
                  <div className="size-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center shrink-0">
                    <Icon className="size-5 text-accent" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium leading-snug group-hover:text-accent transition">{a.title}</div>
                    <p className="mt-1 text-xs text-muted leading-relaxed">{a.reason}</p>
                    <div className="mt-2 flex items-center justify-between text-[11px]">
                      <span className="text-muted flex items-center gap-1"><Clock className="size-3" /> ~{a.estMin}m</span>
                      <span className="text-accent flex items-center gap-1">Go <ArrowRight className="size-3 group-hover:translate-x-0.5 transition" /></span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Daily brief (Sage's voice) ───────────────────────────────── */}
      <Card className="rise rise-3 mt-8 p-6 sm:p-8 relative overflow-hidden bg-gradient-to-br from-emerald/10 via-transparent to-amber/10">
        <div className="absolute -top-16 -right-16 size-48 rounded-full bg-emerald opacity-20 blur-3xl aurora" />
        <div className="absolute -bottom-16 -left-16 size-48 rounded-full bg-amber opacity-20 blur-3xl" />
        <div className="relative">
          <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
            <div className="text-xs uppercase tracking-[0.22em] text-amber flex items-center gap-2">
              <Sun className="size-3.5" /> Today&apos;s brief from Sage
            </div>
            <button onClick={generateBrief} disabled={briefing} className="text-xs text-muted hover:text-foreground flex items-center gap-1 transition">
              <RefreshCcw className={`size-3 ${briefing ? "animate-spin" : ""}`} /> {briefing ? "Generating…" : "Refresh"}
            </button>
          </div>
          {brief ? (
            <>
              <p className="text-lg leading-relaxed text-foreground/95">{brief.morning}</p>
              {brief.priorities && brief.priorities.length > 0 && (
                <div className="mt-5 space-y-2">
                  {brief.priorities.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => markPriorityDone(p.id)}
                      className={`w-full text-left flex items-center gap-3 p-3 rounded-xl border transition group ${p.done ? "border-emerald/30 bg-emerald/5 opacity-60" : "border-border bg-surface-2/40 hover:border-emerald/40"}`}
                    >
                      <span className={`size-5 rounded-full border-2 flex items-center justify-center ${p.done ? "border-emerald bg-emerald text-black" : "border-border group-hover:border-emerald"}`}>
                        {p.done && <span className="text-[10px]">✓</span>}
                      </span>
                      <span className={`text-sm flex-1 ${p.done ? "line-through" : ""}`}>{p.text}</span>
                      <Badge color="muted">{p.estMin}m</Badge>
                    </button>
                  ))}
                </div>
              )}
              <div className="mt-5 flex gap-2 flex-wrap">
                {due.length > 0 && (
                  <Link href="/studio/srs" className="text-sm bg-emerald text-black font-medium px-4 py-2 rounded-full hover:bg-amber transition inline-flex items-center gap-1.5">
                    <BookMarked className="size-3.5" /> Clear {due.length} cards
                  </Link>
                )}
                <Link href="/studio/focus" className="text-sm border border-border bg-surface px-4 py-2 rounded-full hover:bg-surface-2 transition inline-flex items-center gap-1.5">
                  <Timer className="size-3.5" /> Enter focus mode
                </Link>
                <Link href="/studio/me" className="text-sm border border-border bg-surface px-4 py-2 rounded-full hover:bg-surface-2 transition inline-flex items-center gap-1.5">
                  <User className="size-3.5" /> Me · trajectory
                </Link>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted">{briefing ? "Sage is drafting your brief…" : "No brief yet. Sage will draft one in a moment."}</p>
          )}
        </div>
      </Card>

      {/* ── Studio heroes, condensed side-by-side ────────────────────── */}
      <div className="rise rise-4 mt-8 grid lg:grid-cols-2 gap-4">
        <Card className="p-7 relative overflow-hidden bg-gradient-to-br from-indigo/15 via-emerald/10 to-amber/10 border-indigo/30 lift">
          <div className="absolute -top-24 -right-24 size-64 rounded-full bg-indigo opacity-25 blur-3xl aurora" />
          <div className="relative flex flex-col h-full">
            <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-indigo border border-indigo/40 bg-indigo/10 px-3 py-1 rounded-full mb-4 self-start">
              <Sparkles className="size-3" /> AI Build Studio
            </div>
            <h2 className="font-[family-name:var(--font-display)] text-2xl sm:text-3xl font-semibold leading-[1.1]">
              Build real <span className="text-emerald italic">AI products</span> — by prompting or coding.
            </h2>
            <p className="mt-3 text-sm text-muted leading-relaxed flex-1">
              Describe what you want; Sage writes the code. See it running live. Ship to a real URL when ready.
            </p>
            <Link href="/studio/build" className="mt-5 bg-emerald text-black font-semibold px-5 py-3 rounded-full hover:bg-amber transition inline-flex items-center gap-2 text-sm self-start shadow-lg shadow-emerald/30">
              <Hammer className="size-4" /> Open Build Studio
            </Link>
          </div>
        </Card>
        <Card className="p-7 relative overflow-hidden bg-gradient-to-br from-amber/15 via-emerald/10 to-rust/10 border-amber/30 lift">
          <div className="absolute -top-24 -right-24 size-64 rounded-full bg-amber opacity-25 blur-3xl aurora" />
          <div className="relative flex flex-col h-full">
            <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-amber border border-amber/40 bg-amber/10 px-3 py-1 rounded-full mb-4 self-start">
              <Sparkles className="size-3" /> The flagship experience
            </div>
            <h2 className="font-[family-name:var(--font-display)] text-2xl sm:text-3xl font-semibold leading-[1.1]">
              Ship something <span className="text-emerald italic">real</span> in the next hour.
            </h2>
            <p className="mt-3 text-sm text-muted leading-relaxed flex-1">
              60 minutes, 7 stages, Sage alongside you — ending with artifacts a real person can say yes to.
            </p>
            <Link href="/studio/ship" className="mt-5 bg-emerald text-black font-semibold px-5 py-3 rounded-full hover:bg-amber transition inline-flex items-center gap-2 text-sm self-start shadow-lg shadow-emerald/30">
              <Sparkles className="size-4" /> Begin Ship Hour
            </Link>
          </div>
        </Card>
      </div>

      <Card className="rise rise-5 mt-4 p-5">
        <div className="flex items-center justify-between text-sm mb-3">
          <span className="text-muted">Level {lvl} → Level {lvl + 1}</span>
          <span className="font-mono text-emerald">{xpInLevel(xp)} / {xpToNextLevel()} XP</span>
        </div>
        <div className="h-2.5 bg-surface-2 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-emerald to-amber rounded-full transition-all" style={{ width: `${(xpInLevel(xp) / xpToNextLevel()) * 100}%` }} />
        </div>
      </Card>

      {/* Cohort assignments (only renders if the user is in cohorts with assignments) */}
      <div className="mt-8">
        <CohortAssignmentsWidget />
      </div>

      {/* Cross-workspace deadlines (renders only if the user has any). */}
      <div className="mt-6">
        <DeadlinesWidget />
      </div>

      {/* Activity stats */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3 mt-8">
        <Stat label="Lessons" value={completed} color="emerald" sub="Completed" />
        <Stat label="Cards due" value={due.length} color="amber" sub="SRS review" />
        <Stat label="Ventures" value={ventures.length} color="rust" sub={`${ventures.reduce((s, v) => s + v.interviews.length, 0)} interviews`} />
        <Stat label="Goals" value={activeGoals.length} color="indigo" sub="Active" />
        <Stat label="Memories" value={memories.length} color="emerald" sub="What Sage knows" />
      </div>

      {/* Adaptive tiles (re-ranked by your usage) */}
      <h2 className="mt-12 mb-4 font-[family-name:var(--font-display)] text-xl font-semibold flex items-center gap-2">
        <Sparkles className="size-5 text-amber" /> Adaptive · ranked by what you use
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {tiles.map((t) => (
          <Link key={t.href} href={t.href} className="glass lift rounded-2xl p-4 hover:border-emerald/40 transition group flex flex-col gap-2 items-center text-center">
            <t.icon className={`size-6 text-${t.c} group-hover:scale-110 transition`} />
            <div className="text-sm font-medium">{t.label}</div>
            {(prefs.routeFrequency[t.href] ?? 0) > 0 && <div className="text-[10px] text-muted">×{prefs.routeFrequency[t.href]}</div>}
          </Link>
        ))}
      </div>

      {/* Active venture, with live health */}
      {activeVenture && (
        <section className="mt-12 glass rounded-3xl p-7 sm:p-10 relative overflow-hidden">
          <div className="absolute -top-20 -right-20 size-72 rounded-full bg-emerald opacity-15 blur-3xl aurora" />
          <div className="relative grid lg:grid-cols-[1fr_auto] gap-8 items-end">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-amber mb-3 flex items-center gap-2">
                <Sparkles className="size-3.5" /> Active venture · Phase: {activeVenture.phase}
              </p>
              <h3 className="font-[family-name:var(--font-display)] text-3xl font-semibold leading-tight">{activeVenture.name}</h3>
              <p className="mt-2 text-muted max-w-2xl leading-relaxed">{activeVenture.tagline}</p>
              {activeHealth && (
                <div className="mt-5 max-w-md">
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-muted uppercase tracking-widest">Venture health</span>
                    <span className={`font-mono ${activeHealth.score >= 60 ? "text-emerald" : activeHealth.score >= 35 ? "text-amber" : "text-rust"}`}>{activeHealth.score}/100</span>
                  </div>
                  <div className="h-2 bg-surface-2 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${activeHealth.score >= 60 ? "bg-emerald" : activeHealth.score >= 35 ? "bg-amber" : "bg-rust"}`}
                      style={{ width: `${activeHealth.score}%` }}
                    />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                    {activeHealth.drivers.map((d) => <span key={d}>· {d}</span>)}
                  </div>
                </div>
              )}
              <div className="flex flex-wrap gap-x-6 gap-y-2 mt-5 text-sm">
                <span className="flex items-center gap-1.5 text-muted"><Target className="size-3.5 text-emerald" /> Interviews: <span className="text-foreground">{activeVenture.interviews.length} / {activeVenture.metrics.interviewsTarget}</span></span>
                <span className="flex items-center gap-1.5 text-muted"><Clock className="size-3.5 text-amber" /> MVP tasks: <span className="text-foreground">{activeVenture.mvpTasks.filter((t) => t.done).length} / {activeVenture.mvpTasks.length}</span></span>
                <span className="flex items-center gap-1.5 text-muted"><Wallet className="size-3.5 text-emerald" /> MRR: <span className="text-foreground">${activeVenture.metrics.mrr}</span></span>
              </div>
            </div>
            <Link href={`/studio/venture/${activeVenture.id}`} className="bg-emerald text-black font-semibold px-6 py-3 rounded-full hover:bg-amber transition flex items-center gap-2 shrink-0">
              Open venture <ArrowUpRight className="size-4" />
            </Link>
          </div>
        </section>
      )}

      {/* Recommended for your discipline */}
      {rec.department && (
        <section className="mt-12">
          <div className="flex items-end justify-between mb-5">
            <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold flex items-center gap-2">
              <GraduationCap className="size-5 text-emerald" /> Tuned for {rec.department.name}
            </h2>
            <Link href="/studio/path" className="text-sm text-emerald hover:underline">Open Your Path →</Link>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {rec.problems.slice(0, 3).map((p) => (
              <Link key={p.id} href={`/studio/problems/${p.id}`} className="glass lift rounded-2xl p-5 hover:border-emerald/40 transition group">
                <div className="flex items-center justify-between text-[10px] uppercase tracking-widest mb-3">
                  <span className="text-emerald">{p.sector}</span>
                  <span className="text-muted">{p.region}</span>
                </div>
                <h3 className="font-semibold leading-tight group-hover:text-emerald transition">{p.title}</h3>
                <p className="mt-2 text-xs text-muted line-clamp-2">{p.affected}</p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function StatBadge({ icon: Icon, label, value, color }: { icon: typeof Flame; label: string; value: string; color: string }) {
  return (
    <div className="glass rounded-xl px-4 py-3 flex items-center gap-3">
      <Icon className={`size-5 ${color}`} />
      <div className="leading-tight">
        <div className="text-[10px] uppercase tracking-widest text-muted">{label}</div>
        <div className="font-semibold">{value}</div>
      </div>
    </div>
  );
}

// Conic-gradient momentum gauge in the user's accent color.
function MomentumRing({ value, trend }: { value: number; trend: "rising" | "steady" | "cooling" }) {
  const TrendIcon = trend === "rising" ? TrendingUp : trend === "cooling" ? TrendingDown : Minus;
  return (
    <div className="relative size-36 shrink-0 self-center" title={`Momentum ${value}/100 — ${trend}`}>
      <div
        className="absolute inset-0 rounded-full"
        style={{ background: `conic-gradient(var(--accent) ${value * 3.6}deg, var(--surface-2) 0deg)` }}
      />
      <div className="absolute inset-2 rounded-full bg-background flex flex-col items-center justify-center">
        <div className="text-3xl font-semibold font-[family-name:var(--font-display)]">{value}</div>
        <div className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted">
          <TrendIcon className={`size-3 ${trend === "rising" ? "text-emerald" : trend === "cooling" ? "text-rust" : "text-muted"}`} />
          Momentum
        </div>
      </div>
    </div>
  );
}

function SignalCard({ icon: Icon, label, value, sub, trend }: {
  icon: typeof Brain; label: string; value: string; sub: string; trend: "rising" | "steady" | "cooling";
}) {
  const TrendIcon = trend === "rising" ? TrendingUp : trend === "cooling" ? TrendingDown : Minus;
  const trendColor = trend === "rising" ? "text-emerald" : trend === "cooling" ? "text-rust" : "text-muted";
  return (
    <div className="glass rounded-2xl p-4 flex items-center gap-3.5">
      <div className="size-10 rounded-xl bg-accent/10 border border-accent/15 flex items-center justify-center shrink-0">
        <Icon className="size-5 text-accent" />
      </div>
      <div className="min-w-0 leading-tight flex-1">
        <div className="text-[10px] uppercase tracking-widest text-muted">{label}</div>
        <div className="font-semibold text-lg">{value}</div>
        <div className="text-[11px] text-muted truncate">{sub}</div>
      </div>
      <TrendIcon className={`size-4 shrink-0 ${trendColor}`} />
    </div>
  );
}
