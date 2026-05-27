"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, ArrowRight, ArrowLeft } from "lucide-react";
import { useStore } from "@/store";
import { Button, Input, Card } from "@/components/ui";
import { SEED_DECKS } from "@/lib/srs-seed";

const COUNTRIES = ["Ghana", "Nigeria", "Kenya", "South Africa", "Uganda", "Tanzania", "Ethiopia", "Rwanda", "Senegal", "Côte d'Ivoire", "Egypt", "Morocco", "Other"];
const LANGUAGES = ["English", "Pidgin", "Twi", "Yoruba", "Hausa", "Swahili", "Amharic", "French", "Wolof", "Zulu", "Arabic"];
const FIELDS = [
  "Agricultural Engineering", "Computer Science", "Business", "Medicine", "Law",
  "Mechanical Engineering", "Civil Engineering", "Economics", "Education",
  "Architecture", "Public Health", "Environmental Science", "Communications",
  "Fashion / Creative", "Other",
];

export default function OnboardingPage() {
  const router = useRouter();
  const { signIn, addDeck, addCard, createVenture, notify } = useStore();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    name: "",
    email: "",
    institution: "",
    program: "",
    year: 2 as 1 | 2 | 3 | 4 | 5,
    country: "Ghana",
    primaryLanguage: "English",
    field: "Computer Science",
  });

  const steps = [
    {
      title: "Welcome to Sankofa",
      body: "Two minutes to set up your workspace. Everything you enter stays on your device — fully private.",
      ok: "Begin",
    },
    {
      title: "Who are you?",
      body: "Just enough so Sage can address you and personalize lessons.",
      ok: "Continue",
    },
    {
      title: "Where are you studying?",
      body: "We'll match you with regional mentors, problems, and cohorts.",
      ok: "Continue",
    },
    {
      title: "What do you study?",
      body: "We'll build your AI-for-your-field path.",
      ok: "Continue",
    },
    {
      title: "You're in.",
      body: "We'll seed your account with starter flashcard decks, a sample venture, and your first daily review.",
      ok: "Enter Sankofa Studio",
    },
  ];

  function next() {
    if (step === steps.length - 1) return finish();
    setStep((s) => s + 1);
  }

  function finish() {
    signIn(form);
    // seed SRS decks
    SEED_DECKS.forEach((d) => {
      const id = addDeck({ name: d.name, description: d.description });
      d.cards.forEach((c) => addCard({ deckId: id, front: c.front, back: c.back }));
    });
    // seed sample venture
    createVenture({
      name: "KubaCold",
      tagline: "Solar microcold-storage for tomato co-ops in Northern Ghana",
      problemId: "post-harvest-loss",
      phase: "discover",
      region: "Tamale + Yendi + Bolgatanga",
      metrics: { interviewsTarget: 20, revenue: 0, customers: 0, mrr: 0 },
      mvpTasks: [
        { id: "t1", title: "Buy 2 solar panels for prototype", done: true },
        { id: "t2", title: "Wire compressor to controller board", done: true },
        { id: "t3", title: "Field-test prototype at Yendi co-op for 7 days", done: false, due: "2026-06-10" },
        { id: "t4", title: "Build pay-per-crate USSD logging", done: false, due: "2026-06-18" },
      ],
      team: [
        { name: form.name, role: "Co-founder, CEO" },
        { name: "Kojo Asante", role: "Co-founder, Hardware" },
        { name: "Dr. M. Owusu", role: "Advisor, Cold-chain" },
      ],
      interviews: [
        { id: "iv1", name: "Mama Adwoa", role: "Tomato seller, Tamale Central Market", date: "Day 2", verdict: "validated", notes: "Loses 4 crates/wk to spoilage. Pays out of pocket. Willing to commit at GHS 50/mo.", willingnessToPay: 50 },
        { id: "iv2", name: "Kofi Asante", role: "Co-op chairman, Yendi cooperative (28 farmers)", date: "Day 4", verdict: "validated", notes: "Co-op pays GHS 1,200/mo in losses. Wants whole-cooperative subscription.", willingnessToPay: 1200 },
        { id: "iv3", name: "Hajia Fatima", role: "Wholesale buyer, Kumasi Central", date: "Day 6", verdict: "insight", notes: "Premium for verified-quality batches. Could be a take-rate side." },
      ],
      canvas: {
        Problem: "30–40% post-harvest tomato loss = GHS 1,200+/mo per co-op",
        Customer: "Tomato co-ops of 20–40 farmers, Northern Ghana savannah belt",
        "Value prop": "GHS 50/mo + per-crate fee = guaranteed buyer + 80% loss reduction",
        Solution: "Solar-powered 500kg cold cell + vision quality-grading app",
        Channels: "Co-op chairmen → pastor introductions → 12 co-ops mapped",
        Revenue: "Subscription + crate fee + premium-buyer take rate",
        Cost: "Unit BOM GHS 18k · payback < 14 mo at 22 co-ops",
        Metrics: "Loss-% reduction, crate throughput, buyer NPS",
        "Unfair edge": "Local trust + Sage-trained team + AGRA pilot grant pre-LOI",
      },
      fundingTarget: 50_000,
      fundingRaised: 0,
      achievements: ["Pilot LOI from Yendi cooperative"],
    });
    notify({ title: `Akwaaba ${form.name.split(" ")[0]}!`, body: "Your studio is ready. Sage scheduled a tutorial in your inbox." });
    router.push("/studio");
  }

  const canContinue =
    step === 0 ||
    (step === 1 && form.name.trim().length > 1 && form.email.includes("@")) ||
    (step === 2 && form.institution.trim().length > 1) ||
    (step === 3 && form.program.trim().length > 1) ||
    step === 4;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-xl">
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div className="size-10 rounded-xl bg-gradient-to-br from-emerald to-amber flex items-center justify-center text-black font-bold shadow-lg shadow-emerald/20">
            <span className="font-[family-name:var(--font-display)]">S</span>
          </div>
          <div className="leading-tight">
            <div className="font-[family-name:var(--font-display)] text-lg font-semibold">Sankofa Studio</div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted">From classroom to creator</div>
          </div>
        </div>

        <div className="flex justify-center gap-1.5 mb-6">
          {steps.map((_, i) => (
            <div key={i} className={`h-1 w-10 rounded-full transition ${i <= step ? "bg-emerald" : "bg-border"}`} />
          ))}
        </div>

        <Card className="p-8 sm:p-10">
          <div className="flex items-start gap-3 mb-5">
            <Sparkles className="size-6 text-amber shrink-0" />
            <div>
              <h1 className="font-[family-name:var(--font-display)] text-2xl sm:text-3xl font-semibold leading-tight">{steps[step].title}</h1>
              <p className="mt-2 text-muted">{steps[step].body}</p>
            </div>
          </div>

          {step === 1 && (
            <div className="space-y-4 mt-6">
              <Field label="Your name">
                <Input placeholder="Ama Mensah" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </Field>
              <Field label="Email">
                <Input type="email" placeholder="you@example.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </Field>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4 mt-6">
              <Field label="Institution">
                <Input placeholder="University of Ghana, Legon" value={form.institution} onChange={(e) => setForm({ ...form, institution: e.target.value })} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Country">
                  <Select value={form.country} onChange={(v) => setForm({ ...form, country: v })} options={COUNTRIES} />
                </Field>
                <Field label="Year">
                  <Select
                    value={String(form.year)}
                    onChange={(v) => setForm({ ...form, year: parseInt(v) as 1 | 2 | 3 | 4 | 5 })}
                    options={["1", "2", "3", "4", "5"]}
                  />
                </Field>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4 mt-6">
              <Field label="Program / Major">
                <Input placeholder="BSc Agricultural Engineering" value={form.program} onChange={(e) => setForm({ ...form, program: e.target.value })} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Field family">
                  <Select value={form.field} onChange={(v) => setForm({ ...form, field: v })} options={FIELDS} />
                </Field>
                <Field label="Preferred language">
                  <Select value={form.primaryLanguage} onChange={(v) => setForm({ ...form, primaryLanguage: v })} options={LANGUAGES} />
                </Field>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="mt-6 grid sm:grid-cols-2 gap-3 text-sm">
              {[
                "4 starter flashcard decks (Anki SM-2)",
                "Sample venture: 'KubaCold' with 3 logged interviews",
                "AI tutor Sage personalized to your field",
                "Adaptive learning paths for your level",
              ].map((s) => (
                <div key={s} className="rounded-xl border border-emerald/30 bg-emerald/5 px-4 py-3 text-emerald">
                  ✓ {s}
                </div>
              ))}
            </div>
          )}

          <div className="mt-8 flex items-center gap-3">
            {step > 0 && (
              <Button variant="ghost" onClick={() => setStep((s) => s - 1)}>
                <ArrowLeft className="size-3.5" /> Back
              </Button>
            )}
            <div className="flex-1" />
            <Button onClick={next} disabled={!canContinue} size="lg">
              {steps[step].ok} <ArrowRight className="size-4" />
            </Button>
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
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="bg-surface-2 border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-emerald w-full"
    >
      {options.map((o) => (
        <option key={o} value={o} className="bg-surface">
          {o}
        </option>
      ))}
    </select>
  );
}
