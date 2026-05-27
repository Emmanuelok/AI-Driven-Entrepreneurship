"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTrack } from "@/lib/curriculum";
import { getLessonContent, Step } from "@/lib/lesson-content";
import { useStore } from "@/store";
import { useMe } from "@/store/me";
import { Card, Button, Badge, Textarea } from "@/components/ui";
import { Markdown } from "@/components/markdown";
import { ArrowLeft, CheckCircle2, XCircle, Sparkles, ArrowRight, Trophy } from "lucide-react";

export default function LessonPlayerPage({ params }: { params: Promise<{ trackId: string; lessonId: string }> }) {
  const { trackId, lessonId } = use(params);
  const router = useRouter();
  const foundTrack = getTrack(trackId);
  const foundLesson = getLessonContent(lessonId);
  if (!foundTrack || !foundLesson) { notFound(); return null; }
  const track = foundTrack;
  const lesson = foundLesson;

  const { startLesson, completeLesson } = useStore();
  const { touchConcept, logActivity, remember } = useMe();
  const [stepIdx, setStepIdx] = useState(0);
  const [stepResult, setStepResult] = useState<Record<number, { correct: boolean; locked: boolean }>>({});
  const [finished, setFinished] = useState(false);

  // start lesson on mount-ish (idempotent)
  if (Object.keys(stepResult).length === 0 && stepIdx === 0) {
    startLesson(trackId, lessonId);
  }

  const step = lesson.steps[stepIdx];
  const isLast = stepIdx === lesson.steps.length - 1;
  const totalGradable = lesson.steps.filter((s) => s.kind === "mcq" || s.kind === "fill" || s.kind === "code" || s.kind === "drag").length;
  const correctCount = Object.values(stepResult).filter((r) => r.correct).length;

  function markStep(correct: boolean) {
    setStepResult((s) => ({ ...s, [stepIdx]: { correct, locked: true } }));
  }

  function next() {
    if (isLast) {
      const pct = totalGradable > 0 ? (correctCount / totalGradable) * 100 : 100;
      completeLesson(trackId, lessonId, pct);
      // Add a knowledge-graph node for this lesson and remember the milestone
      touchConcept(lesson.title, track.pillar, Math.max(0.15, pct / 200));
      logActivity({ kind: "lesson", title: `Completed: ${lesson.title}`, href: `/studio/learn/${trackId}` });
      if (pct >= 90) remember({ fact: `Strong on "${lesson.title}" (${Math.round(pct)}%)`, kind: "achievement", source: "system", importance: 3 });
      if (pct < 60) remember({ fact: `Struggled with "${lesson.title}" (${Math.round(pct)}%) — revisit`, kind: "challenge", source: "system", importance: 4 });
      setFinished(true);
    } else {
      setStepIdx(stepIdx + 1);
    }
  }

  if (finished) {
    const pct = totalGradable > 0 ? (correctCount / totalGradable) * 100 : 100;
    return (
      <div className="max-w-2xl mx-auto px-5 py-20 text-center">
        <div className="size-20 mx-auto rounded-full bg-emerald/15 flex items-center justify-center mb-6">
          <Trophy className="size-9 text-emerald" />
        </div>
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight">Lesson complete</h1>
        <p className="mt-3 text-muted">You scored {correctCount} of {totalGradable} ({Math.round(pct)}%). XP awarded.</p>
        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <Button onClick={() => router.push(`/studio/learn/${trackId}`)} size="lg">
            Back to track <ArrowRight className="size-4" />
          </Button>
          <Button variant="secondary" onClick={() => router.push("/studio/srs")}>
            Review with flashcards
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-5 sm:px-8 py-10">
      <Link href={`/studio/learn/${trackId}`} className="text-sm text-muted hover:text-foreground inline-flex items-center gap-1.5 mb-6">
        <ArrowLeft className="size-3.5" /> {track.title}
      </Link>

      <div className="flex items-center gap-3 mb-3">
        <Badge color="emerald">Step {stepIdx + 1} of {lesson.steps.length}</Badge>
        <Badge color="muted">{step.kind}</Badge>
      </div>
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold leading-tight">{lesson.title}</h1>
      <p className="mt-2 text-muted">{lesson.intro}</p>

      <div className="h-1 bg-surface-2 rounded-full mt-6 overflow-hidden">
        <div className="h-full bg-emerald rounded-full transition-all" style={{ width: `${((stepIdx + 1) / lesson.steps.length) * 100}%` }} />
      </div>

      <Card className="mt-6 p-6 sm:p-8">
        <StepView
          step={step}
          locked={stepResult[stepIdx]?.locked ?? false}
          onResult={markStep}
        />
      </Card>

      <div className="mt-6 flex justify-between">
        <Button variant="ghost" disabled={stepIdx === 0} onClick={() => setStepIdx(stepIdx - 1)}>
          <ArrowLeft className="size-4" /> Back
        </Button>
        <Button onClick={next} disabled={(step.kind === "mcq" || step.kind === "fill" || step.kind === "code" || step.kind === "drag") && !stepResult[stepIdx]?.locked} size="lg">
          {isLast ? "Finish lesson" : "Next"} <ArrowRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}

function StepView({ step, locked, onResult }: { step: Step; locked: boolean; onResult: (correct: boolean) => void }) {
  if (step.kind === "read") return <Markdown src={step.html.replace(/<[^>]+>/g, (t) => t)} />;
  if (step.kind === "reflect") return <ReflectStep step={step} />;
  if (step.kind === "mcq") return <McqStep step={step} locked={locked} onResult={onResult} />;
  if (step.kind === "fill") return <FillStep step={step} locked={locked} onResult={onResult} />;
  if (step.kind === "code") return <CodeStep step={step} locked={locked} onResult={onResult} />;
  if (step.kind === "drag") return <DragStep step={step} locked={locked} onResult={onResult} />;
  return null;
}

function ReflectStep({ step }: { step: Extract<Step, { kind: "reflect" }> }) {
  return (
    <div>
      <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-amber mb-3">
        <Sparkles className="size-3.5" /> Reflection
      </div>
      <p className="text-lg leading-relaxed">{step.prompt}</p>
      <Textarea className="mt-4" placeholder="Write your reflection — it's only for you." rows={5} />
    </div>
  );
}

function McqStep({ step, locked, onResult }: { step: Extract<Step, { kind: "mcq" }>; locked: boolean; onResult: (c: boolean) => void }) {
  const [pick, setPick] = useState<number | null>(null);

  function submit() {
    if (pick === null) return;
    onResult(pick === step.correctIndex);
  }

  return (
    <div>
      <Markdown src={step.question} />
      <div className="mt-5 space-y-2">
        {step.options.map((o, i) => {
          const isPicked = pick === i;
          const isCorrect = locked && i === step.correctIndex;
          const isWrong = locked && isPicked && i !== step.correctIndex;
          return (
            <button
              key={i}
              onClick={() => !locked && setPick(i)}
              disabled={locked}
              className={`w-full text-left px-4 py-3 rounded-xl border transition flex items-center gap-3 ${
                isCorrect ? "border-emerald bg-emerald/10" :
                isWrong ? "border-rust bg-rust/10" :
                isPicked ? "border-emerald/60 bg-surface-2" :
                "border-border hover:border-emerald/40"
              }`}
            >
              <span className="size-6 rounded-full border border-border flex items-center justify-center text-xs font-mono">
                {String.fromCharCode(65 + i)}
              </span>
              <span className="flex-1">{o}</span>
              {isCorrect && <CheckCircle2 className="size-5 text-emerald" />}
              {isWrong && <XCircle className="size-5 text-rust" />}
            </button>
          );
        })}
      </div>
      {!locked ? (
        <Button onClick={submit} disabled={pick === null} className="mt-5">Check answer</Button>
      ) : (
        <div className={`mt-5 p-4 rounded-xl border ${pick === step.correctIndex ? "border-emerald/30 bg-emerald/10" : "border-rust/30 bg-rust/10"}`}>
          <div className="text-sm">{step.explanation}</div>
        </div>
      )}
    </div>
  );
}

function FillStep({ step, locked, onResult }: { step: Extract<Step, { kind: "fill" }>; locked: boolean; onResult: (c: boolean) => void }) {
  const [v, setV] = useState("");

  function submit() {
    const num = parseFloat(v);
    const target = typeof step.answer === "number" ? step.answer : parseFloat(step.answer as string);
    const tol = step.tolerance ?? 0.001;
    onResult(!isNaN(num) && Math.abs(num - target) <= tol);
  }

  const correct = locked && Math.abs(parseFloat(v) - (typeof step.answer === "number" ? step.answer : parseFloat(step.answer))) <= (step.tolerance ?? 0.001);

  return (
    <div>
      <Markdown src={step.question} />
      <div className="mt-5 flex gap-2 items-center">
        <input
          value={v}
          onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !locked && submit()}
          disabled={locked}
          placeholder="Your numeric answer"
          className="flex-1 bg-surface-2 border border-border rounded-xl px-4 py-3 font-mono text-lg outline-none focus:border-emerald"
        />
        {!locked && <Button onClick={submit} disabled={!v}>Check</Button>}
      </div>
      {locked && (
        <div className={`mt-5 p-4 rounded-xl border ${correct ? "border-emerald/30 bg-emerald/10" : "border-rust/30 bg-rust/10"}`}>
          <div className="font-medium mb-1">{correct ? "✓ Correct" : `✗ The answer was ${step.answer}`}</div>
          <div className="text-sm text-muted">{step.explanation}</div>
        </div>
      )}
    </div>
  );
}

function CodeStep({ step, locked, onResult }: { step: Extract<Step, { kind: "code" }>; locked: boolean; onResult: (c: boolean) => void }) {
  const [code, setCode] = useState(step.starter);
  const [showHint, setShowHint] = useState(false);

  function submit() {
    const ok = step.expectedOutputIncludes.some((s) => code.includes(s.split("Total: ")[1] ?? s));
    // We don't actually run Pyodide here — the lab does that. We grade by output expectation in code text.
    // For demo: treat as correct if the user wrote >= 3 lines of non-comment code.
    const lines = code.split("\n").filter((l) => l.trim() && !l.trim().startsWith("#")).length;
    const correct = lines >= 3 && !code.includes("pass  # replace");
    onResult(correct);
  }

  return (
    <div>
      <p>{step.prompt}</p>
      <textarea
        value={code}
        onChange={(e) => setCode(e.target.value)}
        disabled={locked}
        rows={10}
        spellCheck={false}
        className="mt-4 w-full font-[family-name:var(--font-mono)] text-sm bg-surface-2 border border-border rounded-xl px-4 py-3 outline-none focus:border-emerald"
      />
      <p className="text-xs text-muted mt-2">For a fully-running runtime, open the <Link href="/studio/lab" className="text-emerald hover:underline">Practice Lab</Link>. Here we grade by checking whether you wrote substantive code.</p>
      <div className="mt-4 flex gap-2 items-center">
        {!locked && <Button onClick={submit}>I'm done — grade it</Button>}
        <button onClick={() => setShowHint(!showHint)} className="text-sm text-amber hover:underline">{showHint ? "Hide" : "Show"} hint</button>
      </div>
      {showHint && <p className="mt-3 text-sm text-muted italic">{step.hint}</p>}
    </div>
  );
}

function DragStep({ step, locked, onResult }: { step: Extract<Step, { kind: "drag" }>; locked: boolean; onResult: (c: boolean) => void }) {
  const [order, setOrder] = useState(step.items.map((_, i) => i));

  function move(from: number, to: number) {
    if (locked) return;
    const next = order.slice();
    const [a] = next.splice(from, 1);
    next.splice(to, 0, a);
    setOrder(next);
  }

  function submit() {
    const correct = order.every((v, i) => v === step.correctOrder[i]);
    onResult(correct);
  }

  return (
    <div>
      <p>{step.question}</p>
      <ol className="mt-4 space-y-2">
        {order.map((origIdx, pos) => (
          <li key={origIdx} className="flex items-center gap-3 p-3 rounded-xl border border-border bg-surface-2">
            <span className="text-xs font-mono text-muted w-6">{pos + 1}.</span>
            <span className="flex-1">{step.items[origIdx]}</span>
            {!locked && (
              <div className="flex gap-1">
                <button onClick={() => pos > 0 && move(pos, pos - 1)} className="size-7 rounded-md border border-border hover:bg-surface text-sm">↑</button>
                <button onClick={() => pos < order.length - 1 && move(pos, pos + 1)} className="size-7 rounded-md border border-border hover:bg-surface text-sm">↓</button>
              </div>
            )}
          </li>
        ))}
      </ol>
      {!locked ? (
        <Button onClick={submit} className="mt-4">Check order</Button>
      ) : (
        <div className={`mt-4 p-4 rounded-xl border ${order.every((v, i) => v === step.correctOrder[i]) ? "border-emerald/30 bg-emerald/10" : "border-rust/30 bg-rust/10"}`}>
          <div className="text-sm">{step.explanation}</div>
        </div>
      )}
    </div>
  );
}
