import Link from "next/link";
import { TRACKS } from "@/lib/curriculum";
import { Clock, ChevronRight, Play, Layers, Sparkles } from "lucide-react";

export default function LearnPage() {
  return (
    <div className="max-w-6xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <div className="flex items-end justify-between flex-wrap gap-6 mb-10">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-emerald mb-2">Learning</p>
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight">
            Tracks built from the best of every platform — adapted for your continent.
          </h1>
          <p className="mt-4 text-muted max-w-2xl leading-relaxed">
            Brilliant&apos;s intuitive simulations. AoPS&apos;s depth. Khan&apos;s breadth. Codecademy&apos;s in-browser practice. Coursera&apos;s structure. Duolingo&apos;s habits. Anki&apos;s retention. PhET&apos;s visuals. Labster&apos;s labs. All adaptive. All free for students.
          </p>
        </div>
        <div className="glass rounded-2xl px-5 py-4 flex items-center gap-4">
          <Sparkles className="size-5 text-amber" />
          <div className="text-xs leading-tight">
            <div className="text-muted">Adaptive difficulty engine</div>
            <div className="text-foreground font-medium">Adjusts to your pace in real time</div>
          </div>
        </div>
      </div>

      <div className="grid gap-5">
        {TRACKS.map((t) => (
          <article key={t.id} className="glass rounded-3xl overflow-hidden">
            <div className="p-6 sm:p-8 grid lg:grid-cols-[2fr_3fr] gap-8 items-start">
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <span className="size-2.5 rounded-full" style={{ background: t.color }} />
                  <span className="text-xs uppercase tracking-widest text-muted">{t.pillar}</span>
                  <span className="text-xs text-muted">·</span>
                  <span className="text-xs text-muted">{t.level}</span>
                </div>
                <h2 className="font-[family-name:var(--font-display)] text-2xl sm:text-3xl font-semibold leading-tight">{t.title}</h2>
                <p className="mt-3 text-muted leading-relaxed">{t.tagline}</p>
                <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm">
                  <span className="flex items-center gap-1.5 text-muted">
                    <Clock className="size-3.5" /> {t.hours}h total
                  </span>
                  <span className="flex items-center gap-1.5 text-muted">
                    <Layers className="size-3.5" /> {t.lessons.length} lessons in beta
                  </span>
                </div>
                <button
                  type="button"
                  className="mt-6 inline-flex items-center gap-2 bg-emerald text-black font-medium px-5 py-2.5 rounded-full hover:bg-amber transition"
                  style={{ background: t.color, color: "#001" }}
                >
                  <Play className="size-4" /> Start the track
                </button>
              </div>
              <div className="space-y-2">
                {t.lessons.map((l, i) => (
                  <div
                    key={l.id}
                    className="flex items-center gap-4 p-3.5 rounded-xl border border-border hover:border-emerald/40 hover:bg-surface-2 transition group cursor-pointer"
                  >
                    <span className="font-mono text-xs text-muted w-7 text-right">{String(i + 1).padStart(2, "0")}</span>
                    <KindBadge kind={l.kind} />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{l.title}</div>
                      <div className="text-xs text-muted truncate">{l.summary}</div>
                    </div>
                    <div className="text-xs text-muted shrink-0">{l.minutes}m</div>
                    <ChevronRight className="size-4 text-muted opacity-0 group-hover:opacity-100 transition" />
                  </div>
                ))}
              </div>
            </div>
          </article>
        ))}
      </div>

      <div className="mt-12 glass rounded-2xl p-6 text-center text-sm text-muted">
        <span className="text-amber">Coming next:</span> spaced-repetition flashcards (Anki-class), peer study circles, certified pathways recognized by 14 African universities.
      </div>
    </div>
  );
}

function KindBadge({ kind }: { kind: string }) {
  const map: Record<string, { c: string; label: string }> = {
    concept: { c: "text-amber border-amber/30 bg-amber/5", label: "Concept" },
    interactive: { c: "text-emerald border-emerald/30 bg-emerald/5", label: "Interactive" },
    code: { c: "text-indigo border-indigo/30 bg-indigo/5", label: "Code" },
    lab: { c: "text-rust border-rust/30 bg-rust/5", label: "Lab" },
    venture: { c: "text-emerald border-emerald/30 bg-emerald/10", label: "Venture" },
  };
  const m = map[kind] ?? map.concept;
  return (
    <span className={`text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full border ${m.c} shrink-0`}>
      {m.label}
    </span>
  );
}
