"use client";

import Link from "next/link";
import {
  Brain, Compass, FlaskConical, Rocket, Globe2, Flame, Trophy, TrendingUp,
  ArrowUpRight, Sparkles, Clock, Target, Wallet, BookMarked, Map, Lightbulb,
  Bot, Network, FileText, Notebook, Paintbrush, Briefcase, MessageSquare,
  Users, Award, Settings, Building2, Folder,
} from "lucide-react";
import { TRACKS } from "@/lib/curriculum";
import { PROBLEMS } from "@/lib/problems";
import { AGENTS } from "@/lib/agents";
import { useStore, level, xpInLevel, xpToNextLevel } from "@/store";
import { useExt } from "@/store/extensions";
import { Card, Badge, Stat } from "@/components/ui";

export default function Dashboard() {
  const { user, xp, streak, ventures, progress, dueCards } = useStore();
  const { brainstorms, objectives, notes, agentRuns } = useExt();
  if (!user) return null;

  const lvl = level(xp);
  const inLvl = xpInLevel(xp);
  const toNext = xpToNextLevel();
  const due = dueCards();
  const completedLessons = Object.values(progress).filter((p) => p.status === "completed").length;
  const inProgressLessons = Object.values(progress).filter((p) => p.status === "in-progress");
  const activeVenture = ventures[0];
  const todayHour = new Date().getHours();
  const greeting = todayHour < 12 ? "Good morning" : todayHour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="max-w-7xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      {/* Greeting + stats */}
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

      {/* Daily briefing */}
      <Card className="mt-8 p-6 sm:p-8 relative overflow-hidden bg-gradient-to-br from-emerald/10 via-transparent to-amber/10">
        <div className="absolute -top-16 -right-16 size-48 rounded-full bg-emerald opacity-20 blur-3xl" />
        <div className="absolute -bottom-16 -left-16 size-48 rounded-full bg-amber opacity-20 blur-3xl" />
        <div className="relative">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-amber mb-3">
            <Sparkles className="size-3.5" /> Today's briefing from Sage
          </div>
          <p className="text-lg leading-relaxed">
            {activeVenture ? (
              <>You're <span className="text-amber font-medium">Day {Math.floor((Date.now() - activeVenture.createdAt) / 86_400_000) || 1}</span> of {activeVenture.name}. <span className="text-emerald">{activeVenture.interviews.length}/{activeVenture.metrics.interviewsTarget}</span> interviews. <span className="text-foreground">Highest-leverage move:</span> {activeVenture.interviews.length < 5 ? "log 3 more discovery interviews before Friday." : activeVenture.interviews.length < activeVenture.metrics.interviewsTarget ? "convert verbals to signed LOIs." : "ship MVP task #1 and post to the Arena."} {due.length > 0 && <>Also: <span className="text-amber">{due.length} flashcards</span> due — 7 min to clear.</>}</>
            ) : (
              <>You haven't started a venture yet. The fastest path: <Link href="/studio/atlas" className="text-emerald underline">open the Atlas</Link>, pick one of the 12 problem hotspots, and let Akili scope it down to a 14-day validation sprint.</>
            )}
          </p>
          <div className="mt-5 flex gap-2 flex-wrap">
            {due.length > 0 && (
              <Link href="/studio/srs" className="text-sm bg-emerald text-black font-medium px-4 py-2 rounded-full hover:bg-amber transition inline-flex items-center gap-1.5">
                <BookMarked className="size-3.5" /> Clear {due.length} cards
              </Link>
            )}
            {activeVenture && (
              <Link href={`/studio/venture/${activeVenture.id}`} className="text-sm border border-border bg-surface px-4 py-2 rounded-full hover:bg-surface-2 transition inline-flex items-center gap-1.5">
                <Rocket className="size-3.5" /> Open {activeVenture.name}
              </Link>
            )}
            <Link href="/studio/tutor" className="text-sm border border-border bg-surface px-4 py-2 rounded-full hover:bg-surface-2 transition inline-flex items-center gap-1.5">
              <Brain className="size-3.5" /> Ask Sage
            </Link>
          </div>
        </div>
      </Card>

      <Card className="mt-4 p-5">
        <div className="flex items-center justify-between text-sm mb-3">
          <span className="text-muted">Level {lvl} → Level {lvl + 1}</span>
          <span className="font-mono text-emerald">{inLvl} / {toNext} XP</span>
        </div>
        <div className="h-2.5 bg-surface-2 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-emerald to-amber rounded-full transition-all" style={{ width: `${(inLvl / toNext) * 100}%` }} />
        </div>
      </Card>

      {/* Activity stats */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-8">
        <Stat label="Lessons completed" value={completedLessons} color="emerald" sub={`${inProgressLessons.length} in progress`} />
        <Stat label="Cards due" value={due.length} color="amber" sub="SRS review" />
        <Stat label="Ventures active" value={ventures.length} color="rust" sub={`${ventures.reduce((s, v) => s + v.interviews.length, 0)} interviews logged`} />
        <Stat label="Agents run" value={agentRuns.length} color="indigo" sub={`${brainstorms.length} brainstorms · ${notes.length} notes`} />
      </div>

      {/* Quick access tiles */}
      <h2 className="mt-12 mb-4 font-[family-name:var(--font-display)] text-xl font-semibold">Jump back in</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          { href: "/studio/tutor", icon: Brain, label: "Sage", c: "emerald" },
          { href: "/studio/brainstorm", icon: Lightbulb, label: "Brainstorm", c: "amber" },
          { href: "/studio/agents", icon: Bot, label: "Agents", c: "indigo" },
          { href: "/studio/atlas", icon: Map, label: "Atlas", c: "emerald" },
          { href: "/studio/arena", icon: Trophy, label: "Arena", c: "amber" },
          { href: "/studio/venture", icon: Rocket, label: "Ventures", c: "rust" },
          { href: "/studio/conglomerate", icon: Network, label: "Conglomerate", c: "indigo" },
          { href: "/studio/lab", icon: FlaskConical, label: "Lab", c: "indigo" },
          { href: "/studio/learn", icon: Compass, label: "Learn", c: "amber" },
          { href: "/studio/srs", icon: BookMarked, label: "Daily Review", c: "emerald" },
          { href: "/studio/documents", icon: FileText, label: "Documents", c: "amber" },
          { href: "/studio/brand", icon: Paintbrush, label: "Brand", c: "rust" },
          { href: "/studio/okrs", icon: Target, label: "OKRs", c: "emerald" },
          { href: "/studio/notebook", icon: Notebook, label: "Notebook", c: "indigo" },
          { href: "/studio/funding", icon: Wallet, label: "Funding", c: "amber" },
        ].map((q) => (
          <Link key={q.href} href={q.href} className="glass rounded-2xl p-4 hover:border-emerald/40 transition group flex flex-col gap-2 items-center text-center">
            <q.icon className={`size-6 text-${q.c} group-hover:scale-110 transition`} />
            <div className="text-sm font-medium">{q.label}</div>
          </Link>
        ))}
      </div>

      {/* In-progress tracks */}
      {inProgressLessons.length > 0 && (
        <section className="mt-12">
          <div className="flex items-end justify-between mb-5">
            <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">Tracks in progress</h2>
            <Link href="/studio/learn" className="text-sm text-emerald hover:underline">All tracks →</Link>
          </div>
          <div className="grid gap-3">
            {Array.from(new Set(inProgressLessons.map((p) => p.trackId))).map((trackId) => {
              const t = TRACKS.find((x) => x.id === trackId);
              if (!t) return null;
              const pct = (Object.values(progress).filter((p) => p.trackId === trackId && p.status === "completed").length / t.lessons.length) * 100;
              return (
                <Link key={t.id} href={`/studio/learn/${t.id}`} className="glass rounded-2xl p-5 flex items-center justify-between gap-6 hover:border-emerald/40 transition">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-xs text-muted mb-1.5">
                      <span className="size-2 rounded-full" style={{ background: t.color }} />
                      {t.pillar} · {t.level}
                    </div>
                    <div className="font-semibold truncate">{t.title}</div>
                    <div className="mt-3 h-1.5 bg-surface-2 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: t.color }} />
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono text-2xl font-semibold" style={{ color: t.color }}>{Math.round(pct)}%</div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Active venture */}
      {activeVenture && (
        <section className="mt-12 glass rounded-3xl p-7 sm:p-10 relative overflow-hidden">
          <div className="absolute -top-20 -right-20 size-72 rounded-full bg-emerald opacity-15 blur-3xl" />
          <div className="absolute -bottom-20 -left-20 size-72 rounded-full bg-amber opacity-10 blur-3xl" />
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
              Open venture room <ArrowUpRight className="size-4" />
            </Link>
          </div>
        </section>
      )}

      {/* Agent suggestions */}
      <section className="mt-12">
        <div className="flex items-end justify-between mb-5">
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold flex items-center gap-2">
            <Bot className="size-5 text-emerald" /> Try an agent
          </h2>
          <Link href="/studio/agents" className="text-sm text-emerald hover:underline">All {AGENTS.length} →</Link>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {AGENTS.slice(0, 3).map((a) => (
            <Link key={a.id} href={`/studio/agents/${a.id}`} className="glass rounded-2xl p-5 hover:border-emerald/40 transition group">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="text-3xl">{a.icon}</div>
                <Badge color="muted">~{a.estSeconds}s</Badge>
              </div>
              <h3 className="font-semibold">{a.name}</h3>
              <p className="text-xs text-muted mt-1 line-clamp-2">{a.short}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* Problem hub teaser */}
      <section className="mt-12">
        <div className="flex items-end justify-between mb-5">
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold flex items-center gap-2">
            <Globe2 className="size-5 text-emerald" /> Problems waiting to be solved
          </h2>
          <Link href="/studio/problems" className="text-sm text-emerald hover:underline">Browse all {PROBLEMS.length} →</Link>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {PROBLEMS.slice(0, 3).map((p) => (
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
