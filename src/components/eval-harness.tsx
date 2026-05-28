"use client";

import { useState } from "react";
import { useBuild, EvalTest, EvalRun } from "@/store/build";
import { Button, Input, Textarea, Badge } from "@/components/ui";
import { FlaskConical, Plus, Play, Zap, Trash2, ChevronDown, ChevronUp, TrendingUp, CheckCircle2, XCircle, Sparkles } from "lucide-react";

// Eval harness for an AI agent. Lives inside the Build Studio.
// Student:
//   1) Locks in a system prompt (the agent's "job description")
//   2) Writes N test cases — input + rubric + optional must-include
//   3) Runs them. Claude answers each one with the system prompt.
//      A second Claude call grades the answer against the rubric.
//   4) Sees pass/score/reasoning per test, history across iterations.
//
// This is the single biggest gap between "demo" and "shippable" agents.

export function EvalHarness({ projectId }: { projectId: string }) {
  const { projects, setEvalSystem, addEvalTest, updateEvalTest, removeEvalTest, appendEvalRun } = useBuild();
  const p = projects.find((x) => x.id === projectId);
  const ev = p?.eval;

  const [systemDraft, setSystemDraft] = useState(ev?.systemPrompt ?? "");
  const [systemEdit, setSystemEdit] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newTest, setNewTest] = useState<Omit<EvalTest, "id">>({ name: "", input: "", rubric: "", mustInclude: [] });
  const [runningId, setRunningId] = useState<string | null>(null);
  const [batchRunning, setBatchRunning] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  if (!p) return null;
  const tests = ev?.tests ?? [];
  const runs = ev?.runs ?? [];
  const sys = ev?.systemPrompt ?? "";

  const latestRunFor = (tid: string) => runs.find((r) => r.testId === tid);
  const passedCount = tests.filter((t) => latestRunFor(t.id)?.passed).length;
  const avgScore = (() => {
    const scores = tests.map((t) => latestRunFor(t.id)?.score).filter((x): x is number => typeof x === "number");
    if (scores.length === 0) return 0;
    return scores.reduce((s, n) => s + n, 0) / scores.length;
  })();

  async function runOne(test: EvalTest) {
    if (!sys) {
      alert("Set a system prompt first — your agent needs a job description before you can grade its work.");
      return;
    }
    setRunningId(test.id);
    try {
      const r1 = await fetch("/api/build/eval-run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ systemPrompt: sys, input: test.input }),
      });
      const { output } = await r1.json();
      const r2 = await fetch("/api/build/eval-judge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: test.input, output, rubric: test.rubric, mustInclude: test.mustInclude }),
      });
      const judged = await r2.json();
      appendEvalRun(projectId, {
        testId: test.id,
        ts: Date.now(),
        output,
        passed: !!judged.passed,
        score: Number(judged.score) || 0,
        reasoning: String(judged.reasoning || ""),
        systemUsed: sys,
      });
    } finally {
      setRunningId(null);
    }
  }

  async function runAll() {
    setBatchRunning(true);
    try {
      for (const t of tests) {
        await runOne(t);
      }
    } finally {
      setBatchRunning(false);
    }
  }

  async function suggestTests() {
    if (!p) return;
    const proj = p;
    setGenerating(true);
    try {
      const res = await fetch("/api/build/eval-suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ systemPrompt: sys, projectName: proj.name, description: proj.description }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.tests)) {
        for (const t of data.tests) {
          addEvalTest(projectId, { name: t.name, input: t.input, rubric: t.rubric, mustInclude: t.mustInclude ?? [] });
        }
      }
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto p-4 space-y-4">
      {/* System prompt block */}
      <div className="rounded-2xl border border-border bg-surface-2/40 p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <FlaskConical className="size-4 text-emerald" />
            <h3 className="font-medium text-sm">Agent system prompt</h3>
          </div>
          {!systemEdit && sys && <button onClick={() => setSystemEdit(true)} className="text-xs text-muted hover:text-foreground">Edit</button>}
        </div>
        {systemEdit || !sys ? (
          <>
            <Textarea
              placeholder="You are SankofaTriage, a clinical triage assistant for rural clinics in Ghana. You speak plain English and Twi when asked. GOAL: ... TOOLS: ..."
              value={systemDraft}
              onChange={(e) => setSystemDraft(e.target.value)}
              rows={6}
              className="text-xs font-[family-name:var(--font-mono)]"
            />
            <div className="mt-2 flex gap-2 justify-end">
              <Button size="sm" variant="ghost" onClick={() => { setSystemDraft(sys); setSystemEdit(false); }}>Cancel</Button>
              <Button size="sm" onClick={() => { setEvalSystem(projectId, systemDraft.trim()); setSystemEdit(false); }} disabled={!systemDraft.trim()}>Save prompt</Button>
            </div>
          </>
        ) : (
          <pre className="text-xs text-muted whitespace-pre-wrap leading-relaxed font-[family-name:var(--font-mono)] max-h-32 overflow-y-auto">{sys}</pre>
        )}
      </div>

      {/* Score summary */}
      {tests.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl border border-emerald/30 bg-emerald/5 p-3">
            <div className="text-[10px] uppercase tracking-widest text-muted">Passing</div>
            <div className="text-lg font-[family-name:var(--font-display)] font-semibold text-emerald">{passedCount}/{tests.length}</div>
          </div>
          <div className="rounded-xl border border-amber/30 bg-amber/5 p-3">
            <div className="text-[10px] uppercase tracking-widest text-muted">Avg score</div>
            <div className="text-lg font-[family-name:var(--font-display)] font-semibold text-amber">{avgScore.toFixed(1)}/10</div>
          </div>
          <div className="rounded-xl border border-border bg-surface-2/40 p-3">
            <div className="text-[10px] uppercase tracking-widest text-muted">Runs total</div>
            <div className="text-lg font-[family-name:var(--font-display)] font-semibold">{runs.length}</div>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button size="sm" onClick={() => setAdding(true)} disabled={!sys}><Plus className="size-3" /> New test</Button>
        <Button size="sm" variant="secondary" onClick={suggestTests} disabled={!sys || generating}><Sparkles className={`size-3 ${generating ? "animate-pulse" : ""}`} /> {generating ? "Drafting…" : "AI-suggest tests"}</Button>
        <Button size="sm" variant="secondary" onClick={runAll} disabled={!sys || tests.length === 0 || batchRunning}>
          <Play className="size-3" /> {batchRunning ? "Running…" : `Run all (${tests.length})`}
        </Button>
      </div>

      {/* Add test inline */}
      {adding && (
        <div className="rounded-2xl border border-emerald/40 bg-emerald/5 p-4 space-y-3">
          <div className="text-xs uppercase tracking-widest text-emerald">New test case</div>
          <Input placeholder="Name (optional): 'Emergency case'" value={newTest.name ?? ""} onChange={(e) => setNewTest({ ...newTest, name: e.target.value })} />
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted mb-1">User input</div>
            <Textarea placeholder="My 4-year-old has had high fever for 2 days and is now confused." value={newTest.input} onChange={(e) => setNewTest({ ...newTest, input: e.target.value })} rows={3} />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted mb-1">Pass rubric</div>
            <Textarea placeholder="Must escalate to hospital-now. Must NOT recommend home care. Should mention seeking immediate medical attention." value={newTest.rubric} onChange={(e) => setNewTest({ ...newTest, rubric: e.target.value })} rows={3} />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted mb-1">Must include (comma-separated, optional)</div>
            <Input placeholder="hospital, urgent" value={(newTest.mustInclude ?? []).join(", ")} onChange={(e) => setNewTest({ ...newTest, mustInclude: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />
          </div>
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setNewTest({ name: "", input: "", rubric: "", mustInclude: [] }); }}>Cancel</Button>
            <Button size="sm" onClick={() => {
              if (!newTest.input.trim() || !newTest.rubric.trim()) return;
              addEvalTest(projectId, newTest);
              setNewTest({ name: "", input: "", rubric: "", mustInclude: [] });
              setAdding(false);
            }} disabled={!newTest.input.trim() || !newTest.rubric.trim()}>Add test</Button>
          </div>
        </div>
      )}

      {/* Test list */}
      {tests.length === 0 && !adding ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center">
          <FlaskConical className="size-8 text-muted mx-auto mb-3" />
          <div className="text-sm font-medium mb-1">No tests yet</div>
          <p className="text-xs text-muted max-w-sm mx-auto leading-relaxed">
            Write 5-10 inputs your agent should handle correctly — including the tricky ones (ambiguity, refusal cases, edge cases). Tap <span className="text-emerald">AI-suggest</span> for a starter set.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {tests.map((t) => {
            const latest = latestRunFor(t.id);
            const history = runs.filter((r) => r.testId === t.id).slice(0, 5);
            const open = expanded === t.id;
            return (
              <div key={t.id} className="rounded-2xl border border-border bg-surface-2/30">
                <div className="px-4 py-3 flex items-center justify-between gap-3">
                  <button onClick={() => setExpanded(open ? null : t.id)} className="flex-1 min-w-0 text-left flex items-center gap-2">
                    {latest ? (
                      latest.passed ? <CheckCircle2 className="size-4 text-emerald shrink-0" /> : <XCircle className="size-4 text-rust shrink-0" />
                    ) : (
                      <span className="size-4 rounded-full border border-border shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{t.name || t.input.slice(0, 80)}</div>
                      <div className="text-[10px] text-muted truncate">{t.rubric.slice(0, 80)}{t.rubric.length > 80 ? "…" : ""}</div>
                    </div>
                    {latest && <Badge color={latest.score >= 7 ? "emerald" : latest.score >= 4 ? "amber" : "rust"}>{latest.score.toFixed(1)}</Badge>}
                    {open ? <ChevronUp className="size-3.5 text-muted" /> : <ChevronDown className="size-3.5 text-muted" />}
                  </button>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => runOne(t)} disabled={runningId === t.id || batchRunning} className="size-7 rounded-md hover:bg-surface-2 text-muted hover:text-emerald flex items-center justify-center disabled:opacity-50" title="Run this test">
                      {runningId === t.id ? <Zap className="size-3.5 animate-pulse text-amber" /> : <Play className="size-3.5" />}
                    </button>
                    <button onClick={() => removeEvalTest(projectId, t.id)} className="size-7 rounded-md hover:bg-surface-2 text-muted hover:text-rust flex items-center justify-center" title="Delete">
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
                {open && (
                  <div className="border-t border-border px-4 py-3 space-y-3 text-xs">
                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-muted mb-1">Input</div>
                      <div className="text-foreground/90 whitespace-pre-wrap leading-relaxed">{t.input}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-muted mb-1">Rubric</div>
                      <div className="text-foreground/90 whitespace-pre-wrap leading-relaxed">{t.rubric}</div>
                    </div>
                    {latest ? (
                      <>
                        <div>
                          <div className="text-[10px] uppercase tracking-widest text-muted mb-1">Latest output</div>
                          <pre className="text-foreground/90 whitespace-pre-wrap leading-relaxed bg-[#06100d] border border-border rounded-lg p-3 max-h-40 overflow-y-auto">{latest.output}</pre>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-widest text-muted mb-1">Judge reasoning</div>
                          <div className="italic text-muted">{latest.reasoning}</div>
                        </div>
                        {history.length > 1 && (
                          <div>
                            <div className="text-[10px] uppercase tracking-widest text-muted mb-1 flex items-center gap-1"><TrendingUp className="size-2.5" /> History</div>
                            <div className="flex gap-1.5">
                              {history.map((r) => (
                                <div key={r.id} className={`text-[10px] px-2 py-0.5 rounded font-mono ${r.passed ? "bg-emerald/10 text-emerald" : "bg-rust/10 text-rust"}`} title={new Date(r.ts).toLocaleString()}>
                                  {r.score.toFixed(1)}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="text-muted italic">Not run yet. Tap the play icon.</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
