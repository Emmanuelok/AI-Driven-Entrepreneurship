"use client";

import { use, useMemo, useState } from "react";
import { notFound } from "next/navigation";
import { useStore } from "@/store";
import { Card, Button, Input, EmptyState, Badge } from "@/components/ui";
import { Wrench, Plus, CheckCircle2, Circle, Calendar, Trash2, GripVertical, Clock, AlertTriangle } from "lucide-react";

type Status = "todo" | "doing" | "done";
type Task = { id: string; title: string; done: boolean; due?: string; status?: Status };

const LANES: { id: Status; label: string; color: "muted" | "amber" | "emerald"; tone: string }[] = [
  { id: "todo", label: "To do", color: "muted", tone: "border-border" },
  { id: "doing", label: "In progress", color: "amber", tone: "border-amber/40" },
  { id: "done", label: "Shipped", color: "emerald", tone: "border-emerald/40" },
];

function statusOf(t: Task): Status {
  if (t.status) return t.status;
  return t.done ? "done" : "todo";
}

export default function MvpPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { ventures, updateVenture, addMvpTask } = useStore();
  const [newTask, setNewTask] = useState("");
  const [newDue, setNewDue] = useState("");
  const [newLane, setNewLane] = useState<Status>("todo");
  const [drag, setDrag] = useState<string | null>(null);
  const found = ventures.find((x) => x.id === id);

  const tasks = useMemo<Task[]>(() => (found?.mvpTasks ?? []) as Task[], [found?.mvpTasks]);

  if (!found) { notFound(); return null; }
  const v = found;

  function setLane(taskId: string, lane: Status) {
    const next = tasks.map((t) => (t.id === taskId ? { ...t, status: lane, done: lane === "done" } : t));
    updateVenture(v.id, { mvpTasks: next });
  }

  function remove(taskId: string) {
    updateVenture(v.id, { mvpTasks: tasks.filter((t) => t.id !== taskId) });
  }

  function add() {
    if (!newTask.trim()) return;
    addMvpTask(v.id, newTask, newDue || undefined);
    // Default new task to chosen lane (addMvpTask defaults to todo with status=undefined → behaves as todo)
    if (newLane !== "todo") {
      const latest = (useStore.getState().ventures.find((x) => x.id === v.id)?.mvpTasks ?? []) as Task[];
      const created = latest[latest.length - 1];
      if (created) setLane(created.id, newLane);
    }
    setNewTask("");
    setNewDue("");
  }

  const byLane = (lane: Status) => tasks.filter((t) => statusOf(t) === lane);
  const done = byLane("done");
  const total = tasks.length;
  const wipCount = byLane("doing").length;
  const overdue = tasks.filter((t) => t.due && new Date(t.due) < new Date() && statusOf(t) !== "done");

  return (
    <div className="max-w-7xl mx-auto px-5 sm:px-8 py-10 space-y-6">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-amber mb-1 flex items-center gap-1.5">
            <Wrench className="size-3.5" /> Phase 3 — Build the MVP
          </p>
          <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold">{done.length} of {total} shipped</h2>
          <div className="mt-2 flex flex-wrap gap-3 text-xs">
            <Badge color={wipCount > 3 ? "rust" : "amber"}>WIP {wipCount}{wipCount > 3 ? " — too much, focus" : ""}</Badge>
            {overdue.length > 0 && <Badge color="rust"><AlertTriangle className="size-3" /> {overdue.length} overdue</Badge>}
            <span className="text-muted flex items-center gap-1"><Clock className="size-3" /> If MVP &gt; 7 days, scope is wrong</span>
          </div>
          <div className="mt-3 h-2 bg-surface-2 rounded-full overflow-hidden max-w-md">
            <div className="h-full bg-gradient-to-r from-emerald to-amber transition-all" style={{ width: `${total ? (done.length / total) * 100 : 0}%` }} />
          </div>
        </div>
      </header>

      <Card className="p-4 flex gap-2 items-end flex-wrap">
        <div className="flex-1 min-w-[220px]">
          <div className="text-[10px] uppercase tracking-widest text-muted mb-1">New task</div>
          <Input placeholder="Wire MoMo callback to /api/pay" value={newTask} onChange={(e) => setNewTask(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted mb-1">Due</div>
          <Input type="date" value={newDue} onChange={(e) => setNewDue(e.target.value)} />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted mb-1">Lane</div>
          <select value={newLane} onChange={(e) => setNewLane(e.target.value as Status)} className="bg-surface-2 border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-emerald">
            {LANES.map((l) => (<option key={l.id} value={l.id}>{l.label}</option>))}
          </select>
        </div>
        <Button onClick={add} disabled={!newTask.trim()}><Plus className="size-4" /> Add</Button>
      </Card>

      {tasks.length === 0 ? (
        <EmptyState icon={Wrench} title="Empty board" body="Break the MVP into shippable units. Each card ≤ 2 days of work. If a card feels bigger, split it." />
      ) : (
        <div className="grid lg:grid-cols-3 gap-4">
          {LANES.map((lane) => {
            const items = byLane(lane.id);
            return (
              <div
                key={lane.id}
                onDragOver={(e) => { e.preventDefault(); }}
                onDrop={() => { if (drag) { setLane(drag, lane.id); setDrag(null); } }}
                className={`rounded-2xl border ${lane.tone} bg-surface-2/30 p-3 min-h-[300px]`}
              >
                <div className="flex items-center justify-between mb-3 px-1">
                  <div className="flex items-center gap-2">
                    <Badge color={lane.color}>{lane.label}</Badge>
                    <span className="text-xs text-muted">{items.length}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  {items.map((t) => (
                    <div
                      key={t.id}
                      draggable
                      onDragStart={() => setDrag(t.id)}
                      onDragEnd={() => setDrag(null)}
                      className={`group rounded-xl border border-border bg-surface p-3 cursor-grab active:cursor-grabbing ${drag === t.id ? "opacity-40" : ""} ${lane.id === "done" ? "opacity-70" : ""}`}
                    >
                      <div className="flex items-start gap-2">
                        <GripVertical className="size-3.5 text-muted shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className={`text-sm leading-snug ${lane.id === "done" ? "line-through text-muted" : ""}`}>{t.title}</div>
                          <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                            {t.due && (
                              <span className={`text-[10px] flex items-center gap-1 ${new Date(t.due) < new Date() && lane.id !== "done" ? "text-rust" : "text-muted"}`}>
                                <Calendar className="size-2.5" />{t.due}
                              </span>
                            )}
                            <div className="flex gap-1 ml-auto opacity-0 group-hover:opacity-100 transition">
                              {LANES.filter((l) => l.id !== lane.id).map((l) => (
                                <button key={l.id} onClick={() => setLane(t.id, l.id)} className="text-[10px] px-1.5 py-0.5 rounded border border-border text-muted hover:text-foreground hover:border-emerald/50">
                                  → {l.label.split(" ")[0]}
                                </button>
                              ))}
                              <button onClick={() => remove(t.id)} className="text-muted hover:text-rust"><Trash2 className="size-3" /></button>
                            </div>
                          </div>
                        </div>
                        {lane.id === "done" ? <CheckCircle2 className="size-4 text-emerald shrink-0" /> : <Circle className="size-4 text-muted shrink-0" />}
                      </div>
                    </div>
                  ))}
                  {items.length === 0 && (
                    <div className="text-xs text-muted text-center py-8 italic">Drop tasks here</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Card className="p-5">
        <h3 className="text-xs uppercase tracking-[0.22em] text-emerald mb-3">Ship discipline</h3>
        <ul className="text-sm text-muted space-y-1.5 leading-relaxed">
          <li>· One thing at a time in <strong>In progress</strong>. Two if you must. Three is fiction.</li>
          <li>· Move to <strong>Shipped</strong> only when a real user could use the feature end-to-end.</li>
          <li>· If a task sits in <strong>In progress</strong> for more than 3 days, it&apos;s too big — split it.</li>
          <li>· A 7-day MVP with one user beats a 90-day MVP with none.</li>
        </ul>
      </Card>
    </div>
  );
}
