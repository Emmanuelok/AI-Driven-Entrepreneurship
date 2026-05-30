"use client";

import { useMemo } from "react";
import Link from "next/link";
import { TRACKS } from "@/lib/curriculum";
import { INTERACTIVE_LESSONS } from "@/lib/interactive-lessons";
import { resolveDepartment } from "@/lib/recommendations";
import { useStore } from "@/store";
import { Card, Badge } from "@/components/ui";
import { Clock, Layers, Play, Sparkles, ChevronRight, Zap, Brain, GraduationCap } from "lucide-react";

export default function LearnPage() {
  const { progress, user } = useStore();
  const dept = useMemo(() => resolveDepartment(user?.field), [user?.field]);

  // Tracks wired to the user's department, in the order the discipline
  // recommends them. Everything else follows, original order preserved.
  const { recommended, rest } = useMemo(() => {
    if (!dept) return { recommended: [] as typeof TRACKS, rest: TRACKS };
    const relIds = dept.relevantTracks;
    const recommended = relIds
      .map((id) => TRACKS.find((t) => t.id === id))
      .filter((t): t is (typeof TRACKS)[number] => !!t);
    const recSet = new Set(recommended.map((t) => t.id));
    const rest = TRACKS.filter((t) => !recSet.has(t.id));
    return { recommended, rest };
  }, [dept]);

  const orderedTracks = [...recommended, ...rest];

  return (
    <div className="max-w-6xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      {/* Interactive lessons hero strip */}
      <Card className="p-6 sm:p-8 mb-8 relative overflow-hidden bg-gradient-to-br from-emerald/15 via-transparent to-amber/15 border-emerald/30">
        <div className="absolute -top-20 -right-20 size-64 rounded-full bg-emerald/20 blur-3xl" />
        <div className="relative flex items-start justify-between gap-4 flex-wrap mb-5">
          <div>
            <div className="text-[10px] uppercase tracking-[0.25em] text-emerald mb-2 flex items-center gap-1.5">
              <Zap className="size-3.5" /> Interactive · Brilliant/AoPS-class
            </div>
            <h2 className="font-[family-name:var(--font-display)] text-2xl sm:text-3xl font-semibold leading-tight">Lessons that talk back.</h2>
            <p className="mt-2 text-muted max-w-xl text-sm">Live simulations. Socratic dialogue with Sage. Adaptive difficulty. Visible mastery growth on every screen.</p>
          </div>
        </div>
        <div className="relative grid sm:grid-cols-3 gap-3">
          {INTERACTIVE_LESSONS.map((l) => (
            <Link key={l.id} href={`/studio/interactive/${l.id}`} className="glass rounded-2xl p-5 hover:border-emerald/40 transition group">
              <div className="flex items-center justify-between mb-3">
                <Brain className="size-4 text-emerald" />
                <div className="flex gap-0.5" title={`Difficulty ${l.difficulty}/5`}>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <span key={i} className={`size-1.5 rounded-full ${i < l.difficulty ? "bg-amber" : "bg-border"}`} />
                  ))}
                </div>
              </div>
              <div className="font-medium leading-snug">{l.title}</div>
              <p className="text-xs text-muted mt-2 line-clamp-2">{l.subtitle}</p>
              <div className="mt-4 flex items-center justify-between text-xs">
                <span className="text-muted flex items-center gap-1"><Clock className="size-3" /> ~{l.estMinutes}m</span>
                <span className="text-emerald flex items-center gap-1 group-hover:gap-2 transition-all">Begin <ChevronRight className="size-3" /></span>
              </div>
            </Link>
          ))}
        </div>
      </Card>

      {/* Recommended-for-your-discipline strip */}
      {dept && recommended.length > 0 && (
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-3">
            <GraduationCap className="size-3.5 text-emerald" />
            <p className="text-xs uppercase tracking-[0.22em] text-emerald">Wired for {dept.name}</p>
          </div>
          <p className="text-sm text-muted mb-4 max-w-2xl">
            These tracks were matched to your discipline during onboarding. Start here — they map directly onto the AI opportunities your field unlocks.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {recommended.map((t) => {
              const completed = t.lessons.filter((l) => progress[`${t.id}/${l.id}`]?.status === "completed").length;
              const pct = (completed / t.lessons.length) * 100;
              return (
                <Link key={t.id} href={`/studio/learn/${t.id}`} className="glass rounded-2xl p-5 border-emerald/30 hover:border-emerald/50 transition group">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="size-2 rounded-full" style={{ background: t.color }} />
                    <Badge color="emerald">{t.pillar}</Badge>
                  </div>
                  <div className="font-medium leading-snug">{t.title}</div>
                  <p className="text-xs text-muted mt-1.5 line-clamp-2">{t.tagline}</p>
                  <div className="mt-3 h-1 bg-surface-2 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: t.color }} />
                  </div>
                  <div className="mt-2.5 flex items-center justify-between text-[11px] text-muted">
                    <span>{completed}/{t.lessons.length} done</span>
                    <span className="text-emerald flex items-center gap-1 group-hover:gap-1.5 transition-all">Open <ChevronRight className="size-3" /></span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex items-end justify-between flex-wrap gap-6 mb-10">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-emerald mb-2">{dept ? "All learning tracks" : "Learning tracks"}</p>
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight">
            Tracks built from the best of every platform — adapted for your continent.
          </h1>
          <p className="mt-4 text-muted max-w-2xl leading-relaxed">
            Brilliant's intuition. AoPS's depth. Khan's breadth. Codecademy's practice. Coursera's structure. Duolingo's habits. Anki's retention. PhET's visuals. Labster's labs. All adaptive. All free for students.
          </p>
        </div>
        <Card className="px-5 py-4 flex items-center gap-4">
          <Sparkles className="size-5 text-amber" />
          <div className="text-xs leading-tight">
            <div className="text-muted">Adaptive difficulty engine</div>
            <div className="text-foreground font-medium">Adjusts to your pace in real time</div>
          </div>
        </Card>
      </div>

      <div className="grid gap-5">
        {orderedTracks.map((t) => {
          const completed = t.lessons.filter((l) => progress[`${t.id}/${l.id}`]?.status === "completed").length;
          const pct = (completed / t.lessons.length) * 100;
          const isRecommended = !!dept && dept.relevantTracks.includes(t.id);
          return (
            <Card key={t.id} className={`overflow-hidden ${isRecommended ? "ring-1 ring-emerald/20" : ""}`}>
              <div className="p-6 sm:p-8 grid lg:grid-cols-[2fr_3fr] gap-8 items-start">
                <div>
                  <div className="flex items-center gap-3 mb-3 flex-wrap">
                    <span className="size-2.5 rounded-full" style={{ background: t.color }} />
                    <Badge color="emerald">{t.pillar}</Badge>
                    <Badge color="muted">{t.level}</Badge>
                    {isRecommended && (
                      <span className="text-[10px] uppercase tracking-widest text-emerald inline-flex items-center gap-1">
                        <GraduationCap className="size-2.5" /> For your discipline
                      </span>
                    )}
                  </div>
                  <h2 className="font-[family-name:var(--font-display)] text-2xl sm:text-3xl font-semibold leading-tight">{t.title}</h2>
                  <p className="mt-3 text-muted leading-relaxed">{t.tagline}</p>
                  <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm">
                    <span className="flex items-center gap-1.5 text-muted">
                      <Clock className="size-3.5" /> {t.hours}h total
                    </span>
                    <span className="flex items-center gap-1.5 text-muted">
                      <Layers className="size-3.5" /> {t.lessons.length} lessons
                    </span>
                    <span className="font-mono" style={{ color: t.color }}>{completed}/{t.lessons.length} done</span>
                  </div>
                  <div className="mt-4 h-1.5 bg-surface-2 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: t.color }} />
                  </div>
                  <Link
                    href={`/studio/learn/${t.id}`}
                    className="mt-6 inline-flex items-center gap-2 font-medium px-5 py-2.5 rounded-full transition hover:bg-amber"
                    style={{ background: t.color, color: "#001" }}
                  >
                    <Play className="size-4" /> Open track
                  </Link>
                </div>
                <div className="space-y-2">
                  {t.lessons.slice(0, 4).map((l, i) => (
                    <Link
                      key={l.id}
                      href={`/studio/learn/${t.id}`}
                      className="flex items-center gap-4 p-3.5 rounded-xl border border-border hover:border-emerald/40 hover:bg-surface-2 transition group"
                    >
                      <span className="font-mono text-xs text-muted w-7 text-right">{String(i + 1).padStart(2, "0")}</span>
                      <Badge color={l.kind === "interactive" ? "emerald" : l.kind === "code" ? "indigo" : l.kind === "venture" ? "amber" : "muted"}>{l.kind}</Badge>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{l.title}</div>
                        <div className="text-xs text-muted truncate">{l.summary}</div>
                      </div>
                      <div className="text-xs text-muted shrink-0">{l.minutes}m</div>
                      <ChevronRight className="size-4 text-muted opacity-0 group-hover:opacity-100 transition" />
                    </Link>
                  ))}
                  {t.lessons.length > 4 && (
                    <Link href={`/studio/learn/${t.id}`} className="block text-center text-sm text-emerald hover:underline py-2">
                      View all {t.lessons.length} lessons →
                    </Link>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
