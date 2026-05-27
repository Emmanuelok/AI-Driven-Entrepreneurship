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
} from "lucide-react";
import { TRACKS } from "@/lib/curriculum";
import { PROBLEMS } from "@/lib/problems";

const STREAK = 14;
const XP = 4820;
const LEVEL = 7;
const NEXT_LEVEL_XP = 5500;

const PROGRESS = [
  { trackId: "stem-intuition", pct: 38 },
  { trackId: "coding-craft", pct: 62 },
  { trackId: "venture-building", pct: 18 },
];

const QUICK = [
  { href: "/studio/tutor", icon: Brain, label: "Ask Sage", desc: "AI tutor — 1:1 help, your language", c: "emerald" },
  { href: "/studio/learn", icon: Compass, label: "Continue track", desc: "Code That Ships · Lesson 6 of 14", c: "amber" },
  { href: "/studio/lab", icon: FlaskConical, label: "Open Lab", desc: "Coding playground · physics sims", c: "indigo" },
  { href: "/studio/venture", icon: Rocket, label: "Work on venture", desc: "Cocoa cooperative dashboard · Day 12", c: "rust" },
];

export default function Dashboard() {
  return (
    <div className="max-w-6xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      {/* greeting */}
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-emerald">Akwaaba, Ama</p>
          <h1 className="font-[family-name:var(--font-display)] text-3xl sm:text-4xl font-semibold mt-2 leading-tight">
            You shipped <span className="text-emerald">3 lessons</span> yesterday. <br />Let&apos;s keep the fire going.
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <Stat icon={Flame} label="Streak" value={`${STREAK} days`} color="text-rust" />
          <Stat icon={Trophy} label="Level" value={`Lv ${LEVEL}`} color="text-amber" />
          <Stat icon={TrendingUp} label="XP" value={XP.toLocaleString()} color="text-emerald" />
        </div>
      </div>

      {/* level progress */}
      <div className="mt-8 glass rounded-2xl p-5">
        <div className="flex items-center justify-between text-sm mb-3">
          <span className="text-muted">Level {LEVEL} → Level {LEVEL + 1}</span>
          <span className="font-mono text-emerald">{XP} / {NEXT_LEVEL_XP} XP</span>
        </div>
        <div className="h-2.5 bg-surface-2 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-emerald to-amber rounded-full transition-all"
            style={{ width: `${(XP / NEXT_LEVEL_XP) * 100}%` }}
          />
        </div>
        <p className="mt-3 text-xs text-muted">
          Reach Level 8 to unlock the <span className="text-foreground">Pitch Deck Generator</span> and your first investor intro.
        </p>
      </div>

      {/* quick actions */}
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

      {/* tracks in progress */}
      <section className="mt-12">
        <div className="flex items-end justify-between mb-5">
          <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold">In progress</h2>
          <Link href="/studio/learn" className="text-sm text-emerald hover:underline">All tracks →</Link>
        </div>
        <div className="grid gap-3">
          {PROGRESS.map((p) => {
            const t = TRACKS.find((x) => x.id === p.trackId)!;
            return (
              <Link
                key={t.id}
                href="/studio/learn"
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
                    <div className="h-full rounded-full" style={{ width: `${p.pct}%`, background: t.color }} />
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-mono text-2xl font-semibold" style={{ color: t.color }}>{p.pct}%</div>
                  <div className="text-xs text-muted">{t.hours}h total</div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* venture spotlight */}
      <section className="mt-12 glass rounded-3xl p-7 sm:p-10 relative overflow-hidden">
        <div className="absolute -top-20 -right-20 size-72 rounded-full bg-emerald opacity-15 blur-3xl" />
        <div className="absolute -bottom-20 -left-20 size-72 rounded-full bg-amber opacity-10 blur-3xl" />
        <div className="relative grid lg:grid-cols-[1fr_auto] gap-8 items-end">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-amber mb-3 flex items-center gap-2">
              <Sparkles className="size-3.5" /> Your active venture
            </p>
            <h3 className="font-[family-name:var(--font-display)] text-3xl font-semibold leading-tight">
              KubaCold — solar microcold-storage for tomato co-ops in Northern Ghana
            </h3>
            <p className="mt-3 text-muted max-w-2xl leading-relaxed">
              Pain point you picked: <span className="text-foreground">30–40% post-harvest loss for smallholder produce</span>. Day 12 of customer discovery. Sage scheduled your next 4 interviews in Tamale this week.
            </p>
            <div className="flex flex-wrap gap-x-6 gap-y-2 mt-5 text-sm">
              <span className="flex items-center gap-1.5 text-muted"><Target className="size-3.5 text-emerald" /> Interviews: <span className="text-foreground">11 / 20</span></span>
              <span className="flex items-center gap-1.5 text-muted"><Clock className="size-3.5 text-amber" /> MVP target: <span className="text-foreground">21 days</span></span>
              <span className="flex items-center gap-1.5 text-muted"><Trophy className="size-3.5 text-rust" /> Phase: <span className="text-foreground">Validate</span></span>
            </div>
          </div>
          <Link
            href="/studio/venture"
            className="bg-emerald text-black font-semibold px-6 py-3 rounded-full hover:bg-amber transition flex items-center gap-2 shrink-0"
          >
            Open venture room <ArrowUpRight className="size-4" />
          </Link>
        </div>
      </section>

      {/* problem hub teaser */}
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

function Stat({ icon: Icon, label, value, color }: { icon: typeof Flame; label: string; value: string; color: string }) {
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
