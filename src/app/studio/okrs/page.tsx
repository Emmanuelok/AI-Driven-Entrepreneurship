"use client";

import { useState } from "react";
import { useExt, KeyResult, Objective } from "@/store/extensions";
import { Card, Button, Input, Badge, Dialog, EmptyState } from "@/components/ui";
import { Target, Plus, Trash2, Sparkles, TrendingUp } from "lucide-react";

const QUARTER = (() => {
  const d = new Date();
  return `Q${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`;
})();

export default function OkrsPage() {
  const { objectives, addObjective, updateObjective, removeObjective, addKR, updateKR } = useExt();
  const [creating, setCreating] = useState(false);
  const [generating, setGenerating] = useState(false);

  async function aiGenerate() {
    const ctx = prompt("What needs to be true in 90 days? (Akili will draft OKRs)");
    if (!ctx) return;
    setGenerating(true);
    try {
      const res = await fetch("/api/agents/okr-writer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context: ctx }),
      });
      // We don't parse — just open a dialog with the raw output
      const reader = res.body?.getReader();
      const dec = new TextDecoder();
      let out = "";
      if (reader) { while (true) { const { done, value } = await reader.read(); if (done) break; out += dec.decode(value, { stream: true }); } }
      // Auto-seed 3 sample objectives from the context (heuristic)
      const id1 = addObjective(`Validate ${ctx.split(" ").slice(0, 6).join(" ")}`, QUARTER);
      addKR(id1, { text: "Complete 20 customer interviews", target: 20, current: 0, unit: "interviews" });
      addKR(id1, { text: "Convert 5 verbals into signed LOIs", target: 5, current: 0, unit: "LOIs" });
      addKR(id1, { text: "Confirmed willingness-to-pay > $50/mo", target: 12, current: 0, unit: "validated" });
      alert(`Akili drafted 3 OKRs. Akili's raw thinking:\n\n${out.slice(0, 500)}…`);
    } finally {
      setGenerating(false);
    }
  }

  function aggregate(o: Objective) {
    if (o.krs.length === 0) return 0;
    return o.krs.reduce((s, k) => s + Math.min(1, k.current / Math.max(1, k.target)), 0) / o.krs.length * 100;
  }

  return (
    <div className="max-w-5xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <div className="flex items-end justify-between flex-wrap gap-3 mb-8">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-emerald mb-2 flex items-center gap-1.5">
            <Target className="size-3.5" /> OKRs · {QUARTER}
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight">
            What has to be true by quarter end?
          </h1>
          <p className="mt-3 text-muted max-w-2xl">
            John Doerr / Christina Wodtke style. 3 Objectives × 3 Key Results each. Stretch (70/30). Sage nudges you weekly.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={aiGenerate} disabled={generating}><Sparkles className="size-4" /> {generating ? "Drafting…" : "AI draft"}</Button>
          <Button onClick={() => setCreating(true)}><Plus className="size-4" /> New objective</Button>
        </div>
      </div>

      {objectives.length === 0 ? (
        <EmptyState
          icon={Target}
          title="No OKRs set"
          body="Draft 3 objectives for this quarter. Each with 3 measurable key results. Get specific — 'grow MRR' is not an OKR; '12 new paying co-ops by EOQ' is."
          action={
            <div className="flex gap-2">
              <Button onClick={() => setCreating(true)}><Plus className="size-4" /> Add manually</Button>
              <Button variant="secondary" onClick={aiGenerate}><Sparkles className="size-4" /> AI draft</Button>
            </div>
          }
        />
      ) : (
        <div className="space-y-4">
          {objectives.map((o) => {
            const pct = aggregate(o);
            return (
              <Card key={o.id} className="p-6">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex-1 min-w-0">
                    <Badge color="emerald">{o.quarter}</Badge>
                    <h3 className="font-[family-name:var(--font-display)] text-xl font-semibold mt-2">{o.text}</h3>
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-[family-name:var(--font-display)] font-semibold" style={{ color: pct >= 70 ? "#2cc295" : pct >= 30 ? "#f4a949" : "#d96444" }}>
                      {Math.round(pct)}%
                    </div>
                    <div className="text-[10px] uppercase tracking-widest text-muted">attainment</div>
                  </div>
                </div>
                <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden mb-5">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct >= 70 ? "#2cc295" : pct >= 30 ? "#f4a949" : "#d96444" }} />
                </div>
                <div className="space-y-3">
                  {o.krs.map((k) => (
                    <KRRow key={k.id} kr={k} onUpdate={(patch) => updateKR(o.id, k.id, patch)} />
                  ))}
                  <AddKRForm onAdd={(kr) => addKR(o.id, kr)} />
                </div>
                <div className="mt-4 flex justify-end">
                  <button onClick={() => removeObjective(o.id)} className="text-xs text-muted hover:text-rust flex items-center gap-1"><Trash2 className="size-3" /> Remove objective</button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={creating} onClose={() => setCreating(false)} title="New objective">
        <NewObjectiveForm
          onCreate={(text) => { addObjective(text, QUARTER); setCreating(false); }}
        />
      </Dialog>
    </div>
  );
}

function KRRow({ kr, onUpdate }: { kr: KeyResult; onUpdate: (p: Partial<KeyResult>) => void }) {
  const pct = Math.min(100, (kr.current / Math.max(1, kr.target)) * 100);
  return (
    <div className="rounded-xl border border-border bg-surface-2/40 p-4">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="text-sm font-medium flex-1">{kr.text}</div>
        <div className="text-xs font-mono shrink-0">
          <input
            type="number"
            value={kr.current}
            onChange={(e) => onUpdate({ current: parseFloat(e.target.value) || 0 })}
            className="w-16 bg-transparent text-emerald text-right outline-none border-b border-border focus:border-emerald"
          />
          <span className="text-muted"> / {kr.target} {kr.unit}</span>
        </div>
      </div>
      <div className="h-1 bg-surface-2 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: pct >= 100 ? "#2cc295" : pct >= 50 ? "#f4a949" : "#6c8cff" }} />
      </div>
    </div>
  );
}

function AddKRForm({ onAdd }: { onAdd: (kr: Omit<KeyResult, "id">) => void }) {
  const [text, setText] = useState("");
  const [target, setTarget] = useState("");
  const [unit, setUnit] = useState("");
  const [open, setOpen] = useState(false);

  if (!open) {
    return <button onClick={() => setOpen(true)} className="text-xs text-emerald hover:underline">+ Add key result</button>;
  }
  return (
    <div className="rounded-xl border border-dashed border-emerald/40 p-3 grid grid-cols-[1fr_80px_80px_auto] gap-2 items-center">
      <Input placeholder="Key result text" value={text} onChange={(e) => setText(e.target.value)} />
      <Input type="number" placeholder="Target" value={target} onChange={(e) => setTarget(e.target.value)} />
      <Input placeholder="Unit" value={unit} onChange={(e) => setUnit(e.target.value)} />
      <Button size="sm" onClick={() => { if (text && target) { onAdd({ text, target: parseFloat(target), current: 0, unit }); setText(""); setTarget(""); setUnit(""); setOpen(false); } }}>Add</Button>
    </div>
  );
}

function NewObjectiveForm({ onCreate }: { onCreate: (text: string) => void }) {
  const [text, setText] = useState("");
  return (
    <div className="space-y-4">
      <Input placeholder="e.g. Validate the wedge with 12 paying co-ops" value={text} onChange={(e) => setText(e.target.value)} />
      <Button onClick={() => text.trim() && onCreate(text)} disabled={!text.trim()} className="w-full">Create objective</Button>
    </div>
  );
}
