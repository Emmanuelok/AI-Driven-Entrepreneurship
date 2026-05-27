"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMe } from "@/store/me";
import { GENOME_QUESTIONS, computeGenome, genomeSummary, genomeVoiceInstruction, Genome } from "@/lib/genome";
import { Card, Button, Badge } from "@/components/ui";
import { Sparkles, ArrowLeft, ArrowRight, CheckCircle2, Brain } from "lucide-react";

export default function GenomePage() {
  const router = useRouter();
  const { genome, setGenome, remember } = useMe();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const [preview, setPreview] = useState<Genome | null>(null);

  const total = GENOME_QUESTIONS.length;
  const q = GENOME_QUESTIONS[step];

  function pick(i: number) {
    const next = { ...answers, [q.id]: String(i) };
    setAnswers(next);
    if (step < total - 1) {
      setTimeout(() => setStep(step + 1), 220);
    } else {
      const g = computeGenome(next);
      setPreview(g);
      setDone(true);
    }
  }

  function commit() {
    if (preview) {
      setGenome(preview);
      remember({ fact: `Genome: ${genomeSummary(preview)}`, kind: "preference", source: "explicit", importance: 5 });
    }
    router.push("/studio/me");
  }

  if (done && preview) {
    return (
      <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center px-5 py-12">
        <div className="max-w-2xl w-full">
          <div className="text-center mb-8">
            <Sparkles className="size-12 text-amber mx-auto mb-4" />
            <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight">Your Studio Genome</h1>
            <p className="mt-3 text-muted">This shapes how Sage talks to you, what content gets surfaced, and how your workspace feels.</p>
          </div>

          <Card className="p-6">
            <div className="text-[10px] uppercase tracking-widest text-emerald mb-2">Summary</div>
            <div className="font-[family-name:var(--font-display)] text-2xl">{genomeSummary(preview)}</div>
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
              {Object.entries(preview.traits).map(([k, v]) => (
                <div key={k} className="rounded-xl border border-border bg-surface-2 p-2.5">
                  <div className="text-[10px] uppercase tracking-widest text-muted">{k}</div>
                  <div className="h-1.5 bg-surface rounded-full overflow-hidden mt-1.5">
                    <div className="h-full bg-gradient-to-r from-emerald to-amber rounded-full" style={{ width: `${v * 100}%` }} />
                  </div>
                  <div className="text-xs font-mono text-emerald mt-1">{(v * 100).toFixed(0)}</div>
                </div>
              ))}
            </div>
            <div className="mt-6 space-y-3 text-sm">
              <div className="flex gap-2 items-center"><Badge color="amber">Motivation</Badge><span>{preview.motivation}</span></div>
              <div className="flex gap-2 items-center"><Badge color="rust">Primary fear</Badge><span>{preview.primaryFear}</span></div>
              <div className="flex gap-2 items-center"><Badge color="indigo">Totem</Badge><span>{preview.totem}</span></div>
              <div className="flex gap-2 items-center"><Badge color="emerald">Pace</Badge><span>{preview.pacePerWeek} hours/week</span></div>
            </div>
            <Card className="mt-6 p-4 bg-emerald/5 border-emerald/30">
              <div className="text-[10px] uppercase tracking-widest text-emerald mb-2 flex items-center gap-1.5"><Brain className="size-3.5" /> How Sage will speak to you</div>
              <p className="text-sm leading-relaxed text-muted italic">{genomeVoiceInstruction(preview)}</p>
            </Card>
          </Card>

          <div className="flex gap-2 mt-6">
            <Button variant="secondary" onClick={() => { setDone(false); setStep(0); setAnswers({}); setPreview(null); }}>Retake</Button>
            <Button onClick={commit} className="flex-1"><CheckCircle2 className="size-4" /> Lock in my Genome</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex flex-col items-center justify-center px-5 py-12">
      <div className="w-full max-w-2xl">
        <Link href="/studio/me" className="text-sm text-muted hover:text-foreground inline-flex items-center gap-1.5 mb-6"><ArrowLeft className="size-3.5" /> Me</Link>
        <div className="flex gap-1 mb-6 justify-center">
          {GENOME_QUESTIONS.map((_, i) => (
            <div key={i} className={`h-1 w-8 rounded-full transition ${i <= step ? "bg-emerald" : "bg-border"}`} />
          ))}
        </div>
        <div className="text-center mb-2">
          <div className="text-[10px] uppercase tracking-widest text-amber">Question {step + 1} of {total}</div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl sm:text-3xl font-semibold leading-tight mt-3 max-w-xl mx-auto">{q.prompt}</h1>
        </div>
        <div className="mt-8 space-y-2.5">
          {q.options.map((o, i) => (
            <button
              key={i}
              onClick={() => pick(i)}
              className="block w-full text-left p-5 rounded-2xl border border-border bg-surface hover:border-emerald hover:bg-surface-2 transition group"
            >
              <div className="flex items-center gap-3">
                <div className="size-6 rounded-full border border-border group-hover:border-emerald flex items-center justify-center font-mono text-xs text-muted group-hover:text-emerald transition">{String.fromCharCode(65 + i)}</div>
                <span className="text-sm">{o.label}</span>
              </div>
            </button>
          ))}
        </div>
        {step > 0 && (
          <button onClick={() => setStep(step - 1)} className="mt-6 text-xs text-muted hover:text-foreground flex items-center gap-1 mx-auto">
            <ArrowLeft className="size-3" /> Previous question
          </button>
        )}
      </div>
    </div>
  );
}
