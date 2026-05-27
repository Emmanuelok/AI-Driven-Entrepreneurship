"use client";

import Link from "next/link";
import { TRACKS } from "@/lib/curriculum";
import { useStore } from "@/store";
import { Card, Badge, Button } from "@/components/ui";
import { Clock, Layers, Play, Sparkles, ChevronRight } from "lucide-react";

export default function LearnPage() {
  const { progress } = useStore();

  return (
    <div className="max-w-6xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <div className="flex items-end justify-between flex-wrap gap-6 mb-10">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-emerald mb-2">Learning</p>
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
        {TRACKS.map((t) => {
          const completed = t.lessons.filter((l) => progress[`${t.id}/${l.id}`]?.status === "completed").length;
          const pct = (completed / t.lessons.length) * 100;
          return (
            <Card key={t.id} className="overflow-hidden">
              <div className="p-6 sm:p-8 grid lg:grid-cols-[2fr_3fr] gap-8 items-start">
                <div>
                  <div className="flex items-center gap-3 mb-3">
                    <span className="size-2.5 rounded-full" style={{ background: t.color }} />
                    <Badge color="emerald">{t.pillar}</Badge>
                    <Badge color="muted">{t.level}</Badge>
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
