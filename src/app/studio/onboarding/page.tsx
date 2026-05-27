"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, ArrowRight, ArrowLeft, GraduationCap, Building2 } from "lucide-react";
import { useStore } from "@/store";
import { Button, Input, Card, Badge } from "@/components/ui";
import { SEED_DECKS } from "@/lib/srs-seed";
import { SCHOOLS, getDepartment } from "@/lib/disciplines";

const COUNTRIES = ["Ghana", "Nigeria", "Kenya", "South Africa", "Uganda", "Tanzania", "Ethiopia", "Rwanda", "Senegal", "Côte d'Ivoire", "Egypt", "Morocco", "Other"];
const LANGUAGES = ["English", "Pidgin", "Twi", "Yoruba", "Hausa", "Swahili", "Amharic", "French", "Wolof", "Zulu", "Arabic"];

type Form = {
  name: string; email: string; institution: string;
  schoolId: string; departmentId: string; programId: string;
  year: 1 | 2 | 3 | 4 | 5; country: string; primaryLanguage: string;
};

export default function OnboardingPage() {
  const router = useRouter();
  const { signIn, addDeck, addCard, createVenture, notify, updateUser } = useStore();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Form>({
    name: "", email: "", institution: "",
    schoolId: "", departmentId: "", programId: "",
    year: 2, country: "Ghana", primaryLanguage: "English",
  });

  const steps = ["Welcome", "Who are you", "Where you're studying", "Your school/college", "Your department", "Your program", "All set"];

  function next() { if (step < steps.length - 1) setStep(step + 1); else finish(); }
  function back() { if (step > 0) setStep(step - 1); }

  function finish() {
    const ctx = form.departmentId ? getDepartment(form.departmentId) : null;
    const fieldName = ctx ? `${ctx.department.name} (${ctx.school.name})` : "General";

    signIn({
      name: form.name, email: form.email, institution: form.institution,
      program: form.programId || (ctx?.department.name ?? ""),
      year: form.year, country: form.country, primaryLanguage: form.primaryLanguage,
      field: fieldName,
    });
    updateUser({ field: fieldName });

    SEED_DECKS.forEach((d) => {
      const id = addDeck({ name: d.name, description: d.description });
      d.cards.forEach((c) => addCard({ deckId: id, front: c.front, back: c.back }));
    });

    createVenture({
      name: "KubaCold",
      tagline: ctx?.department.suggestedVentureSeed ?? "Solar microcold-storage for tomato co-ops in Northern Ghana",
      problemId: ctx?.department.relevantProblemIds?.[0] ?? "post-harvest-loss",
      phase: "discover",
      region: "Tamale + Yendi + Bolgatanga",
      metrics: { interviewsTarget: 20, revenue: 0, customers: 0, mrr: 0 },
      mvpTasks: [
        { id: "t1", title: "Buy 2 solar panels for prototype", done: true },
        { id: "t2", title: "Wire compressor to controller board", done: true },
        { id: "t3", title: "Field-test prototype at Yendi co-op for 7 days", done: false, due: "2026-06-10" },
        { id: "t4", title: "Build pay-per-crate USSD logging", done: false, due: "2026-06-18" },
      ],
      team: [{ name: form.name, role: "Co-founder, CEO" }, { name: "Kojo Asante", role: "Co-founder, Hardware" }],
      interviews: [
        { id: "iv1", name: "Mama Adwoa", role: "Tomato seller, Tamale Central Market", date: "Day 2", verdict: "validated", notes: "Loses 4 crates/wk to spoilage. Pays out of pocket.", willingnessToPay: 50 },
        { id: "iv2", name: "Kofi Asante", role: "Co-op chairman, Yendi cooperative", date: "Day 4", verdict: "validated", notes: "Co-op pays GHS 1,200/mo in losses.", willingnessToPay: 1200 },
      ],
      canvas: {
        Problem: "30–40% post-harvest tomato loss = GHS 1,200+/mo per co-op",
        Customer: "Tomato co-ops of 20–40 farmers, Northern Ghana savannah belt",
        "Value prop": "GHS 50/mo + per-crate fee = guaranteed buyer + 80% loss reduction",
      },
      fundingTarget: 50_000, fundingRaised: 0,
      achievements: ["Pilot LOI from Yendi cooperative"],
    });

    notify({ title: `Akwaaba ${form.name.split(" ")[0]}!`, body: `Your workspace is tuned to ${fieldName}.` });
    router.push("/studio");
  }

  const canContinue =
    step === 0 ||
    (step === 1 && form.name.trim().length > 1 && form.email.includes("@")) ||
    (step === 2 && form.institution.trim().length > 1) ||
    (step === 3 && form.schoolId !== "") ||
    (step === 4 && form.departmentId !== "") ||
    (step === 5 && form.programId !== "") ||
    step === 6;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-2xl">
        <div className="flex items-center justify-center gap-2.5 mb-6">
          <div className="size-10 rounded-xl bg-gradient-to-br from-emerald to-amber flex items-center justify-center text-black font-bold shadow-lg shadow-emerald/20">
            <span className="font-[family-name:var(--font-display)]">S</span>
          </div>
          <div className="leading-tight">
            <div className="font-[family-name:var(--font-display)] text-lg font-semibold">Sankofa Studio</div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted">From classroom to creator</div>
          </div>
        </div>

        <div className="flex justify-center gap-1 mb-6">
          {steps.map((_, i) => <div key={i} className={`h-1 w-8 rounded-full transition ${i <= step ? "bg-emerald" : "bg-border"}`} />)}
        </div>

        <Card className="p-8 sm:p-10">
          {step === 0 && <Step0 />}
          {step === 1 && <Step1 form={form} setForm={setForm} />}
          {step === 2 && <Step2 form={form} setForm={setForm} />}
          {step === 3 && <Step3 form={form} setForm={setForm} />}
          {step === 4 && <Step4 form={form} setForm={setForm} />}
          {step === 5 && <Step5 form={form} setForm={setForm} />}
          {step === 6 && <Step6 form={form} />}

          <div className="mt-8 flex items-center gap-3">
            {step > 0 && <Button variant="ghost" onClick={back}><ArrowLeft className="size-3.5" /> Back</Button>}
            <div className="flex-1" />
            <Button onClick={next} disabled={!canContinue} size="lg">
              {step === steps.length - 1 ? "Enter Sankofa Studio" : "Continue"} <ArrowRight className="size-4" />
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Step0() {
  return (
    <div>
      <Sparkles className="size-6 text-amber mb-4" />
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold leading-tight">Akwaaba.</h1>
      <p className="mt-3 text-muted">Three minutes to set up your workspace. We'll match you to the tracks, problems, mentors, and ventures that actually fit your field of study — not generic tracks for everyone.</p>
      <div className="mt-5 grid sm:grid-cols-3 gap-2 text-xs">
        {["Field-aware learning paths", "Discipline-relevant AI agents", "Problems sized to your sector"].map((s) => (
          <div key={s} className="rounded-xl border border-emerald/30 bg-emerald/5 p-3 text-emerald">✓ {s}</div>
        ))}
      </div>
    </div>
  );
}

function Step1({ form, setForm }: { form: Form; setForm: (f: Form) => void }) {
  return (
    <div>
      <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold">Who are you?</h2>
      <p className="text-muted mt-1">Just enough so Sage can address you and personalize what you see.</p>
      <div className="mt-5 space-y-4">
        <Field label="Your name"><Input placeholder="Ama Mensah" value={form.name as string} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Email"><Input type="email" placeholder="you@example.com" value={form.email as string} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
      </div>
    </div>
  );
}

function Step2({ form, setForm }: { form: Form; setForm: (f: Form) => void }) {
  return (
    <div>
      <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold">Where are you studying?</h2>
      <p className="text-muted mt-1">We&apos;ll match you with regional mentors, problems, and cohorts.</p>
      <div className="mt-5 space-y-4">
        <Field label="Institution">
          <Input placeholder="KNUST / UG / UNILAG / UCT / Makerere / …" value={form.institution} onChange={(e) => setForm({ ...form, institution: e.target.value })} />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Country">
            <Select value={form.country} onChange={(v) => setForm({ ...form, country: v })} options={COUNTRIES} />
          </Field>
          <Field label="Year">
            <Select value={String(form.year)} onChange={(v) => setForm({ ...form, year: parseInt(v) as 1 | 2 | 3 | 4 | 5 })} options={["1", "2", "3", "4", "5"]} />
          </Field>
          <Field label="Language">
            <Select value={form.primaryLanguage} onChange={(v) => setForm({ ...form, primaryLanguage: v })} options={LANGUAGES} />
          </Field>
        </div>
      </div>
    </div>
  );
}

function Step3({ form, setForm }: { form: Form; setForm: (f: Form) => void }) {
  return (
    <div>
      <Building2 className="size-6 text-emerald mb-3" />
      <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold">Pick your school or college.</h2>
      <p className="text-muted mt-1">Mirrors how African universities are organized. Sankofa learns from this.</p>
      <div className="mt-5 grid sm:grid-cols-2 gap-2">
        {SCHOOLS.map((s) => (
          <button
            key={s.id}
            onClick={() => setForm({ ...form, schoolId: s.id, departmentId: "", programId: "" })}
            className={`flex items-center gap-3 p-4 rounded-xl border transition text-left ${form.schoolId === s.id ? "border-emerald bg-emerald/10" : "border-border hover:border-muted hover:bg-surface-2"}`}
          >
            <div className="text-3xl">{s.icon}</div>
            <div>
              <div className="font-medium">{s.name}</div>
              <div className="text-xs text-muted">{s.departments.length} departments</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function Step4({ form, setForm }: { form: Form; setForm: (f: Form) => void }) {
  const school = SCHOOLS.find((s) => s.id === form.schoolId);
  if (!school) return null;
  return (
    <div>
      <GraduationCap className="size-6 text-amber mb-3" />
      <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold">Department within {school.name}.</h2>
      <p className="text-muted mt-1">We'll route you to relevant problems, tracks, and agents from here.</p>
      <div className="mt-5 grid sm:grid-cols-2 gap-2">
        {school.departments.map((d) => (
          <button
            key={d.id}
            onClick={() => setForm({ ...form, departmentId: d.id, programId: "" })}
            className={`flex flex-col items-start p-4 rounded-xl border transition text-left ${form.departmentId === d.id ? "border-emerald bg-emerald/10" : "border-border hover:border-muted hover:bg-surface-2"}`}
          >
            <div className="font-medium">{d.name}</div>
            <div className="text-xs text-muted mt-1">{d.programs.length} programs · {d.relevantSectors.join(", ")}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function Step5({ form, setForm }: { form: Form; setForm: (f: Form) => void }) {
  const ctx = form.departmentId ? getDepartment(form.departmentId) : null;
  if (!ctx) return null;
  return (
    <div>
      <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold">Your specific program.</h2>
      <p className="text-muted mt-1">{ctx.department.name}</p>
      <div className="mt-5 space-y-2">
        {ctx.department.programs.map((p) => (
          <button
            key={p.id}
            onClick={() => setForm({ ...form, programId: p.id })}
            className={`block w-full text-left p-4 rounded-xl border transition ${form.programId === p.id ? "border-emerald bg-emerald/10" : "border-border hover:border-muted hover:bg-surface-2"}`}
          >
            <div className="flex items-center justify-between">
              <div className="font-medium">{p.name}</div>
              <Badge color="muted">{p.level}</Badge>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function Step6({ form }: { form: { schoolId: string; departmentId: string; programId: string; name: string } }) {
  const ctx = form.departmentId ? getDepartment(form.departmentId) : null;
  if (!ctx) return null;
  return (
    <div>
      <Sparkles className="size-6 text-amber mb-3" />
      <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold">You're tuned in.</h2>
      <p className="text-muted mt-1">Here's what Sankofa just personalized for you:</p>

      <div className="mt-5 space-y-3">
        <Card className="p-4 bg-emerald/5 border-emerald/30">
          <div className="text-[10px] uppercase tracking-widest text-emerald mb-1">Your 3 AI opportunities</div>
          {ctx.department.aiOpportunities.slice(0, 3).map((o) => (
            <div key={o.title} className="mt-2">
              <div className="text-sm font-medium">→ {o.title}</div>
              <div className="text-xs text-muted">{o.why}</div>
            </div>
          ))}
        </Card>
        <Card className="p-4 bg-amber/5 border-amber/30">
          <div className="text-[10px] uppercase tracking-widest text-amber mb-1">Suggested first venture</div>
          <p className="text-sm">{ctx.department.suggestedVentureSeed}</p>
        </Card>
        <Card className="p-4">
          <div className="text-[10px] uppercase tracking-widest text-muted mb-1">Routed to your workspace</div>
          <div className="text-xs text-muted mt-2 flex flex-wrap gap-1">
            {ctx.department.relevantSectors.map((s) => <Badge key={s} color="emerald">{s}</Badge>)}
          </div>
        </Card>
      </div>
    </div>
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

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="bg-surface-2 border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-emerald w-full">
      {options.map((o) => <option key={o} value={o} className="bg-surface">{o}</option>)}
    </select>
  );
}
