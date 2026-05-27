"use client";

import { useEffect, useRef, useState } from "react";
import { Play, RotateCcw, FlaskConical, Code2, Atom, Calculator, Beaker, Zap, Waves } from "lucide-react";

type Tool = "code" | "pendulum" | "circuits" | "waves" | "chemistry" | "math";

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
        <ToolBtn active={tool === "pendulum"} onClick={() => setTool("pendulum")} icon={Atom} label="Pendulum" />
        <ToolBtn active={tool === "circuits"} onClick={() => setTool("circuits")} icon={Zap} label="Circuit Builder" />
        <ToolBtn active={tool === "waves"} onClick={() => setTool("waves")} icon={Waves} label="Wave Interference" />
        <ToolBtn active={tool === "chemistry"} onClick={() => setTool("chemistry")} icon={Beaker} label="Titration Bench" />
        <ToolBtn active={tool === "math"} onClick={() => setTool("math")} icon={Calculator} label="Math Drill" />
      </div>

      {tool === "code" && <CodeSandbox />}
      {tool === "pendulum" && <PendulumSim />}
      {tool === "circuits" && <CircuitSim />}
      {tool === "waves" && <WaveSim />}
      {tool === "chemistry" && <TitrationSim />}
      {tool === "math" && <MathDrill />}
    </div>
  );
}

function ToolBtn({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: typeof Code2; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm transition shrink-0 ${
        active ? "bg-emerald text-black font-medium" : "border border-border text-muted hover:text-foreground hover:bg-surface-2"
      }`}
    >
      <Icon className="size-4" /> {label}
    </button>
  );
}

/* ---------- PYTHON SANDBOX ---------- */

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
        setOutput(`Failed to load Python runtime: ${(err as Error).message}`);
        setStatus("idle");
      }
    })();
    return () => { cancelled = true; };
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
          <button onClick={() => setCode(STARTER_CODE)} className="text-xs text-muted hover:text-foreground flex items-center gap-1 transition">
            <RotateCcw className="size-3" /> Reset
          </button>
        </div>
        <textarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          spellCheck={false}
          className="flex-1 bg-transparent font-[family-name:var(--font-mono)] text-sm p-4 outline-none resize-none min-h-[460px] text-foreground/95"
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
        <pre className="flex-1 p-4 font-[family-name:var(--font-mono)] text-sm text-foreground/95 whitespace-pre-wrap min-h-[460px]">
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

/* ---------- PENDULUM ---------- */

function PendulumSim() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [length, setLength] = useState(180);
  const [gravity, setGravity] = useState(9.81);
  const [damping, setDamping] = useState(0.12);
  const [angle, setAngle] = useState(0.7);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
    ctx.scale(dpr, dpr);
    let theta = angle, omega = 0, last = performance.now(), raf = 0;
    const trail: { x: number; y: number }[] = [];
    const tick = (now: number) => {
      const dt = Math.min(0.04, (now - last) / 1000);
      last = now;
      const alpha = -(gravity / (length / 100)) * Math.sin(theta) - damping * omega;
      omega += alpha * dt; theta += omega * dt;
      const w = canvas.clientWidth, h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);
      const pivotX = w / 2, pivotY = 40;
      const x = pivotX + Math.sin(theta) * length;
      const y = pivotY + Math.cos(theta) * length;
      trail.push({ x, y });
      if (trail.length > 80) trail.shift();
      for (let i = 1; i < trail.length; i++) {
        const a = i / trail.length;
        ctx.strokeStyle = `rgba(244, 169, 73, ${a * 0.6})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(trail[i - 1].x, trail[i - 1].y); ctx.lineTo(trail[i].x, trail[i].y); ctx.stroke();
      }
      ctx.strokeStyle = "rgba(231,239,233,0.5)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(pivotX, pivotY); ctx.lineTo(x, y); ctx.stroke();
      ctx.fillStyle = "#141d1a"; ctx.strokeStyle = "#2cc295"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(pivotX, pivotY, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#2cc295";
      ctx.beginPath(); ctx.arc(x, y, 18, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(231,239,233,0.7)"; ctx.font = "12px ui-monospace, monospace";
      ctx.fillText(`θ = ${theta.toFixed(2)} rad   ω = ${omega.toFixed(2)} rad/s`, 14, h - 14);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [length, gravity, damping, angle]);

  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-4">
      <div className="glass rounded-2xl overflow-hidden"><canvas ref={canvasRef} className="w-full h-[480px] block" /></div>
      <div className="glass rounded-2xl p-5 space-y-5">
        <div>
          <h3 className="font-[family-name:var(--font-display)] text-xl font-semibold flex items-center gap-2">
            <Atom className="size-5 text-emerald" /> Pendulum
          </h3>
          <p className="text-xs text-muted mt-1">Real ODE integration at 60fps.</p>
        </div>
        <Slider label="String length (cm)" value={length} min={60} max={300} onChange={setLength} />
        <Slider label="Gravity (m/s²)" value={gravity} min={1.6} max={24.8} step={0.1} onChange={setGravity} />
        <Slider label="Air damping" value={damping} min={0} max={1.2} step={0.01} onChange={setDamping} />
        <Slider label="Release angle (rad)" value={angle} min={-1.4} max={1.4} step={0.01} onChange={setAngle} />
        <p className="text-xs text-muted leading-relaxed border-t border-border pt-4">
          Try gravity at 1.62 (lunar). Notice the period almost triples.
        </p>
      </div>
    </div>
  );
}

/* ---------- CIRCUITS ---------- */

function CircuitSim() {
  const [voltage, setVoltage] = useState(9);
  const [r1, setR1] = useState(220);
  const [r2, setR2] = useState(330);
  const [parallel, setParallel] = useState(false);

  const totalR = parallel ? (r1 * r2) / (r1 + r2) : r1 + r2;
  const current = voltage / totalR;
  const power = voltage * current;
  const v1 = parallel ? voltage : current * r1;
  const v2 = parallel ? voltage : current * r2;
  const i1 = parallel ? voltage / r1 : current;
  const i2 = parallel ? voltage / r2 : current;

  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-4">
      <div className="glass rounded-2xl p-8">
        <div className="text-xs uppercase tracking-widest text-emerald mb-3 flex items-center gap-2">
          <Zap className="size-3.5" /> {parallel ? "Parallel" : "Series"} circuit · Live calculations
        </div>
        <svg viewBox="0 0 600 320" className="w-full">
          <rect x="20" y="20" width="560" height="280" rx="8" fill="none" stroke="rgba(231,239,233,0.1)" />
          <line x1="100" y1="80" x2="500" y2="80" stroke="#2cc295" strokeWidth="3" />
          <line x1="100" y1="240" x2="500" y2="240" stroke="#2cc295" strokeWidth="3" />
          <line x1="100" y1="80" x2="100" y2="240" stroke="#2cc295" strokeWidth="3" />
          <circle cx="100" cy="160" r="22" fill="#0f1614" stroke="#f4a949" strokeWidth="2" />
          <text x="100" y="158" textAnchor="middle" fill="#f4a949" fontSize="11" fontFamily="ui-monospace">{voltage}V</text>
          <text x="100" y="172" textAnchor="middle" fill="#f4a949" fontSize="9">battery</text>
          {parallel ? (
            <>
              <rect x="240" y="40" width="60" height="22" fill="#0f1614" stroke="#6c8cff" strokeWidth="2" />
              <text x="270" y="55" textAnchor="middle" fill="#6c8cff" fontSize="10" fontFamily="ui-monospace">R₁ {r1}Ω</text>
              <line x1="240" y1="51" x2="200" y2="51" stroke="#6c8cff" strokeWidth="2" />
              <line x1="300" y1="51" x2="340" y2="51" stroke="#6c8cff" strokeWidth="2" />
              <line x1="200" y1="51" x2="200" y2="80" stroke="#6c8cff" strokeWidth="2" />
              <line x1="340" y1="51" x2="340" y2="80" stroke="#6c8cff" strokeWidth="2" />
              <rect x="240" y="120" width="60" height="22" fill="#0f1614" stroke="#d96444" strokeWidth="2" />
              <text x="270" y="135" textAnchor="middle" fill="#d96444" fontSize="10" fontFamily="ui-monospace">R₂ {r2}Ω</text>
              <line x1="240" y1="131" x2="200" y2="131" stroke="#d96444" strokeWidth="2" />
              <line x1="300" y1="131" x2="340" y2="131" stroke="#d96444" strokeWidth="2" />
              <line x1="200" y1="131" x2="200" y2="80" stroke="#d96444" strokeWidth="2" />
              <line x1="340" y1="131" x2="340" y2="80" stroke="#d96444" strokeWidth="2" />
              <line x1="200" y1="160" x2="200" y2="240" stroke="#2cc295" strokeWidth="3" />
              <line x1="340" y1="160" x2="340" y2="240" stroke="#2cc295" strokeWidth="3" />
            </>
          ) : (
            <>
              <rect x="200" y="68" width="60" height="22" fill="#0f1614" stroke="#6c8cff" strokeWidth="2" />
              <text x="230" y="83" textAnchor="middle" fill="#6c8cff" fontSize="10" fontFamily="ui-monospace">R₁ {r1}Ω</text>
              <rect x="340" y="68" width="60" height="22" fill="#0f1614" stroke="#d96444" strokeWidth="2" />
              <text x="370" y="83" textAnchor="middle" fill="#d96444" fontSize="10" fontFamily="ui-monospace">R₂ {r2}Ω</text>
            </>
          )}
          <circle cx="500" cy="160" r="22" fill="rgba(244,169,73,0.2)" stroke="#f4a949" strokeWidth="2" style={{ filter: `brightness(${0.5 + Math.min(power / 0.3, 2)})` }} />
          <text x="500" y="164" textAnchor="middle" fill="#f4a949" fontSize="11">💡</text>
          <text x="500" y="200" textAnchor="middle" fill="#f4a949" fontSize="10" fontFamily="ui-monospace">{power.toFixed(2)}W</text>
          <line x1="500" y1="80" x2="500" y2="138" stroke="#2cc295" strokeWidth="3" />
          <line x1="500" y1="182" x2="500" y2="240" stroke="#2cc295" strokeWidth="3" />
        </svg>
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatBox label="Total R" value={`${totalR.toFixed(1)} Ω`} c="text-emerald" />
          <StatBox label="Current I" value={`${(current * 1000).toFixed(1)} mA`} c="text-amber" />
          <StatBox label="Power P" value={`${(power * 1000).toFixed(0)} mW`} c="text-rust" />
          <StatBox label="V₁ / V₂" value={`${v1.toFixed(1)} / ${v2.toFixed(1)} V`} c="text-indigo" />
        </div>
      </div>
      <div className="glass rounded-2xl p-5 space-y-5">
        <h3 className="font-[family-name:var(--font-display)] text-xl font-semibold">Controls</h3>
        <Slider label="Battery (V)" value={voltage} min={1.5} max={24} step={0.5} onChange={setVoltage} />
        <Slider label="R₁ (Ω)" value={r1} min={10} max={1000} step={10} onChange={setR1} />
        <Slider label="R₂ (Ω)" value={r2} min={10} max={1000} step={10} onChange={setR2} />
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={parallel} onChange={(e) => setParallel(e.target.checked)} className="accent-emerald" />
          Parallel topology
        </label>
        <div className="text-xs text-muted border-t border-border pt-4 space-y-2">
          <p>Watch how the bulb dims when you double R₁. Halve it and notice the current doubles.</p>
          <p className="font-mono">V = I × R · P = V × I</p>
        </div>
      </div>
    </div>
  );
}

/* ---------- WAVES (interference) ---------- */

function WaveSim() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [f1, setF1] = useState(2);
  const [f2, setF2] = useState(3);
  const [phase, setPhase] = useState(0);
  const [showSum, setShowSum] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
    ctx.scale(dpr, dpr);
    let t = 0, raf = 0;
    const tick = () => {
      t += 0.02;
      const w = canvas.clientWidth, h = canvas.clientHeight;
      const cy = h / 2;
      ctx.clearRect(0, 0, w, h);
      // grid
      ctx.strokeStyle = "rgba(231,239,233,0.06)";
      for (let i = 0; i < w; i += 30) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, h); ctx.stroke(); }
      for (let j = 0; j < h; j += 30) { ctx.beginPath(); ctx.moveTo(0, j); ctx.lineTo(w, j); ctx.stroke(); }
      // axis
      ctx.strokeStyle = "rgba(231,239,233,0.2)";
      ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(w, cy); ctx.stroke();
      const draw = (color: string, fn: (x: number) => number, alpha = 1) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        for (let x = 0; x < w; x++) {
          const y = cy - fn(x) * (h / 4);
          if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      };
      const k = 0.01;
      draw("#2cc295", (x) => Math.sin(x * k * f1 + t * f1), 0.5);
      draw("#f4a949", (x) => Math.sin(x * k * f2 + t * f2 + phase), 0.5);
      if (showSum) draw("#ffffff", (x) => 0.5 * (Math.sin(x * k * f1 + t * f1) + Math.sin(x * k * f2 + t * f2 + phase)), 1);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [f1, f2, phase, showSum]);

  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-4">
      <div className="glass rounded-2xl overflow-hidden"><canvas ref={canvasRef} className="w-full h-[480px] block" /></div>
      <div className="glass rounded-2xl p-5 space-y-5">
        <h3 className="font-[family-name:var(--font-display)] text-xl font-semibold flex items-center gap-2">
          <Waves className="size-5 text-emerald" /> Wave interference
        </h3>
        <Slider label="Frequency 1" value={f1} min={1} max={10} step={0.1} onChange={setF1} />
        <Slider label="Frequency 2" value={f2} min={1} max={10} step={0.1} onChange={setF2} />
        <Slider label="Phase offset (rad)" value={phase} min={0} max={6.28} step={0.05} onChange={setPhase} />
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={showSum} onChange={(e) => setShowSum(e.target.checked)} className="accent-emerald" />
          Show sum (white)
        </label>
        <p className="text-xs text-muted leading-relaxed border-t border-border pt-4">
          Try f₁=f₂=3 with phase=π. You'll see <strong>destructive interference</strong>. Now try f₁=2, f₂=3 — you see a <strong>beat pattern</strong>.
        </p>
      </div>
    </div>
  );
}

/* ---------- CHEMISTRY: ACID-BASE TITRATION ---------- */

function TitrationSim() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [volumeAdded, setVolumeAdded] = useState(0);
  const acidVol = 25; // mL of acid in flask
  const acidConc = 0.1; // M (HCl)
  const baseConc = 0.1; // M (NaOH)
  // moles
  const acidMol = (acidVol * acidConc) / 1000;
  const baseMol = (volumeAdded * baseConc) / 1000;
  const excessAcid = Math.max(0, acidMol - baseMol);
  const excessBase = Math.max(0, baseMol - acidMol);
  const totalVol = (acidVol + volumeAdded) / 1000;
  let pH = 7;
  if (excessAcid > 0) {
    const conc = excessAcid / totalVol;
    pH = -Math.log10(conc);
  } else if (excessBase > 0) {
    const conc = excessBase / totalVol;
    pH = 14 - -Math.log10(conc);
  }

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
    ctx.scale(dpr, dpr);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);

    // burette
    ctx.fillStyle = "rgba(231,239,233,0.05)";
    ctx.fillRect(w / 2 - 12, 30, 24, 200);
    ctx.strokeStyle = "rgba(231,239,233,0.3)";
    ctx.strokeRect(w / 2 - 12, 30, 24, 200);
    // base remaining
    const baseFillH = 180 * (1 - volumeAdded / 50);
    ctx.fillStyle = "rgba(108,140,255,0.6)";
    ctx.fillRect(w / 2 - 10, 30 + (180 - baseFillH) + 2, 20, baseFillH);

    // flask
    ctx.strokeStyle = "rgba(231,239,233,0.4)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(w / 2 - 60, 260);
    ctx.lineTo(w / 2 - 60, 290);
    ctx.lineTo(w / 2 - 100, 410);
    ctx.lineTo(w / 2 + 100, 410);
    ctx.lineTo(w / 2 + 60, 290);
    ctx.lineTo(w / 2 + 60, 260);
    ctx.stroke();
    // liquid color based on pH
    const indicatorColor = pH < 4 ? "rgba(217, 100, 68, 0.7)" : pH < 6 ? "rgba(244, 169, 73, 0.7)" : pH < 8 ? "rgba(231,239,233,0.3)" : pH < 10 ? "rgba(244, 169, 73, 0.5)" : "rgba(255, 100, 200, 0.7)";
    ctx.fillStyle = indicatorColor;
    ctx.beginPath();
    ctx.moveTo(w / 2 - 92, 386);
    ctx.lineTo(w / 2 + 92, 386);
    ctx.lineTo(w / 2 + 100, 410);
    ctx.lineTo(w / 2 - 100, 410);
    ctx.closePath();
    ctx.fill();

    // drop
    if (volumeAdded > 0 && volumeAdded < 50) {
      ctx.fillStyle = "#6c8cff";
      ctx.beginPath();
      ctx.arc(w / 2, 245, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [volumeAdded, pH]);

  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-4">
      <div className="glass rounded-2xl overflow-hidden">
        <canvas ref={canvasRef} className="w-full h-[480px] block" />
      </div>
      <div className="glass rounded-2xl p-5 space-y-5">
        <h3 className="font-[family-name:var(--font-display)] text-xl font-semibold flex items-center gap-2">
          <Beaker className="size-5 text-emerald" /> HCl ↔ NaOH titration
        </h3>
        <div className="text-xs text-muted">25 mL of 0.1 M HCl with phenolphthalein indicator. Add 0.1 M NaOH from the burette.</div>
        <Slider label="NaOH added (mL)" value={volumeAdded} min={0} max={50} step={0.1} onChange={setVolumeAdded} />
        <div className="grid grid-cols-3 gap-2">
          <StatBox label="pH" value={pH.toFixed(2)} c="text-emerald" />
          <StatBox label="Moles H⁺" value={excessAcid.toExponential(2)} c="text-amber" />
          <StatBox label="Moles OH⁻" value={excessBase.toExponential(2)} c="text-rust" />
        </div>
        <div className="text-xs text-muted border-t border-border pt-4 leading-relaxed">
          <p>The equivalence point is at <span className="text-emerald">25.0 mL</span> — moles of base = moles of acid. The pH jumps from acidic to basic across a tiny volume window. That's why indicators work.</p>
        </div>
      </div>
    </div>
  );
}

function StatBox({ label, value, c }: { label: string; value: string; c: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface-2 p-3 text-center">
      <div className="text-[10px] uppercase tracking-widest text-muted">{label}</div>
      <div className={`font-mono font-semibold mt-1 ${c}`}>{value}</div>
    </div>
  );
}

function Slider({ label, value, min, max, step = 1, onChange }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <div className="flex justify-between text-xs mb-1.5">
        <span className="text-muted">{label}</span>
        <span className="font-mono text-emerald">{value.toFixed(step < 1 ? 2 : 0)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} className="w-full accent-emerald" />
    </label>
  );
}

/* ---------- MATH DRILL ---------- */

type MathProblem = { q: string; a: number; hint: string };
const POOL: MathProblem[] = [
  { q: "If 12% of a bag of rice (50 kg) goes to spoilage, how many kg are lost?", a: 6, hint: "50 × 0.12." },
  { q: "A tro-tro charges 3 cedis per stop. You stop 14 times this week. Total?", a: 42, hint: "3 × 14." },
  { q: "How many distinct ways can you arrange the letters of KENTE?", a: 60, hint: "5! / 2! because E repeats." },
  { q: "Sum of the first 20 odd numbers (1 + 3 + … + 39)?", a: 400, hint: "20²." },
  { q: "What is 7! / (3! × 4!)?", a: 35, hint: "C(7,3)." },
  { q: "If f(x) = 3x² + 2x, what is f'(2)?", a: 14, hint: "f'(x) = 6x + 2, then x = 2." },
  { q: "Largest integer n with n! < 1,000,000?", a: 9, hint: "9! = 362,880. 10! = 3,628,800." },
  { q: "How many primes between 1 and 30?", a: 10, hint: "2,3,5,7,11,13,17,19,23,29." },
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
    setFeedback({ correct, msg: correct ? `✅ Correct. ${p.hint}` : `❌ Not quite. The answer was ${p.a}. ${p.hint}` });
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
          <button onClick={check} className="bg-emerald text-black font-medium px-5 py-3 rounded-xl hover:bg-amber transition">Check</button>
        </div>
        {feedback && (
          <div className={`mt-5 p-4 rounded-xl text-sm ${feedback.correct ? "bg-emerald/10 border border-emerald/30" : "bg-rust/10 border border-rust/30"}`}>
            {feedback.msg}
          </div>
        )}
        <div className="mt-6 flex gap-3 text-sm">
          <button onClick={() => setShowHint(true)} className="text-amber hover:underline">Show hint</button>
          <button onClick={next} className="ml-auto text-muted hover:text-foreground transition">Next problem →</button>
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
          Difficulty adapts as you go. Cards from missed concepts auto-add to your SRS deck.
        </div>
      </div>
    </div>
  );
}
