"use client";

import Link from "next/link";
import { useStore } from "@/store";
import { getRecommendations } from "@/lib/recommendations";
import { Card, Badge, Button } from "@/components/ui";
import { GraduationCap, Sparkles, ArrowRight, Rocket, Brain, Compass, Globe2, Users, Wallet, Lightbulb } from "lucide-react";

export default function PathPage() {
  const { user, createVenture, ventures, addXp, unlockBadge } = useStore();
  if (!user) return null;
  const rec = getRecommendations(user.field);

  if (!rec.department) {
    return (
      <div className="max-w-3xl mx-auto px-5 py-20 text-center">
        <p className="text-muted mb-3">We don't have a discipline mapped to your field yet.</p>
        <Link href="/studio/settings" className="text-emerald hover:underline">Update your profile</Link>
      </div>
    );
  }

  const d = rec.department;

  function startVentureFromSeed() {
    const id = createVenture({
      name: d.suggestedVentureSeed.split(" ").slice(0, 4).join(" "),
      tagline: d.suggestedVentureSeed,
      problemId: d.relevantProblemIds?.[0],
      phase: "ideate",
      region: user?.country ?? "",
    });
    unlockBadge("first-venture");
    addXp(100, "Started a venture from your field's seed");
    window.location.href = `/studio/venture/${id}`;
  }

  return (
    <div className="max-w-7xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <div className="mb-8">
        <p className="text-xs uppercase tracking-[0.22em] text-emerald mb-2 flex items-center gap-1.5">
          <GraduationCap className="size-3.5" /> Your Path · personalized for {d.name}
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight max-w-3xl">
          A workspace built around <span className="text-emerald">your discipline</span>, not a generic curriculum.
        </h1>
        <p className="mt-3 text-muted max-w-2xl">
          What follows is filtered, sorted, and prioritized for someone studying {d.name.toLowerCase()} at {user.institution}. Everyone else's view looks different.
        </p>
      </div>

      <Card className="p-6 sm:p-8 mb-6 relative overflow-hidden bg-gradient-to-br from-emerald/10 via-transparent to-amber/10">
        <div className="absolute -top-16 -right-16 size-48 rounded-full bg-emerald opacity-20 blur-3xl" />
        <Sparkles className="size-6 text-amber mb-3 relative" />
        <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold relative">3 AI opportunities sized for {d.name.toLowerCase()}</h2>
        <div className="grid sm:grid-cols-3 gap-3 mt-5 relative">
          {d.aiOpportunities.map((o) => (
            <Card key={o.title} className="p-4 bg-surface-2/50">
              <div className="font-medium text-emerald text-sm">{o.title}</div>
              <p className="text-xs text-muted mt-2 leading-relaxed">{o.why}</p>
            </Card>
          ))}
        </div>
        {ventures.length === 0 && (
          <div className="mt-6 flex flex-wrap gap-2 items-center">
            <span className="text-sm text-muted">Try the suggested first venture:</span>
            <Button onClick={startVentureFromSeed}><Rocket className="size-4" /> {d.suggestedVentureSeed.slice(0, 70)}…</Button>
          </div>
        )}
      </Card>

      {/* Recommended tracks */}
      <Section title="Learning paths for you" icon={Compass} href="/studio/learn" hrefLabel="All tracks">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {rec.tracks.map((t) => (
            <Link key={t.id} href={`/studio/learn/${t.id}`} className="glass rounded-2xl p-5 hover:border-emerald/40 transition group">
              <span className="size-2.5 rounded-full inline-block mb-3" style={{ background: t.color }} />
              <h3 className="font-medium leading-tight">{t.title}</h3>
              <p className="text-xs text-muted mt-1.5 line-clamp-2">{t.tagline}</p>
              <div className="text-xs text-emerald mt-3 group-hover:underline">Start track →</div>
            </Link>
          ))}
        </div>
      </Section>

      {/* Recommended problems */}
      <Section title="Problems you're equipped to attack" icon={Globe2} href="/studio/problems" hrefLabel="All problems">
        <div className="grid sm:grid-cols-2 gap-3">
          {rec.problems.slice(0, 4).map((p) => (
            <Link key={p.id} href={`/studio/problems/${p.id}`} className="glass rounded-2xl p-5 hover:border-emerald/40 transition group">
              <div className="flex items-center justify-between text-[10px] uppercase tracking-widest mb-2">
                <Badge color="emerald">{p.sector}</Badge>
                <span className="text-muted">{p.region}</span>
              </div>
              <h3 className="font-medium leading-tight group-hover:text-emerald transition">{p.title}</h3>
              <p className="text-xs text-muted mt-2 line-clamp-2">{p.affected}</p>
            </Link>
          ))}
        </div>
      </Section>

      {/* Recommended agents */}
      <Section title="AI agents most valuable for your field" icon={Brain} href="/studio/agents" hrefLabel="All agents">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {rec.agents.slice(0, 6).map((a) => (
            <Link key={a.id} href={`/studio/agents/${a.id}`} className="glass rounded-2xl p-5 hover:border-emerald/40 transition group">
              <div className="text-2xl mb-2">{a.icon}</div>
              <h3 className="font-medium">{a.name}</h3>
              <p className="text-xs text-muted mt-1 line-clamp-2">{a.short}</p>
            </Link>
          ))}
        </div>
      </Section>

      {/* Mentors */}
      <Section title="Mentors who get your field" icon={Users} href="/studio/mentors" hrefLabel="All mentors">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {rec.mentors.slice(0, 6).map((m) => (
            <Link key={m.id} href={`/studio/mentors/${m.id}`} className="glass rounded-2xl p-5 hover:border-emerald/40 transition group flex items-start gap-3">
              <div className="size-12 rounded-2xl bg-gradient-to-br from-emerald to-amber flex items-center justify-center text-black font-bold shadow shrink-0">{m.initials}</div>
              <div className="min-w-0">
                <div className="font-medium truncate">{m.name}</div>
                <div className="text-xs text-muted truncate">{m.role}</div>
                <div className="text-xs text-emerald mt-1 truncate">{m.expertise.slice(0, 2).join(" · ")}</div>
              </div>
            </Link>
          ))}
        </div>
      </Section>

      {/* Funding */}
      <Section title="Funding most aligned with your sectors" icon={Wallet} href="/studio/funding" hrefLabel="All funding">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {rec.funding.slice(0, 6).map((f) => (
            <Link key={f.id} href="/studio/funding" className="glass rounded-2xl p-5 hover:border-emerald/40 transition group">
              <Badge color={f.type === "Grant" ? "emerald" : "amber"}>{f.type}</Badge>
              <h3 className="font-medium mt-2">{f.name}</h3>
              <div className="font-mono text-emerald text-sm mt-1">${(f.amountMaxUsd / 1000).toFixed(0)}k</div>
              <p className="text-xs text-muted mt-2 line-clamp-2">{f.whoFor}</p>
            </Link>
          ))}
        </div>
      </Section>

      <Card className="p-6 mt-10 bg-gradient-to-br from-amber/10 to-emerald/10">
        <div className="flex items-start gap-4">
          <Lightbulb className="size-6 text-amber shrink-0 mt-1" />
          <div>
            <h3 className="font-[family-name:var(--font-display)] text-xl font-semibold">Where you'll likely land</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {d.careerRoles.map((r) => <Badge key={r} color="emerald">{r}</Badge>)}
            </div>
            <p className="text-sm text-muted mt-3 leading-relaxed">
              Sankofa graduates from {d.name} programs typically join: the roles above. We track placements — share yours when you graduate to build the alumni-signal flywheel.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}

function Section({ title, icon: Icon, href, hrefLabel, children }: { title: string; icon: typeof Brain; href: string; hrefLabel: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <div className="flex items-end justify-between mb-4">
        <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold flex items-center gap-2">
          <Icon className="size-5 text-emerald" /> {title}
        </h2>
        <Link href={href} className="text-sm text-emerald hover:underline flex items-center gap-1">{hrefLabel} <ArrowRight className="size-3.5" /></Link>
      </div>
      {children}
    </section>
  );
}
