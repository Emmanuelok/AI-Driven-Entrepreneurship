"use client";

import { use, useEffect, useState } from "react";
import { notFound } from "next/navigation";
import { useStore } from "@/store";
import { Card, Button, Input, Textarea, Badge, EmptyState } from "@/components/ui";
import { Target, Plus, Calendar, Trash2, Save, ChevronDown, ChevronUp } from "lucide-react";

type KR = { id: string; kr: string; targetValue: number; currentValue: number; unit: string };
type OKR = { quarter: string; objective: string; keyResults: KR[] };
type Review = { id: string; weekOf: string; did: string; planned: string; blockers: string; learnings: string };

function currentQuarter() {
  const d = new Date();
  return `${d.getFullYear()}-Q${Math.ceil((d.getMonth() + 1) / 3)}`;
}

function monday(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().slice(0, 10);
}

export default function OkrsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { ventures, updateVenture } = useStore();
  const found = ventures.find((x) => x.id === id);

  const [okrs, setOkrs] = useState<OKR[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [newReview, setNewReview] = useState<Review>({ id: "", weekOf: monday(), did: "", planned: "", blockers: "", learnings: "" });
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (!found) return;
    setOkrs(found.okrs ?? []);
    setReviews(found.weeklyReviews ?? []);
  }, [found?.id]);

  if (!found) { notFound(); return null; }
  const v = found;

  function save() { updateVenture(v.id, { okrs, weeklyReviews: reviews }); }

  function addOkr() {
    setOkrs([...okrs, { quarter: currentQuarter(), objective: "", keyResults: [] }]);
  }
  function setOkr(idx: number, patch: Partial<OKR>) {
    setOkrs(okrs.map((o, i) => (i === idx ? { ...o, ...patch } : o)));
  }
  function removeOkr(idx: number) { setOkrs(okrs.filter((_, i) => i !== idx)); }

  function addKr(idx: number) {
    setOkr(idx, { keyResults: [...okrs[idx].keyResults, { id: Math.random().toString(36).slice(2, 8), kr: "", targetValue: 100, currentValue: 0, unit: "%" }] });
  }
  function setKr(idx: number, krId: string, patch: Partial<KR>) {
    setOkr(idx, { keyResults: okrs[idx].keyResults.map((k) => (k.id === krId ? { ...k, ...patch } : k)) });
  }
  function removeKr(idx: number, krId: string) {
    setOkr(idx, { keyResults: okrs[idx].keyResults.filter((k) => k.id !== krId) });
  }

  function addReview() {
    if (!newReview.did.trim() && !newReview.planned.trim()) return;
    const r = { ...newReview, id: Math.random().toString(36).slice(2, 8) };
    setReviews([r, ...reviews]);
    setNewReview({ id: "", weekOf: monday(), did: "", planned: "", blockers: "", learnings: "" });
  }
  function removeReview(rid: string) { setReviews(reviews.filter((r) => r.id !== rid)); }

  const progress = (o: OKR) => {
    if (o.keyResults.length === 0) return 0;
    return o.keyResults.reduce((s, k) => s + Math.min(100, (k.currentValue / Math.max(1, k.targetValue)) * 100), 0) / o.keyResults.length;
  };

  return (
    <div className="max-w-6xl mx-auto px-5 sm:px-8 py-10 space-y-6">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-emerald mb-1 flex items-center gap-1.5">
            <Target className="size-3.5" /> Strategic alignment
          </p>
          <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold">OKRs & Weekly Reviews</h2>
          <p className="text-sm text-muted mt-1 max-w-2xl">
            Quarterly objectives that are ambitious but trackable. Weekly reviews that catch drift before it&apos;s expensive.
          </p>
        </div>
        <Button onClick={save}><Save className="size-4" /> Save</Button>
      </header>

      {/* OKRs */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium">This quarter — {currentQuarter()}</h3>
          <Button size="sm" variant="secondary" onClick={addOkr}><Plus className="size-3" /> Add objective</Button>
        </div>

        {okrs.length === 0 ? (
          <EmptyState icon={Target} title="No OKRs yet" body="One objective, 3-5 key results. Make the objective directional and the KRs numeric." action={<Button onClick={addOkr}><Plus className="size-4" /> First objective</Button>} />
        ) : (
          <div className="space-y-3">
            {okrs.map((o, idx) => (
              <Card key={idx} className="p-5">
                <div className="flex items-center gap-3 mb-4">
                  <Input value={o.quarter} onChange={(e) => setOkr(idx, { quarter: e.target.value })} className="max-w-[120px] font-mono text-xs" />
                  <Input value={o.objective} onChange={(e) => setOkr(idx, { objective: e.target.value })} placeholder="e.g. Reach product-market fit signal in maize-belt segment" className="flex-1" />
                  <Badge color={progress(o) >= 70 ? "emerald" : progress(o) >= 40 ? "amber" : "rust"}>{progress(o).toFixed(0)}%</Badge>
                  <button onClick={() => removeOkr(idx)} className="text-muted hover:text-rust"><Trash2 className="size-4" /></button>
                </div>

                <div className="space-y-2 mb-3">
                  {o.keyResults.map((k) => {
                    const pct = Math.min(100, (k.currentValue / Math.max(1, k.targetValue)) * 100);
                    return (
                      <div key={k.id} className="grid grid-cols-12 gap-2 items-center">
                        <div className="col-span-12 sm:col-span-5">
                          <Input value={k.kr} onChange={(e) => setKr(idx, k.id, { kr: e.target.value })} placeholder="KR: e.g. 20 paying customers" />
                        </div>
                        <div className="col-span-4 sm:col-span-2">
                          <Input type="number" value={k.currentValue} onChange={(e) => setKr(idx, k.id, { currentValue: parseFloat(e.target.value) || 0 })} />
                        </div>
                        <div className="col-span-4 sm:col-span-1 text-center text-xs text-muted">of</div>
                        <div className="col-span-4 sm:col-span-2">
                          <Input type="number" value={k.targetValue} onChange={(e) => setKr(idx, k.id, { targetValue: parseFloat(e.target.value) || 0 })} />
                        </div>
                        <div className="col-span-8 sm:col-span-1">
                          <Input value={k.unit} onChange={(e) => setKr(idx, k.id, { unit: e.target.value })} placeholder="unit" />
                        </div>
                        <div className="col-span-3 sm:col-span-1 flex items-center gap-1">
                          <div className="flex-1 h-2 bg-surface-2 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${pct >= 70 ? "bg-emerald" : pct >= 40 ? "bg-amber" : "bg-rust"}`} style={{ width: `${pct}%` }} />
                          </div>
                          <button onClick={() => removeKr(idx, k.id)} className="text-muted hover:text-rust"><Trash2 className="size-3" /></button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <Button size="sm" variant="ghost" onClick={() => addKr(idx)}><Plus className="size-3" /> Key result</Button>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Weekly Review */}
      <Card className="p-6">
        <h3 className="font-medium mb-4 flex items-center gap-2"><Calendar className="size-4 text-emerald" /> Weekly review</h3>
        <div className="grid sm:grid-cols-2 gap-3 mb-3">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted mb-1">Week of</div>
            <Input type="date" value={newReview.weekOf} onChange={(e) => setNewReview({ ...newReview, weekOf: e.target.value })} />
          </div>
          <div className="flex items-end">
            <Button onClick={addReview} className="ml-auto"><Plus className="size-3" /> Log review</Button>
          </div>
          <Textarea placeholder="What did I actually do this week?" value={newReview.did} onChange={(e) => setNewReview({ ...newReview, did: e.target.value })} rows={3} />
          <Textarea placeholder="What did I plan but not do? Why?" value={newReview.planned} onChange={(e) => setNewReview({ ...newReview, planned: e.target.value })} rows={3} />
          <Textarea placeholder="What's blocking me?" value={newReview.blockers} onChange={(e) => setNewReview({ ...newReview, blockers: e.target.value })} rows={3} />
          <Textarea placeholder="What did I learn — about customers, the market, myself?" value={newReview.learnings} onChange={(e) => setNewReview({ ...newReview, learnings: e.target.value })} rows={3} />
        </div>
      </Card>

      {/* Review history */}
      {reviews.length > 0 && (
        <Card className="p-6">
          <h3 className="font-medium mb-4">Past reviews</h3>
          <div className="space-y-2">
            {reviews.map((r) => {
              const open = expanded === r.id;
              return (
                <div key={r.id} className="border border-border rounded-xl">
                  <button onClick={() => setExpanded(open ? null : r.id)} className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-surface-2/40 transition">
                    <div className="font-medium text-sm">Week of {r.weekOf}</div>
                    <div className="flex items-center gap-2">
                      <button onClick={(e) => { e.stopPropagation(); removeReview(r.id); }} className="text-muted hover:text-rust"><Trash2 className="size-3" /></button>
                      {open ? <ChevronUp className="size-4 text-muted" /> : <ChevronDown className="size-4 text-muted" />}
                    </div>
                  </button>
                  {open && (
                    <div className="px-4 pb-4 space-y-2 text-sm">
                      {r.did && <div><strong className="text-emerald text-xs uppercase tracking-widest block mb-1">Did</strong>{r.did}</div>}
                      {r.planned && <div><strong className="text-amber text-xs uppercase tracking-widest block mb-1">Planned but didn&apos;t</strong>{r.planned}</div>}
                      {r.blockers && <div><strong className="text-rust text-xs uppercase tracking-widest block mb-1">Blockers</strong>{r.blockers}</div>}
                      {r.learnings && <div><strong className="text-indigo text-xs uppercase tracking-widest block mb-1">Learnings</strong>{r.learnings}</div>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
