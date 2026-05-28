"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "@/store";
import { useMe } from "@/store/me";
import { PROBLEMS } from "@/lib/problems";
import { Card, Badge, Button } from "@/components/ui";
import { Markdown } from "@/components/markdown";
import { ShareVentureButton } from "@/components/share-venture";
import { genomeVoiceInstruction } from "@/lib/genome";
import {
  Target, Users, Wallet, Trophy, Lightbulb, Wrench, Megaphone, TrendingUp,
  CheckCircle2, Sparkles, MapPin, Calendar, ArrowRight, Brain,
  Send, FileText, Bot, Zap, Activity, ChevronRight, Compass,
} from "lucide-react";

const PHASES = [
  { id: "ideate" as const, label: "Ideate", icon: Lightbulb, color: "#f4a949", description: "Frame the problem. Pick your wedge." },
  { id: "discover" as const, label: "Discover", icon: Users, color: "#2cc295", description: "Talk to 20 real people. Find the truth." },
  { id: "mvp" as const, label: "Build MVP", icon: Wrench, color: "#6c8cff", description: "The smallest thing you can ship in a week." },
  { id: "launch" as const, label: "Launch", icon: Megaphone, color: "#d96444", description: "First 10 paying customers." },
  { id: "scale" as const, label: "Scale", icon: TrendingUp, color: "#2cc295", description: "From 10 to 1000." },
];

export default function VentureCockpit({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { ventures, updateVenture, user } = useStore();
  const { genome, recentActivity, logActivity, remember } = useMe();

  // ALL HOOKS BEFORE ANY CONDITIONAL RETURN — keeps hook order stable
  // across rehydration of zustand state.
  const [akiliBrief, setAkiliBrief] = useState<string>("");
  const [akiliBusy, setAkiliBusy] = useState(false);
  const [daysSinceStart, setDaysSinceStart] = useState(0);

  const found = ventures.find((x) => x.id === id);
  const v = found;

  useEffect(() => {
    if (!v) return;
    setDaysSinceStart(Math.floor((Date.now() - v.createdAt) / 86_400_000) || 0);
  }, [v?.createdAt]);

  useEffect(() => {
    if (!v || !user) return;
    if (akiliBrief || akiliBusy) return;
    // Inline the brief generation so v is captured non-null.
    const venture = v;
    const problemHere = venture.problemId ? PROBLEMS.find((p) => p.id === venture.problemId) : undefined;
    const days = Math.floor((Date.now() - venture.createdAt) / 86_400_000) || 0;
    const mvp = venture.mvpTasks.filter((t) => t.done).length;
    (async () => {
      setAkiliBusy(true);
      setAkiliBrief("");
      try {
        const res = await fetch("/api/coach/akili", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [{
              role: "user",
              content: `I'm working on my venture "${venture.name}" — "${venture.tagline}". Current phase: ${venture.phase}. Days in: ${days}. Interviews logged: ${venture.interviews.length}/${venture.metrics.interviewsTarget}. MVP tasks done: ${mvp}/${venture.mvpTasks.length}. MRR: $${venture.metrics.mrr}. ${problemHere ? `Problem we're solving: ${problemHere.title}.` : ""} What is the single most important move I should make in the next 48 hours, and why? Keep it to 3 short paragraphs. End with one concrete first step.`,
            }],
            context: {
              ventureName: venture.name,
              phase: venture.phase,
              interviews: venture.interviews.length,
              mrr: venture.metrics.mrr,
              genomeVoice: genomeVoiceInstruction(genome),
            },
          }),
        });
        const reader = res.body?.getReader();
        const dec = new TextDecoder();
        let acc = "";
        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            acc += dec.decode(value, { stream: true });
            setAkiliBrief(acc);
          }
        }
      } finally {
        setAkiliBusy(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v?.id, user?.id]);

  if (!found || !v) { notFound(); return null; }

  const problem = v.problemId ? PROBLEMS.find((p) => p.id === v.problemId) : undefined;
  const activePhaseIdx = PHASES.findIndex((p) => p.id === v.phase);
  const activePhase = PHASES[activePhaseIdx] ?? PHASES[0];
  const mvpDone = v.mvpTasks.filter((t) => t.done).length;
  const interviewPct = (v.interviews.length / Math.max(1, v.metrics.interviewsTarget)) * 100;

  function regenerateBrief() {
    // Trigger by clearing the brief — useEffect will refire via deps. But it also has akiliBrief guard.
    // Simpler: just call inline with current v.
    if (!v) return;
    const venture = v;
    const problemHere = venture.problemId ? PROBLEMS.find((p) => p.id === venture.problemId) : undefined;
    const days = Math.floor((Date.now() - venture.createdAt) / 86_400_000) || 0;
    const mvp = venture.mvpTasks.filter((t) => t.done).length;
    (async () => {
      setAkiliBusy(true);
      setAkiliBrief("");
      try {
        const res = await fetch("/api/coach/akili", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [{ role: "user", content: `I'm working on my venture "${venture.name}" — "${venture.tagline}". Phase: ${venture.phase}. Day ${days}. Interviews: ${venture.interviews.length}/${venture.metrics.interviewsTarget}. MVP: ${mvp}/${venture.mvpTasks.length}. MRR: $${venture.metrics.mrr}. ${problemHere ? `Problem: ${problemHere.title}.` : ""} What's the single most important move I should make in the next 48 hours? Keep to 3 short paragraphs ending with one concrete first step.` }],
            context: { ventureName: venture.name, phase: venture.phase, genomeVoice: genomeVoiceInstruction(genome) },
          }),
        });
        const reader = res.body?.getReader();
        const dec = new TextDecoder();
        let acc = "";
        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            acc += dec.decode(value, { stream: true });
            setAkiliBrief(acc);
          }
        }
      } finally {
        setAkiliBusy(false);
      }
    })();
  }

  function advancePhase() {
    if (!v) return;
    if (activePhaseIdx >= PHASES.length - 1) return;
    const next = PHASES[activePhaseIdx + 1];
    updateVenture(v.id, { phase: next.id });
    logActivity({ kind: "venture", title: `${v.name} advanced to ${next.label}` });
    remember({ fact: `Advanced ${v.name} to ${next.label} phase on ${new Date().toLocaleDateString()}`, kind: "achievement", source: "system", importance: 4 });
  }

  // Live stream — recent activity for this venture
  const ventureActivity = recentActivity(30).filter((a) =>
    (a.title.includes(v.name) || a.title.toLowerCase().includes("interview") || a.title.toLowerCase().includes("ship") || a.kind === "venture" || a.kind === "agent")
  ).slice(0, 12);

  return (
    <div className="relative overflow-hidden">
      {/* Ambient phase glow */}
      <motion.div
        animate={{ background: [`radial-gradient(60% 50% at 100% 0%, ${activePhase.color}22 0%, transparent 60%)`, `radial-gradient(60% 50% at 0% 100%, ${activePhase.color}22 0%, transparent 60%)`, `radial-gradient(60% 50% at 100% 0%, ${activePhase.color}22 0%, transparent 60%)`] }}
        transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
        className="absolute inset-0 pointer-events-none"
      />

      <div className="relative max-w-7xl mx-auto px-5 sm:px-8 py-8 sm:py-10">
        {/* Title row */}
        <div className="flex items-start justify-between flex-wrap gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 flex-wrap text-xs mb-3">
              <Badge color={v.phase === "scale" ? "amber" : v.phase === "launch" ? "emerald" : "indigo"}>{activePhase.label}</Badge>
              <span className="text-muted flex items-center gap-1.5"><Calendar className="size-3" /> Day {daysSinceStart}</span>
              {v.region && <span className="text-muted flex items-center gap-1.5"><MapPin className="size-3" /> {v.region}</span>}
              {problem && (
                <Link href={`/studio/problems/${problem.id}`} className="text-emerald hover:underline flex items-center gap-1">
                  Problem brief →
                </Link>
              )}
            </div>
            <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="font-[family-name:var(--font-display)] text-4xl sm:text-5xl font-semibold leading-tight">
              {v.name}
            </motion.h1>
            <p className="text-muted mt-1 max-w-2xl">{v.tagline}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <ShareVentureButton venture={v} />
            <Link
              href={`/studio/venture/${v.id}/coach`}
              className="flex items-center gap-2 bg-amber text-black font-medium px-5 py-3 rounded-full hover:bg-emerald transition shadow-lg shadow-amber/30"
            >
              <Brain className="size-4" /> Talk with Akili
            </Link>
          </div>
        </div>

        {/* Phase journey */}
        <div className="mb-8">
          <div className="grid grid-cols-5 gap-2 relative">
            {/* Connecting line */}
            <div className="absolute top-7 left-[8%] right-[8%] h-0.5 bg-border" />
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${(activePhaseIdx / (PHASES.length - 1)) * 84}%` }}
              transition={{ duration: 1, ease: "easeOut" }}
              className="absolute top-7 left-[8%] h-0.5"
              style={{ background: `linear-gradient(90deg, ${PHASES[0].color}, ${activePhase.color})` }}
            />
            {PHASES.map((p, i) => {
              const done = i < activePhaseIdx;
              const active = i === activePhaseIdx;
              return (
                <button
                  key={p.id}
                  onClick={() => updateVenture(v.id, { phase: p.id })}
                  className="flex flex-col items-center text-center relative z-10 group"
                >
                  <motion.div
                    initial={false}
                    animate={{
                      scale: active ? 1.1 : 1,
                      boxShadow: active ? `0 0 24px ${p.color}66` : "0 0 0 rgba(0,0,0,0)",
                    }}
                    transition={{ duration: 0.5 }}
                    className={`size-14 rounded-full flex items-center justify-center border-2 transition cursor-pointer ${
                      done ? "bg-emerald border-emerald text-black" : active ? "bg-amber border-amber text-black" : "bg-surface border-border text-muted group-hover:border-muted"
                    }`}
                    style={active ? { background: p.color, borderColor: p.color, color: "#000" } : {}}
                  >
                    {done ? <CheckCircle2 className="size-5" /> : <p.icon className="size-5" />}
                  </motion.div>
                  <div className={`mt-3 text-xs sm:text-sm font-medium transition ${done || active ? "text-foreground" : "text-muted"}`}>{p.label}</div>
                  <div className="hidden sm:block text-[10px] text-muted mt-1 max-w-[120px] leading-snug">{p.description}</div>
                </button>
              );
            })}
          </div>
          {activePhaseIdx < PHASES.length - 1 && (
            <div className="mt-5 text-center">
              <Button variant="secondary" size="sm" onClick={advancePhase}>
                Move to {PHASES[activePhaseIdx + 1].label} <ChevronRight className="size-3.5" />
              </Button>
            </div>
          )}
        </div>

        {/* Akili's "right now" brief */}
        <Card className="p-6 sm:p-8 mb-6 relative overflow-hidden bg-gradient-to-br from-amber/10 via-transparent to-emerald/10 border-amber/30">
          <div className="absolute -top-16 -right-16 size-48 rounded-full bg-amber/30 blur-3xl" />
          <div className="relative">
            <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-amber">
                <Brain className="size-3.5" /> Akili · what to do right now
              </div>
              <button onClick={regenerateBrief} disabled={akiliBusy} className="text-xs text-muted hover:text-foreground transition flex items-center gap-1">
                <Sparkles className={`size-3 ${akiliBusy ? "animate-pulse" : ""}`} /> {akiliBusy ? "Thinking…" : "Re-think"}
              </button>
            </div>
            {akiliBrief ? (
              <div className="prose-chat text-foreground/95 leading-relaxed">
                <Markdown src={akiliBrief} />
              </div>
            ) : akiliBusy ? (
              <p className="text-sm text-muted italic">Akili is reading your state and deciding your next move…</p>
            ) : (
              <p className="text-sm text-muted italic">Tap Re-think for Akili&apos;s read.</p>
            )}
          </div>
        </Card>

        {/* Vitals */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <VitalCard
            icon={Users}
            label="Discovery"
            primary={`${v.interviews.length} / ${v.metrics.interviewsTarget}`}
            sub={`${Math.round(interviewPct)}% to target`}
            color="emerald"
            pct={interviewPct}
            href={`/studio/venture/${v.id}/discover`}
          />
          <VitalCard
            icon={Wrench}
            label="MVP tasks"
            primary={`${mvpDone} / ${v.mvpTasks.length || 0}`}
            sub={`${v.mvpTasks.length ? Math.round((mvpDone / v.mvpTasks.length) * 100) : 0}% shipped`}
            color="amber"
            pct={v.mvpTasks.length ? (mvpDone / v.mvpTasks.length) * 100 : 0}
            href={`/studio/venture/${v.id}/mvp`}
          />
          <VitalCard
            icon={Wallet}
            label="MRR"
            primary={`$${v.metrics.mrr.toLocaleString()}`}
            sub={`${v.metrics.customers} customers`}
            color="emerald"
            pct={Math.min(100, (v.metrics.mrr / 5000) * 100)}
            href={`/studio/venture/${v.id}/growth`}
          />
          <VitalCard
            icon={Target}
            label="Funding"
            primary={`$${(v.fundingRaised / 1000).toFixed(0)}k`}
            sub={`of ${(v.fundingTarget / 1000).toFixed(0)}k goal`}
            color="rust"
            pct={(v.fundingRaised / v.fundingTarget) * 100}
            href={`/studio/venture/${v.id}/fundraise`}
          />
        </div>

        {/* Phase-specific quick wins */}
        <div className="grid lg:grid-cols-[1fr_320px] gap-5">
          <div>
            <h3 className="text-xs uppercase tracking-[0.25em] text-emerald mb-4">Right now in {activePhase.label}</h3>
            <div className="grid sm:grid-cols-2 gap-3">
              {phaseActions(v, activePhase.id).map((a) => (
                <Link
                  key={a.label}
                  href={a.href}
                  className="glass rounded-2xl p-5 hover:border-emerald/40 transition group flex flex-col gap-3"
                >
                  <a.icon className="size-5 text-emerald" />
                  <div>
                    <div className="font-medium flex items-center gap-1.5">{a.label}<ArrowRight className="size-3.5 opacity-0 group-hover:opacity-100 transition" /></div>
                    <div className="text-xs text-muted mt-1 leading-relaxed">{a.desc}</div>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* Live activity stream */}
          <aside>
            <h3 className="text-xs uppercase tracking-[0.25em] text-amber mb-4 flex items-center gap-2">
              <Activity className="size-3.5" /> Mission log
            </h3>
            <Card className="p-4 max-h-[480px] overflow-y-auto">
              {ventureActivity.length === 0 ? (
                <p className="text-xs text-muted italic">No activity yet. As you work, each action appears here in real time.</p>
              ) : (
                <ol className="space-y-3">
                  <AnimatePresence>
                    {ventureActivity.map((a, i) => (
                      <motion.li
                        key={a.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.4, delay: i * 0.03 }}
                        className="flex gap-3 text-xs"
                      >
                        <span className="size-1.5 rounded-full bg-emerald mt-1.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-foreground leading-snug truncate">{a.title}</div>
                          <div className="text-muted text-[10px] mt-0.5">{new Date(a.ts).toLocaleString("en-US", { hour: "numeric", minute: "2-digit", weekday: "short" })}</div>
                        </div>
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ol>
              )}
            </Card>
          </aside>
        </div>

        {/* Team & achievements */}
        {(v.team.length > 0 || v.achievements.length > 0) && (
          <div className="grid lg:grid-cols-2 gap-4 mt-8">
            {v.team.length > 0 && (
              <Card className="p-6">
                <h3 className="text-xs uppercase tracking-[0.25em] text-emerald mb-4 flex items-center gap-2">
                  <Users className="size-3.5" /> Team
                </h3>
                <div className="grid sm:grid-cols-2 gap-3">
                  {v.team.map((t) => (
                    <div key={t.name} className="flex items-center gap-3 p-3 rounded-xl border border-border bg-surface-2/50">
                      <div className="size-9 rounded-full bg-gradient-to-br from-emerald to-amber flex items-center justify-center text-black font-semibold text-sm">{t.name[0]}</div>
                      <div className="leading-tight min-w-0">
                        <div className="font-medium text-sm truncate">{t.name}</div>
                        <div className="text-xs text-muted truncate">{t.role}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
            {v.achievements.length > 0 && (
              <Card className="p-6">
                <h3 className="text-xs uppercase tracking-[0.25em] text-amber mb-4 flex items-center gap-2">
                  <Trophy className="size-3.5" /> Achievements
                </h3>
                <div className="flex flex-wrap gap-2">
                  {v.achievements.map((a) => (
                    <span key={a} className="text-sm px-3 py-1.5 rounded-full bg-emerald/10 border border-emerald/30 text-emerald">{a}</span>
                  ))}
                </div>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function VitalCard({ icon: Icon, label, primary, sub, color, pct, href }: { icon: typeof Users; label: string; primary: string; sub: string; color: string; pct: number; href: string }) {
  return (
    <Link href={href} className="glass rounded-2xl p-5 hover:border-emerald/40 transition group block">
      <div className="flex items-center justify-between mb-3">
        <Icon className={`size-4 text-${color}`} />
        <ArrowRight className="size-3.5 text-muted opacity-0 group-hover:opacity-100 transition" />
      </div>
      <div className="font-[family-name:var(--font-display)] text-3xl font-semibold" style={{ color: `var(--color-${color}, var(--emerald))` }}>{primary}</div>
      <div className="text-[10px] uppercase tracking-widest text-muted mt-1">{label}</div>
      <div className="text-xs text-muted mt-2 mb-2">{sub}</div>
      <div className="h-1 bg-surface-2 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, pct)}%`, background: `var(--color-${color}, var(--emerald))` }} />
      </div>
    </Link>
  );
}

function phaseActions(v: { id: string }, phase: "ideate" | "discover" | "mvp" | "launch" | "scale") {
  const id = v.id;
  if (phase === "ideate") return [
    { label: "Sharpen the lean canvas", desc: "Fill the 9 blocks with what you actually believe.", icon: Lightbulb, href: `/studio/venture/${id}/ideate` },
    { label: "Generate market research", desc: "TAM / SAM / SOM with citations in 20 seconds.", icon: Bot, href: `/studio/agents/market-sizing` },
    { label: "Open a Sketch board", desc: "Get your problem out of your head and onto a canvas.", icon: Compass, href: `/studio/brainstorm` },
    { label: "Run Ship Hour for this", desc: "60 minutes from idea to shippable LOI.", icon: Zap, href: `/studio/ship` },
  ];
  if (phase === "discover") return [
    { label: "Log an interview", desc: "Each one moves you closer to the truth.", icon: Users, href: `/studio/venture/${id}/discover` },
    { label: "Generate a discovery script", desc: "12 questions, Bob Moesta style.", icon: FileText, href: `/studio/agents/interview-synthesizer` },
    { label: "Synthesize what you've heard", desc: "Cluster the patterns across your interviews.", icon: Sparkles, href: `/studio/agents/interview-synthesizer` },
    { label: "Book a mentor", desc: "Test your discovery thinking with an operator.", icon: Brain, href: `/studio/mentors` },
  ];
  if (phase === "mvp") return [
    { label: "Move tasks on the MVP board", desc: "Smallest possible — ship in a week.", icon: Wrench, href: `/studio/venture/${id}/mvp` },
    { label: "Generate a pricing page", desc: "Three tiers + FAQ + CTA.", icon: FileText, href: `/studio/ship` },
    { label: "Open Practice Lab", desc: "Build, debug, test in-browser.", icon: Bot, href: `/studio/lab` },
    { label: "Ask Akili to scope it smaller", desc: "If MVP is more than 7 days, it's too big.", icon: Brain, href: `/studio/venture/${id}/coach` },
  ];
  if (phase === "launch") return [
    { label: "Ship the one-pager", desc: "Public launch + WhatsApp blurb.", icon: Megaphone, href: `/studio/venture/${id}/launch` },
    { label: "Build the pitch", desc: "12-slide Sequoia narrative.", icon: FileText, href: `/studio/venture/${id}/pitch` },
    { label: "Open the investor CRM", desc: "Pipeline from intro to closed.", icon: Wallet, href: `/studio/venture/${id}/fundraise` },
    { label: "Update your metrics", desc: "First sale moves everything.", icon: TrendingUp, href: `/studio/venture/${id}/growth` },
  ];
  return [
    { label: "Set this quarter's OKRs", desc: "Objective + 3-5 numeric KRs.", icon: Target, href: `/studio/venture/${id}/okrs` },
    { label: "Tighten unit economics", desc: "LTV/CAC ≥ 3. Payback &lt; 12 mo.", icon: TrendingUp, href: `/studio/venture/${id}/growth` },
    { label: "Close the data room", desc: "Diligence pauses kill deals.", icon: Sparkles, href: `/studio/venture/${id}/dataroom` },
    { label: "Send the monthly update", desc: "Investors fund founders who write.", icon: Send, href: `/studio/venture/${id}/launch` },
  ];
}
