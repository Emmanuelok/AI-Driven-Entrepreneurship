import Link from "next/link";
import { notFound } from "next/navigation";
import { PROBLEMS, getProblem } from "@/lib/problems";
import { ArrowLeft, MapPin, Users, AlertTriangle, Sparkles, Rocket, Brain, BookOpen, Building2 } from "lucide-react";
import { ConnectionsPanel } from "@/components/connections-panel";
import { ConnectionsBanner } from "@/components/connections-banner";

export function generateStaticParams() {
  return PROBLEMS.map((p) => ({ id: p.id }));
}

export default async function ProblemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = getProblem(id);
  if (!p) { notFound(); return null; }

  return (
    <div className="max-w-4xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <Link href="/studio/problems" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground transition mb-6">
        <ArrowLeft className="size-3.5" /> Back to Problem Hub
      </Link>

      <ConnectionsBanner kind="problem" id={id} title={p.title} />

      <div className="flex items-center gap-2 flex-wrap mb-4">
        <span className="text-[10px] uppercase tracking-widest text-emerald border border-emerald/40 bg-emerald/5 px-2 py-0.5 rounded-full">
          {p.sector}
        </span>
        <span className="text-[10px] uppercase tracking-widest text-amber border border-amber/40 bg-amber/5 px-2 py-0.5 rounded-full">
          Severity {p.severity}/5
        </span>
        <span className="text-xs text-muted flex items-center gap-1.5"><MapPin className="size-3" /> {p.region}</span>
      </div>

      <h1 className="font-[family-name:var(--font-display)] text-3xl sm:text-5xl font-semibold leading-tight">
        {p.title}
      </h1>

      <div className="mt-6 glass rounded-2xl p-5 flex items-start gap-4">
        <Users className="size-5 text-emerald shrink-0 mt-0.5" />
        <div>
          <div className="text-xs uppercase tracking-widest text-muted mb-1">Who's affected</div>
          <div className="text-foreground">{p.affected}</div>
        </div>
      </div>

      <section className="mt-8">
        <h2 className="text-xl font-semibold mb-3 flex items-center gap-2">
          <AlertTriangle className="size-4 text-amber" /> The problem
        </h2>
        <p className="text-foreground/90 leading-relaxed">{p.description}</p>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold mb-3 flex items-center gap-2">
          <BookOpen className="size-4 text-emerald" /> Evidence
        </h2>
        <p className="text-muted leading-relaxed italic">{p.evidence}</p>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold mb-3 flex items-center gap-2">
          <Sparkles className="size-4 text-amber" /> Where AI changes the game
        </h2>
        <p className="text-foreground/90 leading-relaxed">{p.aiAngle}</p>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <Brain className="size-4 text-emerald" /> Skills you'll need
        </h2>
        <div className="flex flex-wrap gap-2">
          {p.skillsNeeded.map((s) => (
            <span key={s} className="text-sm px-3 py-1.5 rounded-full bg-surface-2 border border-border">
              {s}
            </span>
          ))}
        </div>
      </section>

      {p.exampleVentures && (
        <section className="mt-8">
          <h2 className="text-xl font-semibold mb-3 flex items-center gap-2">
            <Building2 className="size-4 text-indigo" /> Ventures in this space
          </h2>
          <p className="text-muted text-sm">
            Existing players tackling adjacent angles (room remains for a focused wedge):
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {p.exampleVentures.map((v) => (
              <li key={v} className="text-sm px-3 py-1.5 rounded-full border border-border">
                {v}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-12 glass rounded-3xl p-7 sm:p-10 relative overflow-hidden">
        <div className="absolute -top-20 -right-20 size-72 rounded-full bg-emerald opacity-15 blur-3xl" />
        <div className="relative">
          <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold leading-tight">
            Ready to make this your venture?
          </h2>
          <p className="mt-3 text-muted max-w-xl leading-relaxed">
            Sage will scope it down with you — pick the smallest wedge you can validate in 14 days. You don&apos;t need to solve all of it. You need to solve one slice, for one person, this month.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row gap-3">
            <Link
              href="/studio/venture"
              className="bg-emerald text-black font-semibold px-6 py-3 rounded-full hover:bg-amber transition flex items-center justify-center gap-2"
            >
              <Rocket className="size-4" /> Start a venture on this problem
            </Link>
            <Link
              href="/studio/tutor"
              className="border border-border bg-surface px-6 py-3 rounded-full hover:bg-surface-2 transition flex items-center justify-center gap-2"
            >
              <Brain className="size-4" /> Discuss with Sage first
            </Link>
          </div>
        </div>
      </div>

      <div className="mt-8">
        <ConnectionsPanel kind="problem" id={id} title={p.title} />
      </div>
    </div>
  );
}
