"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "@/store";
import { useMe } from "@/store/me";
import { SEED_DECKS } from "@/lib/srs-seed";
import { SCHOOLS, getDepartment } from "@/lib/disciplines";
import { GENOME_QUESTIONS, computeGenome } from "@/lib/genome";
import { Sparkles, ArrowRight, ArrowLeft, Brain, Building2, GraduationCap, Globe2, Heart } from "lucide-react";

const COUNTRIES = ["Ghana", "Nigeria", "Kenya", "South Africa", "Uganda", "Tanzania", "Ethiopia", "Rwanda", "Senegal", "Côte d'Ivoire", "Egypt", "Morocco", "Other"];
const LANGUAGES = ["English", "Pidgin", "Twi", "Yoruba", "Hausa", "Swahili", "Amharic", "French", "Wolof", "Zulu", "Arabic"];

type Form = {
  name: string;
  email: string;
  institution: string;
  schoolId: string;
  departmentId: string;
  programId: string;
  year: 1 | 2 | 3 | 4 | 5;
  country: string;
  primaryLanguage: string;
  genomeAnswers: Record<string, string>;
};

export default function OnboardingPage() {
  const router = useRouter();
  const { signIn, addDeck, addCard, createVenture, notify } = useStore();
  const { setGenome, remember } = useMe();
  const [stage, setStage] = useState<"hello" | "identity" | "place" | "school" | "department" | "program" | "genome" | "weaving" | "ready">("hello");
  const [form, setForm] = useState<Form>({
    name: "", email: "", institution: "",
    schoolId: "", departmentId: "", programId: "",
    year: 2, country: "Ghana", primaryLanguage: "English",
    genomeAnswers: {},
  });
  const [genomeQIdx, setGenomeQIdx] = useState(0);

  function finish() {
    const ctx = form.departmentId ? getDepartment(form.departmentId) : null;
    const fieldName = ctx ? `${ctx.department.name} (${ctx.school.name})` : "General";

    signIn({
      name: form.name, email: form.email, institution: form.institution,
      program: form.programId || (ctx?.department.name ?? ""),
      year: form.year, country: form.country, primaryLanguage: form.primaryLanguage,
      field: fieldName,
    });

    const genome = computeGenome(form.genomeAnswers);
    setGenome(genome);

    SEED_DECKS.forEach((d) => {
      const id = addDeck({ name: d.name, description: d.description });
      d.cards.forEach((c) => addCard({ deckId: id, front: c.front, back: c.back }));
    });

    createVenture({
      name: "KubaCold",
      tagline: ctx?.department.suggestedVentureSeed ?? "Solar microcold-storage for tomato co-ops in Northern Ghana",
      problemId: ctx?.department.relevantProblemIds?.[0] ?? "post-harvest-loss",
      phase: "discover",
      region: form.country,
      metrics: { interviewsTarget: 20, revenue: 0, customers: 0, mrr: 0 },
      mvpTasks: [],
      team: [{ name: form.name, role: "Co-founder, CEO" }],
      interviews: [],
      canvas: {},
      fundingTarget: 50_000, fundingRaised: 0,
      achievements: [],
    });

    remember({ fact: `Studies ${fieldName}; from ${form.country}; speaks ${form.primaryLanguage}.`, kind: "context", source: "explicit", importance: 5 });
    remember({ fact: `Genome totem: ${genome.totem}, motivation: ${genome.motivation}, primary fear: ${genome.primaryFear}.`, kind: "preference", source: "explicit", importance: 5 });
    notify({ title: `Akwaaba, ${form.name.split(" ")[0]}`, body: `Your studio is tuned to ${fieldName}.` });

    router.push("/studio");
  }

  return (
    <div className="min-h-screen flex items-center justify-center overflow-hidden relative px-5 py-10">
      <BG />
      <AnimatePresence mode="wait">
        {stage === "hello" && <Hello key="hello" onNext={() => setStage("identity")} />}
        {stage === "identity" && <Identity key="identity" form={form} setForm={setForm} onNext={() => setStage("place")} onBack={() => setStage("hello")} />}
        {stage === "place" && <Place key="place" form={form} setForm={setForm} onNext={() => setStage("school")} onBack={() => setStage("identity")} />}
        {stage === "school" && <School key="school" form={form} setForm={setForm} onNext={() => setStage("department")} onBack={() => setStage("place")} />}
        {stage === "department" && <Department key="department" form={form} setForm={setForm} onNext={() => setStage("program")} onBack={() => setStage("school")} />}
        {stage === "program" && <Program key="program" form={form} setForm={setForm} onNext={() => setStage("genome")} onBack={() => setStage("department")} />}
        {stage === "genome" && (
          <Genome
            key={`genome-${genomeQIdx}`}
            qIdx={genomeQIdx}
            answers={form.genomeAnswers}
            onPick={(qid, optIdx) => {
              setForm((f) => ({ ...f, genomeAnswers: { ...f.genomeAnswers, [qid]: optIdx } }));
              if (genomeQIdx < GENOME_QUESTIONS.length - 1) setTimeout(() => setGenomeQIdx(genomeQIdx + 1), 350);
              else setTimeout(() => setStage("weaving"), 500);
            }}
            onBack={() => { if (genomeQIdx === 0) setStage("program"); else setGenomeQIdx(genomeQIdx - 1); }}
          />
        )}
        {stage === "weaving" && <Weaving key="weaving" form={form} onDone={() => setStage("ready")} />}
        {stage === "ready" && <Ready key="ready" form={form} onEnter={finish} />}
      </AnimatePresence>
    </div>
  );
}

/* ─── Helpers ─── */

function BG() {
  return (
    <>
      <div className="absolute inset-0 grid-paper opacity-25 pointer-events-none" />
      <div className="absolute -top-32 -right-32 size-[28rem] rounded-full bg-emerald/15 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -left-32 size-[28rem] rounded-full bg-amber/15 blur-3xl pointer-events-none" />
    </>
  );
}

function StageShell({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="relative w-full max-w-2xl"
    >
      {children}
    </motion.div>
  );
}

function SageBubble({ text }: { text: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.6, delay: 0.2 }}
      className="flex items-start gap-3 mb-8"
    >
      <div className="size-10 rounded-2xl bg-gradient-to-br from-emerald to-emerald-deep flex items-center justify-center shrink-0 shadow-lg shadow-emerald/20">
        <Brain className="size-5 text-black" />
      </div>
      <div className="flex-1 glass rounded-2xl rounded-tl-sm px-5 py-3 text-sm leading-relaxed">{text}</div>
    </motion.div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs uppercase tracking-widest text-muted mb-1.5">{label}</div>
      {children}
    </label>
  );
}

function Nav({ onBack, onNext, canNext, nextLabel = "Continue" }: { onBack?: () => void; onNext: () => void; canNext: boolean; nextLabel?: string }) {
  return (
    <div className="mt-8 flex items-center justify-between">
      {onBack ? (
        <button onClick={onBack} className="text-sm text-muted hover:text-foreground flex items-center gap-1.5 transition"><ArrowLeft className="size-3.5" /> Back</button>
      ) : <span />}
      <button onClick={onNext} disabled={!canNext} className="bg-emerald text-black font-medium px-6 py-3 rounded-full hover:bg-amber disabled:opacity-30 disabled:cursor-not-allowed transition flex items-center gap-2">
        {nextLabel} <ArrowRight className="size-4" />
      </button>
    </div>
  );
}

/* ─── Stage 1: HELLO ─── */
function Hello({ onNext }: { onNext: () => void }) {
  return (
    <StageShell>
      <div className="text-center">
        <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.8 }} className="size-16 rounded-2xl bg-gradient-to-br from-emerald to-amber mx-auto flex items-center justify-center text-black font-bold text-2xl shadow-2xl shadow-emerald/30 mb-7">
          <span className="font-[family-name:var(--font-display)]">S</span>
        </motion.div>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.3 }} className="text-[10px] uppercase tracking-[0.4em] text-emerald mb-3">Akwaaba</motion.div>
        <motion.h1 initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.5 }} className="font-[family-name:var(--font-display)] text-4xl sm:text-6xl font-semibold leading-[1.05] tracking-tight">
          Before we begin, <span className="text-emerald italic">may I know you</span>?
        </motion.h1>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 1 }} className="mt-6 text-lg text-muted max-w-md mx-auto leading-relaxed">
          Three minutes. Seven questions. The studio will shape itself around your answers — your voice, your discipline, your fears, your story.
        </motion.p>
        <motion.button
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 1.4 }}
          onClick={onNext}
          className="mt-10 bg-emerald text-black font-semibold px-8 py-4 rounded-full hover:bg-amber transition inline-flex items-center gap-2 text-base shadow-2xl shadow-emerald/30"
        >
          Begin <ArrowRight className="size-4" />
        </motion.button>
      </div>
    </StageShell>
  );
}

/* ─── Stage 2: IDENTITY ─── */
function Identity({ form, setForm, onNext, onBack }: { form: Form; setForm: (f: Form) => void; onNext: () => void; onBack: () => void }) {
  const nameOk = form.name.trim().length > 1;
  const emailOk = form.email.trim().length === 0 || form.email.includes("@");
  return (
    <StageShell>
      <SageBubble text="What should I call you? Email is optional — only useful if you want to reach future-you on another device." />
      <div className="glass rounded-2xl p-7 space-y-5">
        <Field label="Your name"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ama Mensah" className="bg-surface-2 border border-border rounded-xl px-4 py-3 text-base outline-none focus:border-emerald w-full" /></Field>
        <Field label="Email (optional)"><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@example.com — or leave blank" className="bg-surface-2 border border-border rounded-xl px-4 py-3 text-base outline-none focus:border-emerald w-full" /></Field>
        {form.email.trim().length > 0 && !emailOk && (
          <p className="text-xs text-amber italic">That doesn&apos;t look like an email yet. Add an @ — or clear the field to skip.</p>
        )}
        {!nameOk && form.name.trim().length > 0 && (
          <p className="text-xs text-amber italic">Just need at least two letters.</p>
        )}
      </div>
      <Nav onBack={onBack} onNext={onNext} canNext={nameOk && emailOk} />
    </StageShell>
  );
}

/* ─── Stage 3: PLACE ─── */
function Place({ form, setForm, onNext, onBack }: { form: Form; setForm: (f: Form) => void; onNext: () => void; onBack: () => void }) {
  return (
    <StageShell>
      <SageBubble text={`${form.name.split(" ")[0]} — where in the world is your story rooted?`} />
      <div className="glass rounded-2xl p-7 space-y-5">
        <Field label="Institution"><input value={form.institution} onChange={(e) => setForm({ ...form, institution: e.target.value })} placeholder="KNUST / UG / UNILAG / UCT / Makerere" className="bg-surface-2 border border-border rounded-xl px-4 py-3 outline-none focus:border-emerald w-full" /></Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Country"><select value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} className="bg-surface-2 border border-border rounded-xl px-3 py-3 text-sm outline-none focus:border-emerald w-full">{COUNTRIES.map((c) => <option key={c} value={c} className="bg-surface">{c}</option>)}</select></Field>
          <Field label="Year"><select value={String(form.year)} onChange={(e) => setForm({ ...form, year: parseInt(e.target.value) as 1 | 2 | 3 | 4 | 5 })} className="bg-surface-2 border border-border rounded-xl px-3 py-3 text-sm outline-none focus:border-emerald w-full">{["1", "2", "3", "4", "5"].map((y) => <option key={y} value={y} className="bg-surface">{y}</option>)}</select></Field>
          <Field label="Language"><select value={form.primaryLanguage} onChange={(e) => setForm({ ...form, primaryLanguage: e.target.value })} className="bg-surface-2 border border-border rounded-xl px-3 py-3 text-sm outline-none focus:border-emerald w-full">{LANGUAGES.map((l) => <option key={l} value={l} className="bg-surface">{l}</option>)}</select></Field>
        </div>
      </div>
      <Nav onBack={onBack} onNext={onNext} canNext={form.institution.trim().length > 1} />
    </StageShell>
  );
}

/* ─── Stage 4: SCHOOL ─── */
function School({ form, setForm, onNext, onBack }: { form: Form; setForm: (f: Form) => void; onNext: () => void; onBack: () => void }) {
  return (
    <StageShell>
      <SageBubble text="Which school within your university? This is where I'll find your wedge." />
      <div className="grid sm:grid-cols-2 gap-2">
        {SCHOOLS.map((s) => (
          <button key={s.id} onClick={() => setForm({ ...form, schoolId: s.id, departmentId: "", programId: "" })} className={`flex items-center gap-3 p-4 rounded-xl border transition text-left ${form.schoolId === s.id ? "border-emerald bg-emerald/10" : "border-border hover:border-muted hover:bg-surface-2"}`}>
            <div className="text-2xl">{s.icon}</div>
            <div>
              <div className="font-medium text-sm">{s.name}</div>
              <div className="text-[11px] text-muted">{s.departments.length} departments</div>
            </div>
          </button>
        ))}
      </div>
      <Nav onBack={onBack} onNext={onNext} canNext={!!form.schoolId} />
    </StageShell>
  );
}

/* ─── Stage 5: DEPARTMENT ─── */
function Department({ form, setForm, onNext, onBack }: { form: Form; setForm: (f: Form) => void; onNext: () => void; onBack: () => void }) {
  const school = SCHOOLS.find((s) => s.id === form.schoolId);
  if (!school) return null;
  return (
    <StageShell>
      <SageBubble text={`Inside ${school.name}, which department holds your craft?`} />
      <div className="grid sm:grid-cols-2 gap-2">
        {school.departments.map((d) => (
          <button key={d.id} onClick={() => setForm({ ...form, departmentId: d.id, programId: "" })} className={`p-4 rounded-xl border transition text-left ${form.departmentId === d.id ? "border-emerald bg-emerald/10" : "border-border hover:border-muted hover:bg-surface-2"}`}>
            <div className="font-medium text-sm">{d.name}</div>
            <div className="text-[11px] text-muted mt-1">{d.programs.length} programs · {d.relevantSectors.join(", ")}</div>
          </button>
        ))}
      </div>
      <Nav onBack={onBack} onNext={onNext} canNext={!!form.departmentId} />
    </StageShell>
  );
}

/* ─── Stage 6: PROGRAM ─── */
function Program({ form, setForm, onNext, onBack }: { form: Form; setForm: (f: Form) => void; onNext: () => void; onBack: () => void }) {
  const ctx = form.departmentId ? getDepartment(form.departmentId) : null;
  if (!ctx) return null;
  return (
    <StageShell>
      <SageBubble text={`Last one before we get personal. Which exact program?`} />
      <div className="space-y-2">
        {ctx.department.programs.map((p) => (
          <button key={p.id} onClick={() => setForm({ ...form, programId: p.id })} className={`block w-full text-left p-4 rounded-xl border transition flex items-center justify-between ${form.programId === p.id ? "border-emerald bg-emerald/10" : "border-border hover:border-muted hover:bg-surface-2"}`}>
            <div className="font-medium text-sm">{p.name}</div>
            <span className="text-[10px] uppercase tracking-widest text-muted border border-border bg-surface-2 px-2 py-0.5 rounded-full">{p.level}</span>
          </button>
        ))}
      </div>
      <Nav onBack={onBack} onNext={onNext} canNext={!!form.programId} />
    </StageShell>
  );
}

/* ─── Stage 7: GENOME (one question at a time, cinematic) ─── */
function Genome({ qIdx, answers, onPick, onBack }: { qIdx: number; answers: Record<string, string>; onPick: (qid: string, idx: string) => void; onBack: () => void }) {
  const q = GENOME_QUESTIONS[qIdx];
  const total = GENOME_QUESTIONS.length;
  return (
    <StageShell>
      <div className="text-center mb-6">
        <div className="text-[10px] uppercase tracking-[0.3em] text-amber">A few personal questions · {qIdx + 1} of {total}</div>
        <div className="mt-3 flex justify-center gap-1">
          {GENOME_QUESTIONS.map((_, i) => (<div key={i} className={`h-1 rounded-full transition-all ${i < qIdx ? "w-4 bg-emerald" : i === qIdx ? "w-8 bg-amber" : "w-2 bg-border"}`} />))}
        </div>
      </div>
      <motion.h2
        key={q.id}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="font-[family-name:var(--font-display)] text-2xl sm:text-3xl font-semibold text-center max-w-xl mx-auto leading-tight mb-8"
      >
        {q.prompt}
      </motion.h2>
      <div className="space-y-2.5">
        {q.options.map((opt, i) => (
          <motion.button
            key={i}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.05 * i }}
            onClick={() => onPick(q.id, String(i))}
            className="block w-full text-left p-4 rounded-2xl border border-border bg-surface hover:border-emerald hover:bg-surface-2 transition group"
          >
            <div className="flex items-center gap-3">
              <div className="size-7 rounded-full border border-border group-hover:border-emerald flex items-center justify-center font-mono text-xs text-muted group-hover:text-emerald transition">{String.fromCharCode(65 + i)}</div>
              <span className="text-sm">{opt.label}</span>
            </div>
          </motion.button>
        ))}
      </div>
      <div className="mt-6 text-center">
        <button onClick={onBack} className="text-xs text-muted hover:text-foreground flex items-center gap-1 mx-auto"><ArrowLeft className="size-3" /> {qIdx === 0 ? "Back to program" : "Previous question"}</button>
      </div>
    </StageShell>
  );
}

/* ─── Stage 8: WEAVING (auto-advance with progress narration) ─── */
function Weaving({ form, onDone }: { form: Form; onDone: () => void }) {
  const STEPS = [
    "Reading your answers…",
    "Tuning Sage's voice to yours…",
    `Loading problems that matter to ${form.country}…`,
    "Pairing you with the right mentors…",
    "Seeding your spaced-repetition decks…",
    "Drafting your first venture seed…",
    "Done.",
  ];
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (idx >= STEPS.length - 1) {
      const t = setTimeout(onDone, 700);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setIdx(idx + 1), 700);
    return () => clearTimeout(t);
  }, [idx]);
  return (
    <StageShell>
      <div className="text-center">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 8, repeat: Infinity, ease: "linear" }} className="size-20 mx-auto rounded-full border-4 border-emerald/30 border-t-emerald mb-7" />
        <div className="text-[10px] uppercase tracking-[0.4em] text-emerald mb-3">Weaving your studio</div>
        <motion.h2 initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="font-[family-name:var(--font-display)] text-3xl sm:text-5xl font-semibold leading-tight">
          A few seconds.<br />The studio is becoming yours.
        </motion.h2>
        <div className="mt-8 max-w-md mx-auto space-y-2">
          {STEPS.slice(0, idx + 1).map((s, i) => (
            <motion.div key={s} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4 }} className="text-sm text-muted flex items-center gap-2">
              {i < idx ? <span className="text-emerald">✓</span> : <span className="size-3 rounded-full border-2 border-emerald/40 border-t-emerald animate-spin inline-block" />}
              {s}
            </motion.div>
          ))}
        </div>
      </div>
    </StageShell>
  );
}

/* ─── Stage 9: READY ─── */
function Ready({ form, onEnter }: { form: Form; onEnter: () => void }) {
  const ctx = form.departmentId ? getDepartment(form.departmentId) : null;
  return (
    <StageShell>
      <div className="text-center">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ duration: 0.7, type: "spring" }} className="size-24 mx-auto rounded-full bg-gradient-to-br from-emerald to-amber flex items-center justify-center shadow-2xl shadow-emerald/40 mb-7">
          <Sparkles className="size-10 text-black" />
        </motion.div>
        <div className="text-[10px] uppercase tracking-[0.4em] text-emerald mb-3">Your studio is ready</div>
        <h2 className="font-[family-name:var(--font-display)] text-4xl sm:text-5xl font-semibold leading-tight">
          Welcome to <span className="text-emerald italic">your</span> Sankofa, {form.name.split(" ")[0]}.
        </h2>
        {ctx && (
          <p className="mt-6 text-base text-muted max-w-md mx-auto">
            Tuned for <span className="text-foreground">{ctx.department.name}</span>. Sage is listening. Your first venture seed is ready in the studio.
          </p>
        )}
        <button onClick={onEnter} className="mt-9 bg-emerald text-black font-semibold px-8 py-4 rounded-full hover:bg-amber transition flex items-center gap-2 text-base shadow-2xl shadow-emerald/40 mx-auto">
          Cross the threshold <ArrowRight className="size-5" />
        </button>
      </div>
    </StageShell>
  );
}
