"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Brain, Compass, FlaskConical, Rocket, Globe2, Flame, Trophy, TrendingUp,
  ArrowUpRight, Sparkles, Clock, Target, Wallet, BookMarked, Map, Lightbulb,
  Bot, Network, FileText, Notebook, Paintbrush, MessageSquare, Award,
  GraduationCap, User, Timer, Sun, RefreshCcw,
} from "lucide-react";
import { TRACKS } from "@/lib/curriculum";
import { PROBLEMS } from "@/lib/problems";
import { AGENTS } from "@/lib/agents";
import { useStore, level, xpInLevel, xpToNextLevel } from "@/store";
import { useExt } from "@/store/extensions";
import { useMe } from "@/store/me";
import { Card, Badge, Stat, Button } from "@/components/ui";
import { getRecommendations } from "@/lib/recommendations";

// Pool of quick-access tiles. Re-ranked per user by usage frequency.
const ALL_TILES: { href: string; icon: typeof Brain; label: string; c: string }[] = [
  { href: "/studio/tutor", icon: Brain, label: "Sage", c: "emerald" },
  { href: "/studio/me", icon: User, label: "Me", c: "emerald" },
  { href: "/studio/path", icon: GraduationCap, label: "My Path", c: "amber" },
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

export default function Dashboard() {
  const { user, xp, streak, ventures, progress, dueCards } = useStore();
  const { brainstorms, agentRuns } = useExt();
  const { goals, recentActivity, memories, prefs, todaysBrief, setBrief, markPriorityDone } = useMe();
  const [briefing, setBriefing] = useState(false);

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
  const todayHour = new Date().getHours();
  const greeting = todayHour < 12 ? "Good morning" : todayHour < 17 ? "Good afternoon" : "Good evening";
  const activeVenture = ventures[0];

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
      {/* Greeting */}
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-emerald">{greeting}, {user.name.split(" ")[0]}</p>
          <h1 className="font-[family-name:var(--font-display)] text-3xl sm:text-4xl font-semibold mt-2 leading-tight max-w-2xl">
            {streak > 0 ? <>{streak}-day streak. <span className="text-emerald">Keep it alive.</span></> : <>Welcome back. <span className="text-emerald">Today is the day.</span></>}
          </h1>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <StatBadge icon={Flame} label="Streak" value={`${streak}d`} color="text-rust" />
          <StatBadge icon={Trophy} label="Level" value={`Lv ${lvl}`} color="text-amber" />
          <StatBadge icon={TrendingUp} label="XP" value={xp.toLocaleString()} color="text-emerald" />
        </div>
      </div>

      {/* Daily brief */}
      <Card className="mt-8 p-6 sm:p-8 relative overflow-hidden bg-gradient-to-br from-emerald/10 via-transparent to-amber/10">
        <div className="absolute -top-16 -right-16 size-48 rounded-full bg-emerald opacity-20 blur-3xl" />
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

      <Card className="mt-4 p-5">
        <div className="flex items-center justify-between text-sm mb-3">
          <span className="text-muted">Level {lvl} → Level {lvl + 1}</span>
          <span className="font-mono text-emerald">{xpInLevel(xp)} / {xpToNextLevel()} XP</span>
        </div>
        <div className="h-2.5 bg-surface-2 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-emerald to-amber rounded-full transition-all" style={{ width: `${(xpInLevel(xp) / xpToNextLevel()) * 100}%` }} />
        </div>
      </Card>

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
          <Link key={t.href} href={t.href} className="glass rounded-2xl p-4 hover:border-emerald/40 transition group flex flex-col gap-2 items-center text-center">
            <t.icon className={`size-6 text-${t.c} group-hover:scale-110 transition`} />
            <div className="text-sm font-medium">{t.label}</div>
            {(prefs.routeFrequency[t.href] ?? 0) > 0 && <div className="text-[10px] text-muted">×{prefs.routeFrequency[t.href]}</div>}
          </Link>
        ))}
      </div>

      {/* Active venture */}
      {activeVenture && (
        <section className="mt-12 glass rounded-3xl p-7 sm:p-10 relative overflow-hidden">
          <div className="absolute -top-20 -right-20 size-72 rounded-full bg-emerald opacity-15 blur-3xl" />
          <div className="relative grid lg:grid-cols-[1fr_auto] gap-8 items-end">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-amber mb-3 flex items-center gap-2">
                <Sparkles className="size-3.5" /> Active venture · Phase: {activeVenture.phase}
              </p>
              <h3 className="font-[family-name:var(--font-display)] text-3xl font-semibold leading-tight">{activeVenture.name}</h3>
              <p className="mt-2 text-muted max-w-2xl leading-relaxed">{activeVenture.tagline}</p>
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
              <Link key={p.id} href={`/studio/problems/${p.id}`} className="glass rounded-2xl p-5 hover:border-emerald/40 transition group">
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
