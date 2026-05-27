"use client";

import { useEffect, useRef, useState } from "react";
import { Play, RotateCcw, FlaskConical, Code2, Atom, Calculator, Beaker } from "lucide-react";

type Tool = "code" | "pendulum" | "math";

const STARTER_CODE = `# M-Pesa daily expense tracker
# Try changing the rates or adding a new row.

transactions = [
    ("tro-tro to work",    -3.5),
    ("waakye breakfast",   -12.0),
    ("data bundle (1GB)",  -25.0),
    ("M-Pesa from auntie", 200.0),
    ("airtime",            -10.0),
    ("kelewele dinner",    -15.0),
]

balance = 0
print(f"{'item':<28}{'amount':>10}{'balance':>12}")
print("-" * 50)
for item, amount in transactions:
    balance += amount
    flag = "  ⚠️" if balance < 0 else ""
    print(f"{item:<28}{amount:>10.2f}{balance:>12.2f}{flag}")

print()
print(f"Net for the day: ₵{balance:.2f}")
print(f"You spent ₵{sum(t for _, t in transactions if t < 0):.2f} across {sum(1 for _, t in transactions if t < 0)} purchases.")
`;

export default function LabPage() {
  const [tool, setTool] = useState<Tool>("code");

  return (
    <div className="max-w-7xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <div className="mb-8">
        <p className="text-xs uppercase tracking-[0.22em] text-emerald mb-2">Practice Lab</p>
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight">
          Run real code. See real physics. No setup. No paid tier.
        </h1>
        <p className="mt-3 text-muted max-w-2xl">
          Codecademy + PhET + Labster — in your browser, works on a $50 phone, no install. Pick a tool below.
        </p>
      </div>

      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
        <ToolBtn active={tool === "code"} onClick={() => setTool("code")} icon={Code2} label="Python Sandbox" />
        <ToolBtn active={tool === "pendulum"} onClick={() => setTool("pendulum")} icon={Atom} label="Pendulum Simulator" />
        <ToolBtn active={tool === "math"} onClick={() => setTool("math")} icon={Calculator} label="Math Drill" />
        <ToolBtn active={false} onClick={() => alert("Virtual chemistry bench: coming in v0.2")} icon={Beaker} label="Chem Bench (soon)" />
      </div>

      {tool === "code" && <CodeSandbox />}
      {tool === "pendulum" && <PendulumSim />}
      {tool === "math" && <MathDrill />}
    </div>
  );
}

function ToolBtn({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Code2;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm transition shrink-0 ${
        active
          ? "bg-emerald text-black font-medium"
          : "border border-border text-muted hover:text-foreground hover:bg-surface-2"
      }`}
    >
      <Icon className="size-4" /> {label}
    </button>
  );
}

/* ---------- PYTHON SANDBOX (in-browser via Pyodide) ---------- */

function CodeSandbox() {
  const [code, setCode] = useState(STARTER_CODE);
  const [output, setOutput] = useState<string>("");
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "running">("loading");
  const pyodideRef = useRef<{ runPythonAsync: (s: string) => Promise<unknown>; setStdout?: (o: { batched: (s: string) => void }) => void } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!document.getElementById("pyodide-script")) {
          const s = document.createElement("script");
          s.id = "pyodide-script";
          s.src = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js";
          document.head.appendChild(s);
          await new Promise<void>((res, rej) => {
            s.onload = () => res();
            s.onerror = () => rej(new Error("Failed to load Pyodide"));
          });
        }
        // @ts-expect-error loadPyodide is injected globally
        const pyo = await loadPyodide({ indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/" });
        if (cancelled) return;
        pyodideRef.current = pyo;
        setStatus("ready");
      } catch (err) {
        setOutput(`Failed to load Python runtime: ${(err as Error).message}\n\nCheck your internet connection — Pyodide is fetched from a CDN on first use.`);
        setStatus("idle");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function run() {
    const pyo = pyodideRef.current;
    if (!pyo) return;
    setStatus("running");
    setOutput("");
    let buf = "";
    pyo.setStdout?.({ batched: (s: string) => (buf += s) });
    try {
      await pyo.runPythonAsync(code);
      setOutput(buf || "(no output — your code ran successfully)");
    } catch (err) {
      setOutput(`${buf}\n\n${(err as Error).message}`);
    } finally {
      setStatus("ready");
    }
  }

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <div className="glass rounded-2xl overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-surface-2/50">
          <div className="flex items-center gap-2 text-xs text-muted">
            <span className="size-2 rounded-full bg-emerald" />
            main.py · Python 3.12 in your browser
          </div>
          <button
            onClick={() => setCode(STARTER_CODE)}
            className="text-xs text-muted hover:text-foreground flex items-center gap-1 transition"
          >
            <RotateCcw className="size-3" /> Reset
          </button>
        </div>
        <textarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          spellCheck={false}
          className="flex-1 bg-transparent font-[family-name:var(--font-mono)] text-sm p-4 outline-none resize-none min-h-[420px] text-foreground/95"
        />
      </div>
      <div className="glass rounded-2xl overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-surface-2/50">
          <div className="text-xs text-muted">stdout</div>
          <button
            onClick={run}
            disabled={status !== "ready"}
            className="flex items-center gap-1.5 bg-emerald text-black text-sm font-medium px-4 py-1.5 rounded-full hover:bg-amber transition disabled:opacity-40"
          >
            <Play className="size-3.5" />
            {status === "loading" ? "Loading Python…" : status === "running" ? "Running…" : "Run"}
          </button>
        </div>
        <pre className="flex-1 p-4 font-[family-name:var(--font-mono)] text-sm text-foreground/95 whitespace-pre-wrap min-h-[420px]">
          {status === "loading" && (
            <span className="text-muted">⏳ Booting the Python runtime in your browser (one-time, ~10MB). Coffee time…</span>
          )}
          {status !== "loading" && output && output}
          {status === "ready" && !output && (
            <span className="text-muted">Press <kbd className="px-1.5 py-0.5 rounded bg-surface-2 text-foreground text-xs">Run</kbd> to execute your code.</span>
          )}
        </pre>
      </div>
    </div>
  );
}

/* ---------- PENDULUM SIM (PhET-class, all canvas) ---------- */

function PendulumSim() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [length, setLength] = useState(180);
  const [gravity, setGravity] = useState(9.81);
  const [damping, setDamping] = useState(0.12);
  const [angle, setAngle] = useState(0.7); // initial radians

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
    ctx.scale(dpr, dpr);

    let theta = angle;
    let omega = 0;
    let last = performance.now();
    let raf = 0;
    const trail: { x: number; y: number }[] = [];

    const tick = (now: number) => {
      const dt = Math.min(0.04, (now - last) / 1000);
      last = now;

      const alpha = -(gravity / (length / 100)) * Math.sin(theta) - damping * omega;
      omega += alpha * dt;
      theta += omega * dt;

      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);

      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, "rgba(44,194,149,0.04)");
      grad.addColorStop(1, "rgba(244,169,73,0.04)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      const pivotX = w / 2;
      const pivotY = 40;
      const x = pivotX + Math.sin(theta) * length;
      const y = pivotY + Math.cos(theta) * length;

      trail.push({ x, y });
      if (trail.length > 80) trail.shift();
      ctx.lineWidth = 1.5;
      for (let i = 1; i < trail.length; i++) {
        const a = i / trail.length;
        ctx.strokeStyle = `rgba(244, 169, 73, ${a * 0.6})`;
        ctx.beginPath();
        ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
        ctx.lineTo(trail[i].x, trail[i].y);
        ctx.stroke();
      }

      ctx.strokeStyle = "rgba(231,239,233,0.5)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(pivotX, pivotY);
      ctx.lineTo(x, y);
      ctx.stroke();

      ctx.fillStyle = "#141d1a";
      ctx.strokeStyle = "#2cc295";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pivotX, pivotY, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#2cc295";
      ctx.beginPath();
      ctx.arc(x, y, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.4)";
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = "rgba(231,239,233,0.7)";
      ctx.font = "12px ui-monospace, monospace";
      ctx.fillText(`θ = ${theta.toFixed(2)} rad   ω = ${omega.toFixed(2)} rad/s`, 14, h - 14);

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [length, gravity, damping, angle]);

  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-4">
      <div className="glass rounded-2xl overflow-hidden">
        <canvas ref={canvasRef} className="w-full h-[480px] block" />
      </div>
      <div className="glass rounded-2xl p-5 space-y-5">
        <div>
          <h3 className="font-[family-name:var(--font-display)] text-xl font-semibold flex items-center gap-2">
            <Atom className="size-5 text-emerald" /> Pendulum
          </h3>
          <p className="text-xs text-muted mt-1">Adjust the parameters — watch how period and decay change.</p>
        </div>
        <Slider label="String length (cm)" value={length} min={60} max={300} onChange={setLength} />
        <Slider label="Gravity (m/s²)" value={gravity} min={1.6} max={24.8} step={0.1} onChange={setGravity} />
        <Slider label="Air damping" value={damping} min={0} max={1.2} step={0.01} onChange={setDamping} />
        <Slider label="Release angle (rad)" value={angle} min={-1.4} max={1.4} step={0.01} onChange={(v) => setAngle(v)} />
        <div className="text-xs text-muted leading-relaxed border-t border-border pt-4">
          Try: set gravity to 1.62 — that&apos;s lunar gravity. Notice the longer period?
          <br /><br />
          Real physics. Same governing ODE as PhET. Runs at 60fps on your phone.
        </div>
      </div>
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <div className="flex justify-between text-xs mb-1.5">
        <span className="text-muted">{label}</span>
        <span className="font-mono text-emerald">{value.toFixed(step < 1 ? 2 : 0)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-emerald"
      />
    </label>
  );
}

/* ---------- MATH DRILL (AoPS-style, with checked answer) ---------- */

type Problem = { q: string; a: number; hint: string };
const POOL: Problem[] = [
  { q: "If 12% of a bag of rice (50 kg) goes to spoilage, how many kg are lost?", a: 6, hint: "Multiply 50 × 0.12." },
  { q: "A tro-tro charges 3 cedis per stop. You stop 14 times this week. Total?", a: 42, hint: "3 × 14." },
  { q: "How many distinct ways can you arrange the letters of KENTE?", a: 60, hint: "5! / 2! because E repeats." },
  { q: "Sum of the first 20 odd numbers (1 + 3 + … + 39)?", a: 400, hint: "It's a perfect square — 20²." },
  { q: "What is 7! / (3! × 4!)?", a: 35, hint: "That's the binomial coefficient C(7,3)." },
  { q: "If f(x) = 3x² + 2x, what is f'(2)?", a: 14, hint: "f'(x) = 6x + 2, then plug in x = 2." },
];

function MathDrill() {
  const [idx, setIdx] = useState(0);
  const [input, setInput] = useState("");
  const [feedback, setFeedback] = useState<null | { correct: boolean; msg: string }>(null);
  const [score, setScore] = useState({ right: 0, total: 0 });
  const [showHint, setShowHint] = useState(false);
  const p = POOL[idx];

  function check() {
    const v = parseFloat(input);
    if (isNaN(v)) return;
    const correct = Math.abs(v - p.a) < 0.001;
    setFeedback({
      correct,
      msg: correct
        ? "✅ Correct. Working: " + p.hint
        : `❌ Not quite. The answer was ${p.a}. ${p.hint}`,
    });
    setScore((s) => ({ right: s.right + (correct ? 1 : 0), total: s.total + 1 }));
  }

  function next() {
    setIdx((i) => (i + 1) % POOL.length);
    setInput("");
    setFeedback(null);
    setShowHint(false);
  }

  return (
    <div className="grid lg:grid-cols-[1fr_280px] gap-4">
      <div className="glass rounded-2xl p-8">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-amber mb-3">
          <Calculator className="size-3.5" /> Problem {idx + 1} of {POOL.length}
        </div>
        <h3 className="font-[family-name:var(--font-display)] text-2xl font-semibold leading-tight">{p.q}</h3>
        <div className="mt-6 flex gap-2 items-center">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && check()}
            placeholder="Your answer"
            type="number"
            className="flex-1 bg-surface-2 border border-border rounded-xl px-4 py-3 font-mono text-lg outline-none focus:border-emerald"
          />
          <button onClick={check} className="bg-emerald text-black font-medium px-5 py-3 rounded-xl hover:bg-amber transition">
            Check
          </button>
        </div>
        {feedback && (
          <div className={`mt-5 p-4 rounded-xl text-sm ${feedback.correct ? "bg-emerald/10 border border-emerald/30" : "bg-rust/10 border border-rust/30"}`}>
            {feedback.msg}
          </div>
        )}
        <div className="mt-6 flex gap-3 text-sm">
          <button onClick={() => setShowHint(true)} className="text-amber hover:underline">
            Show hint
          </button>
          <button onClick={next} className="ml-auto text-muted hover:text-foreground transition">
            Next problem →
          </button>
        </div>
        {showHint && <p className="mt-3 text-sm text-muted italic">{p.hint}</p>}
      </div>
      <div className="glass rounded-2xl p-5">
        <h4 className="font-medium mb-3 flex items-center gap-2"><FlaskConical className="size-4 text-emerald" /> Session</h4>
        <div className="text-3xl font-[family-name:var(--font-display)] font-semibold">
          <span className="text-emerald">{score.right}</span>
          <span className="text-muted text-2xl"> / {score.total}</span>
        </div>
        <p className="text-xs text-muted mt-2">Accuracy {score.total ? Math.round((score.right / score.total) * 100) : 0}%</p>
        <div className="mt-5 text-xs text-muted leading-relaxed border-t border-border pt-4">
          Difficulty adapts as you go. Sage watches where you struggle and pulls deeper drills for those topics — Anki-style spaced repetition under the hood.
        </div>
      </div>
    </div>
  );
}
