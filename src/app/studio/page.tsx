"use client";

import Link from "next/link";
import {
  Brain,
  Compass,
  FlaskConical,
  Rocket,
  Globe2,
  Flame,
  Trophy,
  TrendingUp,
  ArrowUpRight,
  Sparkles,
  Clock,
  Target,
  Users,
  Wallet,
  BookMarked,
} from "lucide-react";
import { TRACKS } from "@/lib/curriculum";
import { PROBLEMS } from "@/lib/problems";
import { useStore, level, xpInLevel, xpToNextLevel } from "@/store";
import { Card } from "@/components/ui";

export default function Dashboard() {
  const { user, xp, streak, ventures, progress, cards, dueCards } = useStore();
  if (!user) return null;

  const lvl = level(xp);
  const inLvl = xpInLevel(xp);
  const toNext = xpToNextLevel();
  const due = dueCards();

  const completedLessons = Object.values(progress).filter((p) => p.status === "completed").length;
  const inProgressLessons = Object.values(progress).filter((p) => p.status === "in-progress");

  const activeVenture = ventures[0];

  const QUICK = [
    { href: "/studio/tutor", icon: Brain, label: "Ask Sage", desc: "Always-on AI tutor", c: "emerald" },
    { href: "/studio/srs", icon: BookMarked, label: `Daily Review (${due.length})`, desc: "Spaced-repetition cards due", c: due.length > 0 ? "amber" : "muted" },
    { href: "/studio/learn", icon: Compass, label: "Continue learning", desc: `${completedLessons} lessons completed`, c: "indigo" },
    { href: "/studio/venture", icon: Rocket, label: ventures.length > 0 ? "Venture room" : "Start a venture", desc: ventures.length > 0 ? activeVenture.name : "Pick a problem to solve", c: "rust" },
  ];

  return (
    <div className="max-w-6xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-emerald">Akwaaba, {user.name.split(" ")[0]}</p>
          <h1 className="font-[family-name:var(--font-display)] text-3xl sm:text-4xl font-semibold mt-2 leading-tight">
            {streak > 0 ? (
              <>
                {streak}-day streak. <span className="text-emerald">Keep it alive.</span>
              </>
            ) : (
              <>
                Welcome back. <span className="text-emerald">Today is the day.</span>
              </>
            )}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <StatBadge icon={Flame} label="Streak" value={`${streak} day${streak === 1 ? "" : "s"}`} color="text-rust" />
          <StatBadge icon={Trophy} label="Level" value={`Lv ${lvl}`} color="text-amber" />
          <StatBadge icon={TrendingUp} label="XP" value={xp.toLocaleString()} color="text-emerald" />
        </div>
      </div>

      <Card className="mt-8 p-5">
        <div className="flex items-center justify-between text-sm mb-3">
          <span className="text-muted">Level {lvl} → Level {lvl + 1}</span>
          <span className="font-mono text-emerald">{inLvl} / {toNext} XP</span>
        </div>
        <div className="h-2.5 bg-surface-2 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-emerald to-amber rounded-full transition-all"
            style={{ width: `${(inLvl / toNext) * 100}%` }}
          />
        </div>
        <p className="mt-3 text-xs text-muted">
          Reach Level {lvl + 1} to unlock {lvl < 5 ? "the Pitch Deck Generator and your first investor intro" : lvl < 10 ? "advanced lab simulations + cohort access" : "fundraising tools and mentor priority booking"}.
        </p>
      </Card>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-8">
        {QUICK.map((q) => (
          <Link
            key={q.href}
            href={q.href}
            className="glass rounded-2xl p-5 hover:border-emerald/40 transition group"
          >
            <q.icon className={`size-6 mb-4 text-${q.c}`} />
            <div className="font-semibold flex items-center gap-1">
              {q.label}
              <ArrowUpRight className="size-3.5 opacity-0 group-hover:opacity-100 transition" />
            </div>
            <p className="mt-1.5 text-xs text-muted leading-relaxed">{q.desc}</p>
          </Link>
        ))}
      </div>

      {/* In-progress tracks */}
      {inProgressLessons.length > 0 && (
        <section className="mt-12">
          <div className="flex items-end justify-between mb-5">
            <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold">In progress</h2>
            <Link href="/studio/learn" className="text-sm text-emerald hover:underline">All tracks →</Link>
          </div>
          <div className="grid gap-3">
            {Array.from(new Set(inProgressLessons.map((p) => p.trackId))).map((trackId) => {
              const t = TRACKS.find((x) => x.id === trackId);
              if (!t) return null;
              const pct = (Object.values(progress).filter((p) => p.trackId === trackId && p.status === "completed").length / t.lessons.length) * 100;
              return (
                <Link
                  key={t.id}
                  href={`/studio/learn/${t.id}`}
                  className="glass rounded-2xl p-5 flex items-center justify-between gap-6 hover:border-emerald/40 transition"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-xs text-muted mb-1.5">
                      <span className="size-2 rounded-full" style={{ background: t.color }} />
                      {t.pillar} · {t.level}
                    </div>
                    <div className="font-semibold truncate">{t.title}</div>
                    <p className="text-sm text-muted mt-1 truncate">{t.tagline}</p>
                    <div className="mt-3 h-1.5 bg-surface-2 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: t.color }} />
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono text-2xl font-semibold" style={{ color: t.color }}>{Math.round(pct)}%</div>
                    <div className="text-xs text-muted">{t.hours}h total</div>
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
                <Sparkles className="size-3.5" /> Your active venture · Phase: {activeVenture.phase}
              </p>
              <h3 className="font-[family-name:var(--font-display)] text-3xl font-semibold leading-tight">
                {activeVenture.name}
              </h3>
              <p className="mt-2 text-muted max-w-2xl leading-relaxed">{activeVenture.tagline}</p>
              <div className="flex flex-wrap gap-x-6 gap-y-2 mt-5 text-sm">
                <span className="flex items-center gap-1.5 text-muted">
                  <Target className="size-3.5 text-emerald" /> Interviews: <span className="text-foreground">{activeVenture.interviews.length} / {activeVenture.metrics.interviewsTarget}</span>
                </span>
                <span className="flex items-center gap-1.5 text-muted">
                  <Clock className="size-3.5 text-amber" /> MVP tasks: <span className="text-foreground">{activeVenture.mvpTasks.filter((t) => t.done).length} / {activeVenture.mvpTasks.length}</span>
                </span>
                <span className="flex items-center gap-1.5 text-muted">
                  <Wallet className="size-3.5 text-emerald" /> MRR: <span className="text-foreground">${activeVenture.metrics.mrr}</span>
                </span>
              </div>
            </div>
            <Link
              href={`/studio/venture/${activeVenture.id}`}
              className="bg-emerald text-black font-semibold px-6 py-3 rounded-full hover:bg-amber transition flex items-center gap-2 shrink-0"
            >
              Open venture room <ArrowUpRight className="size-4" />
            </Link>
          </div>
        </section>
      )}

      {/* Problem hub teaser */}
      <section className="mt-12">
        <div className="flex items-end justify-between mb-5">
          <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold flex items-center gap-2">
            <Globe2 className="size-5 text-emerald" /> Problems waiting to be solved
          </h2>
          <Link href="/studio/problems" className="text-sm text-emerald hover:underline">Browse all {PROBLEMS.length} →</Link>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {PROBLEMS.slice(0, 3).map((p) => (
            <Link
              key={p.id}
              href={`/studio/problems/${p.id}`}
              className="glass rounded-2xl p-5 hover:border-emerald/40 transition group"
            >
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
