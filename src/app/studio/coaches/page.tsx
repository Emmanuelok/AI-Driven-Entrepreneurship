import Link from "next/link";
import { COACHES } from "@/lib/coaches";
import { ArrowRight, Brain, Sparkles } from "lucide-react";

export default function CoachesPage() {
  return (
    <div className="max-w-6xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <div className="mb-10">
        <p className="text-xs uppercase tracking-[0.22em] text-emerald mb-2">AI Coaches</p>
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight max-w-2xl">
          Five specialized AI minds. One council in your pocket.
        </h1>
        <p className="mt-3 text-muted max-w-2xl">
          Each coach is a distinct Claude-powered persona with their own teaching style and area of mastery. Pick the one who fits the moment.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Object.values(COACHES).map((c) => (
          <Link
            key={c.id}
            href={`/studio/coaches/${c.id}`}
            className="glass rounded-3xl p-7 hover:border-emerald/40 transition group relative overflow-hidden"
          >
            <div className={`absolute -top-12 -right-12 size-40 rounded-full bg-${c.color} opacity-10 blur-3xl group-hover:opacity-25 transition`} />
            <div className={`size-12 rounded-2xl bg-gradient-to-br from-${c.color} to-${c.color === "emerald" ? "emerald-deep" : c.color === "amber" ? "amber-deep" : c.color} flex items-center justify-center mb-5 shadow-lg shadow-${c.color}/20`}>
              <Brain className="size-5 text-black" />
            </div>
            <h3 className="font-[family-name:var(--font-display)] text-2xl font-semibold">{c.name}</h3>
            <div className="text-xs uppercase tracking-widest text-muted mt-1">{c.role}</div>
            <p className="mt-3 text-muted leading-relaxed text-sm">{c.intro}</p>
            <div className="mt-6 flex items-center gap-1.5 text-sm text-emerald">
              Talk to {c.name} <ArrowRight className="size-4 group-hover:translate-x-1 transition" />
            </div>
          </Link>
        ))}
        <div className="glass rounded-3xl p-7 border-dashed">
          <Sparkles className="size-6 text-amber mb-4" />
          <h3 className="font-[family-name:var(--font-display)] text-2xl font-semibold">Custom coach</h3>
          <p className="mt-3 text-muted text-sm leading-relaxed">
            Coming soon — train a personalized AI coach on your venture data, codebase, and customer interviews.
          </p>
        </div>
      </div>
    </div>
  );
}
