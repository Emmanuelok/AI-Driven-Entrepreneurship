"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter, notFound } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "@/store";
import { useMe } from "@/store/me";
import { getInteractiveLesson, Scene } from "@/lib/interactive-lessons";
import { Markdown } from "@/components/markdown";
import { genomeVoiceInstruction } from "@/lib/genome";
import { Card, Button, Badge, Textarea } from "@/components/ui";
import { ArrowLeft, ArrowRight, Sparkles, Brain, CheckCircle2, XCircle, Lightbulb, RefreshCcw, Trophy } from "lucide-react";

export default function InteractiveLessonPage({ params }: { params: Promise<{ lessonId: string }> }) {
  const { lessonId } = use(params);
  const router = useRouter();
  const { user, addXp, completeLesson, startLesson } = useStore();
  const { genome, touchConcept, logActivity, remember } = useMe();
  const [sceneIdx, setSceneIdx] = useState(0);
  const [masteryGains, setMasteryGains] = useState<Record<string, number>>({});
  const [done, setDone] = useState(false);

  const foundLesson = getInteractiveLesson(lessonId);
  if (!foundLesson) { notFound(); return null; }
  const lesson = foundLesson;

  // start lesson tracking once
  if (sceneIdx === 0 && Object.keys(masteryGains).length === 0) {
    startLesson(lesson.trackId, lesson.id);
  }

  const scene = lesson.scenes[sceneIdx];
  const isLast = sceneIdx === lesson.scenes.length - 1;

  function recordMastery(deltas: { concept: string; delta: number }[]) {
    setMasteryGains((m) => {
      const next = { ...m };
      for (const d of deltas) next[d.concept] = (next[d.concept] ?? 0) + d.delta;
      return next;
    });
    for (const d of deltas) touchConcept(d.concept, lesson.trackId, d.delta);
  }

  function next() {
    if (isLast) {
      const total = Object.values(masteryGains).reduce((s, v) => s + v, 0);
      const score = Math.min(100, total * 100);
      completeLesson(lesson.trackId, lesson.id, score);
      addXp(60 + Math.round(score * 0.4), `Finished interactive lesson: ${lesson.title}`);
      logActivity({ kind: "lesson", title: `Completed: ${lesson.title}`, href: `/studio/interactive/${lesson.id}` });
      remember({ fact: `Completed interactive lesson "${lesson.title}" with ${Math.round(score)}% mastery gain`, kind: "achievement", source: "system", importance: 3 });
      setDone(true);
    } else {
      setSceneIdx(sceneIdx + 1);
    }
  }

  function back() {
    if (sceneIdx > 0) setSceneIdx(sceneIdx - 1);
  }

  if (done) return <FinalCelebration lesson={lesson} masteryGains={masteryGains} onExit={() => router.push("/studio/learn")} />;

  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex flex-col relative overflow-hidden">
      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none">
        <motion.div animate={{ opacity: [0.3, 0.5, 0.3] }} transition={{ duration: 12, repeat: Infinity }} className="absolute -top-32 -right-32 size-[28rem] rounded-full bg-emerald/15 blur-3xl" />
        <motion.div animate={{ opacity: [0.5, 0.3, 0.5] }} transition={{ duration: 14, repeat: Infinity }} className="absolute -bottom-32 -left-32 size-[28rem] rounded-full bg-amber/15 blur-3xl" />
      </div>

      {/* Header */}
      <header className="relative px-5 sm:px-8 py-4 border-b border-border/40 backdrop-blur flex items-center justify-between gap-4">
        <Link href="/studio/learn" className="text-sm text-muted hover:text-foreground inline-flex items-center gap-1.5"><ArrowLeft className="size-3.5" /> Learn</Link>
        <div className="flex-1 max-w-xl mx-4 flex items-center gap-1">
          {lesson.scenes.map((_, i) => (
            <div key={i} className={`h-1 flex-1 rounded-full transition-all ${i < sceneIdx ? "bg-emerald" : i === sceneIdx ? "bg-amber" : "bg-border"}`} />
          ))}
        </div>
        <div className="text-[10px] uppercase tracking-widest text-muted hidden sm:block">{sceneIdx + 1} / {lesson.scenes.length}</div>
      </header>

      {/* Lesson title strip */}
      <div className="relative max-w-3xl mx-auto px-5 sm:px-8 pt-8 pb-4 text-center w-full">
        <div className="text-[10px] uppercase tracking-[0.3em] text-emerald mb-2">{lesson.subtitle}</div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl sm:text-3xl font-semibold leading-tight">{lesson.title}</h1>
      </div>

      {/* Scene */}
      <div className="relative flex-1 overflow-y-auto px-5 sm:px-8 pb-10">
        <div className="max-w-3xl mx-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={sceneIdx}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4 }}
            >
              <SceneRenderer
                scene={scene}
                firstName={user?.name.split(" ")[0] ?? "friend"}
                genomeVoice={genomeVoiceInstruction(genome)}
                onPass={(deltas) => recordMastery(deltas)}
                onAdvance={next}
              />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Footer nav */}
      <footer className="relative px-5 sm:px-8 py-4 border-t border-border/40 flex items-center justify-between backdrop-blur">
        <Button variant="ghost" onClick={back} disabled={sceneIdx === 0}>
          <ArrowLeft className="size-4" /> Back
        </Button>
        <div className="text-xs text-muted hidden sm:block">
          Mastery progress: {(Object.values(masteryGains).reduce((s, v) => s + v, 0) * 100).toFixed(0)}%
        </div>
        <Button onClick={next}>
          {isLast ? "Finish lesson" : "Continue"} <ArrowRight className="size-4" />
        </Button>
      </footer>
    </div>
  );
}

function SceneRenderer({ scene, firstName, genomeVoice, onPass, onAdvance }: {
  scene: Scene;
  firstName: string;
  genomeVoice: string;
  onPass: (deltas: { concept: string; delta: number }[]) => void;
  onAdvance: () => void;
}) {
  if (scene.kind === "concept") return <ConceptView scene={scene} />;
  if (scene.kind === "check") return <CheckView scene={scene} onPass={onPass} />;
  if (scene.kind === "socratic") return <SocraticView scene={scene} firstName={firstName} genomeVoice={genomeVoice} onPass={onPass} />;
  if (scene.kind === "reflect") return <ReflectView scene={scene} />;
  if (scene.kind === "celebrate") return <CelebrateView scene={scene} onPass={onPass} />;
  if (scene.kind === "sim-pendulum") return <SimView scene={scene} kind="pendulum" />;
  if (scene.kind === "sim-supply-curve") return <SimView scene={scene} kind="supply" />;
  if (scene.kind === "sim-circuit") return <SimView scene={scene} kind="circuit" />;
  if (scene.kind === "sim-waves") return <SimView scene={scene} kind="waves" />;
  if (scene.kind === "sim-titration") return <SimView scene={scene} kind="titration" />;
  return null;
}

/* ─── CONCEPT ─── */
function ConceptView({ scene }: { scene: Extract<Scene, { kind: "concept" }> }) {
  return (
    <Card className="p-8 sm:p-10">
      <div className="text-[10px] uppercase tracking-[0.25em] text-emerald mb-3">Concept</div>
      <h2 className="font-[family-name:var(--font-display)] text-2xl sm:text-3xl font-semibold leading-tight mb-5">{scene.title}</h2>
      <div className="prose-chat text-lg leading-[1.7] text-foreground/95"><Markdown src={scene.body} /></div>
      {scene.metaphor && (
        <div className="mt-6 p-4 rounded-2xl border border-amber/30 bg-amber/5 flex items-start gap-3">
          <Lightbulb className="size-5 text-amber shrink-0 mt-0.5" />
          <p className="text-sm text-foreground/90 italic leading-relaxed">{scene.metaphor.story}</p>
        </div>
      )}
    </Card>
  );
}

/* ─── CHECK (MCQ) ─── */
function CheckView({ scene, onPass }: { scene: Extract<Scene, { kind: "check" }>; onPass: (d: { concept: string; delta: number }[]) => void }) {
  const [picked, setPicked] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);

  function check() {
    if (picked === null) return;
    setRevealed(true);
    const opt = scene.options[picked];
    if (opt.correct) onPass([{ concept: "general", delta: 0.1 }]);
  }

  return (
    <Card className="p-8 sm:p-10">
      <div className="text-[10px] uppercase tracking-[0.25em] text-amber mb-3">Check yourself</div>
      <h3 className="font-[family-name:var(--font-display)] text-xl sm:text-2xl font-semibold leading-tight mb-6"><Markdown src={scene.prompt} /></h3>
      <div className="space-y-2.5">
        {scene.options.map((o, i) => {
          const isPicked = picked === i;
          const isCorrect = revealed && o.correct;
          const isWrong = revealed && isPicked && !o.correct;
          return (
            <button
              key={i}
              onClick={() => !revealed && setPicked(i)}
              disabled={revealed}
              className={`w-full text-left p-4 rounded-2xl border transition ${
                isCorrect ? "border-emerald bg-emerald/10" :
                isWrong ? "border-rust bg-rust/10" :
                isPicked ? "border-emerald/60 bg-surface-2" :
                "border-border hover:border-emerald/40"
              }`}
            >
              <div className="flex items-start gap-3">
                <span className="size-7 rounded-full border border-border flex items-center justify-center font-mono text-xs shrink-0">
                  {String.fromCharCode(65 + i)}
                </span>
                <span className="flex-1">{o.label}</span>
                {isCorrect && <CheckCircle2 className="size-5 text-emerald shrink-0" />}
                {isWrong && <XCircle className="size-5 text-rust shrink-0" />}
              </div>
              {revealed && isPicked && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-3 text-sm text-muted italic">
                  {o.feedback}
                </motion.div>
              )}
            </button>
          );
        })}
      </div>
      {!revealed && (
        <Button onClick={check} disabled={picked === null} className="mt-5">Check answer</Button>
      )}
    </Card>
  );
}

/* ─── SOCRATIC ─── */
function SocraticView({ scene, firstName, genomeVoice, onPass }: {
  scene: Extract<Scene, { kind: "socratic" }>;
  firstName: string;
  genomeVoice: string;
  onPass: (d: { concept: string; delta: number }[]) => void;
}) {
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ verdict: "strong" | "partial" | "off"; encouragement: string; gap: string; nextNudge: string; masteryDelta: number } | null>(null);
  const [hintIdx, setHintIdx] = useState(-1);

  async function evaluate() {
    if (!answer.trim() || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/lessons/socratic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: scene.question,
          expectedConcepts: scene.expectedConcepts,
          studentAnswer: answer,
          genomeVoice,
          firstName,
        }),
      });
      const data = await res.json();
      setFeedback(data);
      if (data.verdict !== "off") {
        onPass([{ concept: scene.expectedConcepts[0] ?? "general", delta: data.masteryDelta ?? 0.15 }]);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-8 sm:p-10">
      <div className="text-[10px] uppercase tracking-[0.25em] text-emerald mb-3 flex items-center gap-2"><Brain className="size-3.5" /> Sage is asking</div>
      <p className="text-base text-muted mb-3 italic">{scene.intro}</p>
      <h3 className="font-[family-name:var(--font-display)] text-xl sm:text-2xl font-semibold leading-tight mb-5"><Markdown src={scene.question} /></h3>

      <Textarea
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        placeholder="Think before you type. Don't worry about getting it perfect — Sage will work it with you."
        rows={5}
        disabled={!!feedback && feedback.verdict === "strong"}
      />

      {!feedback && (
        <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
          <button
            onClick={() => setHintIdx((i) => Math.min(scene.followUpHints.length - 1, i + 1))}
            disabled={hintIdx >= scene.followUpHints.length - 1}
            className="text-sm text-amber hover:text-emerald disabled:opacity-30 transition flex items-center gap-1.5"
          >
            <Lightbulb className="size-3.5" /> {hintIdx === -1 ? "I'm stuck — give me a hint" : `Hint ${hintIdx + 2}/${scene.followUpHints.length}`}
          </button>
          <Button onClick={evaluate} disabled={!answer.trim() || busy}>
            {busy ? "Sage is reading…" : "Show Sage my answer"}
          </Button>
        </div>
      )}

      {hintIdx >= 0 && (
        <div className="mt-4 p-3 rounded-xl border border-amber/30 bg-amber/5 text-sm text-foreground/90 italic">
          {scene.followUpHints[hintIdx]}
        </div>
      )}

      {feedback && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-6 space-y-4">
          <div className={`p-5 rounded-2xl border ${feedback.verdict === "strong" ? "border-emerald/30 bg-emerald/5" : feedback.verdict === "partial" ? "border-amber/30 bg-amber/5" : "border-rust/30 bg-rust/5"}`}>
            <div className="flex items-start gap-3">
              <Brain className="size-5 text-emerald shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-foreground/95 leading-relaxed font-[family-name:var(--font-display)] text-lg">{feedback.encouragement}</p>
                {feedback.gap && (
                  <p className="text-sm text-muted mt-3 leading-relaxed">{feedback.gap}</p>
                )}
                <p className="text-sm mt-4 italic">Sage asks: <span className="text-amber">{feedback.nextNudge}</span></p>
              </div>
            </div>
          </div>
          {feedback.verdict !== "strong" && (
            <Button variant="secondary" onClick={() => { setFeedback(null); setAnswer(""); }}>
              <RefreshCcw className="size-3.5" /> Try again
            </Button>
          )}
        </motion.div>
      )}
    </Card>
  );
}

/* ─── REFLECT ─── */
function ReflectView({ scene }: { scene: Extract<Scene, { kind: "reflect" }> }) {
  return (
    <Card className="p-8 sm:p-10">
      <div className="text-[10px] uppercase tracking-[0.25em] text-amber mb-3 flex items-center gap-2"><Sparkles className="size-3.5" /> Reflect</div>
      <h3 className="font-[family-name:var(--font-display)] text-xl sm:text-2xl font-semibold leading-tight mb-5">{scene.prompt}</h3>
      <Textarea placeholder="Write freely. This stays with you — Sage doesn't read it unless you share." rows={5} />
    </Card>
  );
}

/* ─── CELEBRATE (in-scene) ─── */
function CelebrateView({ scene, onPass }: { scene: Extract<Scene, { kind: "celebrate" }>; onPass: (d: { concept: string; delta: number }[]) => void }) {
  // record mastery once
  if (Object.keys(scene.mastery).length > 0) {
    setTimeout(() => onPass(scene.mastery), 0);
  }
  return (
    <Card className="p-8 sm:p-12 text-center bg-gradient-to-br from-emerald/15 via-transparent to-amber/15 border-emerald/30 relative overflow-hidden">
      <div className="absolute -top-20 -right-20 size-48 rounded-full bg-emerald/20 blur-3xl" />
      <div className="absolute -bottom-20 -left-20 size-48 rounded-full bg-amber/20 blur-3xl" />
      <div className="relative">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", duration: 0.8 }} className="size-20 mx-auto rounded-full bg-gradient-to-br from-emerald to-amber flex items-center justify-center shadow-2xl shadow-emerald/40 mb-6">
          <Trophy className="size-9 text-black" />
        </motion.div>
        <h2 className="font-[family-name:var(--font-display)] text-3xl sm:text-4xl font-semibold leading-tight">{scene.title}</h2>
        <p className="mt-5 text-lg text-foreground/95 leading-relaxed max-w-xl mx-auto"><Markdown src={scene.body} /></p>
        <div className="mt-7 flex flex-wrap gap-2 justify-center">
          {scene.mastery.map((m) => (
            <div key={m.concept} className="px-4 py-2 rounded-full border border-emerald/30 bg-emerald/10 text-sm">
              <span className="font-medium text-emerald">+{(m.delta * 100).toFixed(0)}%</span>
              <span className="text-muted ml-2">{m.concept}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

/* ─── SIM (placeholder visual — students can also open the full lab) ─── */
function SimView({ scene, kind }: { scene: Extract<Scene, { kind: "sim-pendulum" | "sim-supply-curve" | "sim-circuit" | "sim-waves" | "sim-titration" }>; kind: string }) {
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  function check() {
    if (!answer.trim()) return;
    const target = scene.acceptableAnswer;
    let ok = false;
    if (!target) ok = answer.length > 0;
    else if (target.kind === "regex") ok = new RegExp(target.pattern, "i").test(answer.trim());
    else if (target.kind === "range") {
      const n = parseFloat(answer);
      ok = !isNaN(n) && n >= target.min && n <= target.max;
    }
    else if (target.kind === "open") ok = answer.trim().split(/\s+/).length >= target.minWords;
    setFeedback({ ok, msg: ok ? "Right — you saw it." : scene.hint ?? "Look again. The clue is in the simulation." });
  }

  return (
    <Card className="overflow-hidden">
      <div className="p-6 border-b border-border bg-surface-2/40">
        <div className="text-[10px] uppercase tracking-[0.25em] text-indigo mb-2 flex items-center gap-2"><Sparkles className="size-3.5" /> Live simulation</div>
        <p className="text-base text-foreground/95 leading-relaxed">{scene.prompt}</p>
      </div>

      {/* Interactive sim */}
      <div className="bg-[#06100d] aspect-[16/9] flex items-center justify-center relative overflow-hidden">
        {kind === "pendulum" && <PendulumPreview />}
        {kind === "supply" && <SupplyCurvePreview />}
        {kind !== "pendulum" && kind !== "supply" && (
          <div className="text-center">
            <p className="text-muted text-sm mb-3">Open the full simulation in the Lab to manipulate parameters directly.</p>
            <Link href="/studio/lab" className="text-emerald hover:underline text-sm">Open Practice Lab →</Link>
          </div>
        )}
      </div>

      <div className="p-6">
        <h3 className="font-medium text-base mb-3">{scene.guideQuestion}</h3>
        <div className="flex gap-2">
          <input
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && check()}
            placeholder="Your answer"
            className="flex-1 bg-surface-2 border border-border rounded-xl px-4 py-3 outline-none focus:border-emerald"
          />
          <Button onClick={check}>Check</Button>
        </div>
        {feedback && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`mt-4 p-3 rounded-xl border ${feedback.ok ? "border-emerald/30 bg-emerald/5 text-foreground" : "border-amber/30 bg-amber/5 text-muted"}`}>
            {feedback.msg}
          </motion.div>
        )}
        {scene.hint && (
          <p className="mt-3 text-xs text-muted italic">Hint: {scene.hint}</p>
        )}
      </div>
    </Card>
  );
}

// Tiny embedded pendulum visualization
function PendulumPreview() {
  return (
    <svg viewBox="0 0 400 220" className="w-full h-full">
      <line x1="200" y1="20" x2="200" y2="20" stroke="#2cc295" strokeWidth="2" />
      <motion.g
        animate={{ rotate: [25, -25, 25] }}
        transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
        style={{ originX: "200px", originY: "20px", transformOrigin: "200px 20px" }}
      >
        <line x1="200" y1="20" x2="200" y2="170" stroke="rgba(231,239,233,0.5)" strokeWidth="2" />
        <circle cx="200" cy="170" r="20" fill="#2cc295" />
      </motion.g>
      <circle cx="200" cy="20" r="5" fill="#f4a949" />
    </svg>
  );
}

function SupplyCurvePreview() {
  return (
    <svg viewBox="0 0 400 220" className="w-full h-full">
      <line x1="40" y1="190" x2="380" y2="190" stroke="#1f2c28" />
      <line x1="40" y1="190" x2="40" y2="20" stroke="#1f2c28" />
      <text x="40" y="210" fill="#8aa39a" fontSize="10">Quantity</text>
      <text x="20" y="20" fill="#8aa39a" fontSize="10">Price</text>
      <line x1="40" y1="180" x2="360" y2="40" stroke="#2cc295" strokeWidth="2.5" />
      <text x="320" y="55" fill="#2cc295" fontSize="11">Supply</text>
      <line x1="40" y1="40" x2="360" y2="180" stroke="#f4a949" strokeWidth="2.5" />
      <text x="320" y="195" fill="#f4a949" fontSize="11">Demand</text>
      <motion.circle
        cx="200" cy="110" r="6" fill="#e7efe9"
        animate={{ scale: [1, 1.2, 1] }}
        transition={{ duration: 1.8, repeat: Infinity }}
      />
      <text x="210" y="100" fill="#e7efe9" fontSize="11">Equilibrium</text>
    </svg>
  );
}

/* ─── FINAL CELEBRATION ─── */
function FinalCelebration({ lesson, masteryGains, onExit }: { lesson: { title: string; concepts: string[] }; masteryGains: Record<string, number>; onExit: () => void }) {
  const total = Object.values(masteryGains).reduce((s, v) => s + v, 0);
  const pct = Math.min(100, total * 100);

  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center px-5 py-12 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-32 -right-32 size-96 rounded-full bg-emerald/20 blur-3xl" />
        <div className="absolute -bottom-32 -left-32 size-96 rounded-full bg-amber/20 blur-3xl" />
      </div>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }} className="relative max-w-2xl text-center">
        <motion.div initial={{ scale: 0, rotate: -180 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", duration: 1 }} className="size-24 mx-auto rounded-full bg-gradient-to-br from-emerald to-amber flex items-center justify-center shadow-2xl shadow-emerald/40 mb-6">
          <Trophy className="size-12 text-black" />
        </motion.div>
        <div className="text-[10px] uppercase tracking-[0.3em] text-emerald mb-2">Lesson complete</div>
        <h1 className="font-[family-name:var(--font-display)] text-4xl sm:text-5xl font-semibold leading-tight">{lesson.title}</h1>
        <p className="mt-4 text-lg text-muted max-w-md mx-auto">You moved {pct.toFixed(0)}% closer to mastering the concepts in this lesson.</p>

        <div className="mt-7 grid sm:grid-cols-2 gap-2 max-w-sm mx-auto">
          {Object.entries(masteryGains).map(([c, d]) => (
            <div key={c} className="rounded-xl border border-emerald/30 bg-emerald/10 px-3 py-2 text-sm">
              <div className="text-emerald font-medium">+{(d * 100).toFixed(0)}%</div>
              <div className="text-xs text-muted">{c}</div>
            </div>
          ))}
        </div>

        <div className="mt-9 flex flex-col sm:flex-row gap-3 justify-center">
          <Button onClick={onExit} size="lg">Back to Learn <ArrowRight className="size-4" /></Button>
          <Link href="/studio/me" className="text-sm text-muted hover:text-foreground transition self-center">See your knowledge graph grow →</Link>
        </div>
      </motion.div>
    </div>
  );
}
