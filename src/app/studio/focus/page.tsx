"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useMe } from "@/store/me";
import { Card, Button, Input, Badge } from "@/components/ui";
import { Play, Pause, Square, ArrowLeft, Sparkles, Brain, Timer } from "lucide-react";

const DURATIONS = [10, 25, 45, 60, 90];

export default function FocusPage() {
  const { startFocus, endFocus, focusSessions } = useMe();
  const [task, setTask] = useState("");
  const [duration, setDuration] = useState(25);
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const startTime = useRef(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  function begin() {
    if (!task.trim()) return;
    const id = startFocus(task, duration);
    setSessionId(id);
    setRunning(true); setPaused(false); setElapsedMs(0);
    startTime.current = Date.now();
    intervalRef.current = setInterval(() => {
      setElapsedMs(Date.now() - startTime.current);
    }, 100);
  }
  function pause() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setPaused(true);
  }
  function resume() {
    startTime.current = Date.now() - elapsedMs;
    intervalRef.current = setInterval(() => setElapsedMs(Date.now() - startTime.current), 100);
    setPaused(false);
  }
  function finish() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (sessionId) endFocus(sessionId, elapsedMs >= duration * 60 * 1000);
    setRunning(false); setPaused(false); setSessionId(null); setElapsedMs(0); setTask("");
  }

  const totalMs = duration * 60 * 1000;
  const remaining = Math.max(0, totalMs - elapsedMs);
  const pct = Math.min(1, elapsedMs / totalMs);
  const min = Math.floor(remaining / 60000);
  const sec = Math.floor((remaining % 60000) / 1000);
  const done = pct >= 1;

  if (done && running) {
    // auto-end on done
    finish();
  }

  const recentSessions = focusSessions.slice(0, 6);

  return (
    <div className="max-w-4xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <Link href="/studio" className="text-sm text-muted hover:text-foreground inline-flex items-center gap-1.5 mb-6"><ArrowLeft className="size-3.5" /> Dashboard</Link>

      <div className="mb-8">
        <p className="text-xs uppercase tracking-[0.22em] text-emerald mb-2 flex items-center gap-1.5"><Timer className="size-3.5" /> Focus mode</p>
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight">Make this hour matter.</h1>
        <p className="mt-2 text-muted max-w-xl">Pick one task. Set a clock. The studio gets out of your way. Sage is available if you get stuck.</p>
      </div>

      {!running ? (
        <Card className="p-8">
          <div>
            <div className="text-xs uppercase tracking-widest text-muted mb-1.5">What are you focusing on?</div>
            <Input placeholder="e.g. Draft customer interview script for your venture" value={task} onChange={(e) => setTask(e.target.value)} />
          </div>
          <div className="mt-5">
            <div className="text-xs uppercase tracking-widest text-muted mb-2">Duration</div>
            <div className="flex gap-2 flex-wrap">
              {DURATIONS.map((d) => (
                <button key={d} onClick={() => setDuration(d)} className={`px-4 py-2 rounded-xl text-sm transition ${duration === d ? "bg-emerald text-black font-medium" : "border border-border hover:bg-surface-2"}`}>
                  {d} min
                </button>
              ))}
            </div>
          </div>
          <Button onClick={begin} disabled={!task.trim()} className="mt-6" size="lg">
            <Play className="size-4" /> Start focus
          </Button>
        </Card>
      ) : (
        <Card className="p-12 text-center relative overflow-hidden">
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute inset-0 bg-gradient-to-br from-emerald/10 via-transparent to-amber/10" />
          </div>
          <div className="relative">
            <div className="text-xs uppercase tracking-widest text-amber mb-3">Focusing on</div>
            <div className="text-2xl font-[family-name:var(--font-display)] font-semibold mb-8">{task}</div>

            {/* Big timer ring */}
            <div className="relative size-64 mx-auto">
              <svg viewBox="0 0 200 200" className="w-full h-full -rotate-90">
                <circle cx="100" cy="100" r="90" fill="none" stroke="rgba(231,239,233,0.1)" strokeWidth="8" />
                <circle
                  cx="100" cy="100" r="90" fill="none"
                  stroke="url(#focusGrad)" strokeWidth="8"
                  strokeLinecap="round" strokeDasharray={`${pct * 565.5} 565.5`}
                />
                <defs>
                  <linearGradient id="focusGrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#2cc295" />
                    <stop offset="100%" stopColor="#f4a949" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="font-mono text-5xl font-semibold">{String(min).padStart(2, "0")}:{String(sec).padStart(2, "0")}</div>
                <div className="text-xs text-muted mt-2">{paused ? "Paused" : "of " + duration + " min"}</div>
              </div>
            </div>

            <div className="mt-8 flex gap-3 justify-center">
              {!paused ? (
                <Button variant="secondary" onClick={pause}><Pause className="size-4" /> Pause</Button>
              ) : (
                <Button onClick={resume}><Play className="size-4" /> Resume</Button>
              )}
              <Button variant="danger" onClick={finish}><Square className="size-4" /> End</Button>
            </div>

            <p className="text-xs text-muted mt-6">Tip: open the Companion (⌘J) if you get stuck. It still works here.</p>
          </div>
        </Card>
      )}

      {recentSessions.length > 0 && (
        <Card className="mt-6 p-5">
          <h3 className="font-medium mb-3 flex items-center gap-2"><Brain className="size-4 text-emerald" /> Recent focus sessions</h3>
          <div className="space-y-1">
            {recentSessions.map((s) => (
              <div key={s.id} className="flex items-center justify-between p-2 rounded hover:bg-surface-2 transition text-sm">
                <div className="flex items-center gap-3">
                  <Badge color={s.completed ? "emerald" : "amber"}>{s.completed ? "Completed" : "Stopped"}</Badge>
                  <span>{s.task}</span>
                </div>
                <div className="text-xs text-muted">{s.durationMin}m</div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
