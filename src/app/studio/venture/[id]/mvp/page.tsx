"use client";

import { use, useState } from "react";
import { notFound } from "next/navigation";
import { useStore } from "@/store";
import { Card, Button, Input, EmptyState } from "@/components/ui";
import { Wrench, Plus, CheckCircle2, Circle, Calendar, Trash2 } from "lucide-react";

export default function MvpPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { ventures, toggleMvpTask, addMvpTask, updateVenture } = useStore();
  const found = ventures.find((x) => x.id === id);
  if (!found) { notFound(); return null; }
  const v = found;

  const [newTask, setNewTask] = useState("");
  const [newDue, setNewDue] = useState("");

  const done = v.mvpTasks.filter((t) => t.done);
  const todo = v.mvpTasks.filter((t) => !t.done);
  const pct = v.mvpTasks.length ? (done.length / v.mvpTasks.length) * 100 : 0;

  function add() {
    if (!newTask.trim()) return;
    addMvpTask(v.id, newTask, newDue || undefined);
    setNewTask("");
    setNewDue("");
  }

  function removeTask(taskId: string) {
    updateVenture(v.id, { mvpTasks: v.mvpTasks.filter((t) => t.id !== taskId) });
  }

  return (
    <div className="max-w-4xl mx-auto px-5 sm:px-8 py-10">
      <div className="mb-6">
        <p className="text-xs uppercase tracking-[0.22em] text-amber mb-1 flex items-center gap-1.5">
          <Wrench className="size-3.5" /> Phase 3 — Build MVP
        </p>
        <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold">{done.length} of {v.mvpTasks.length} tasks shipped</h2>
        <div className="mt-3 h-2 bg-surface-2 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-emerald to-amber transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <Card className="p-4 mb-6 flex gap-2 items-end flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <div className="text-xs uppercase tracking-widest text-muted mb-1">New task</div>
          <Input placeholder="Wire NaOH pump to Arduino driver" value={newTask} onChange={(e) => setNewTask(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        </div>
        <div>
          <div className="text-xs uppercase tracking-widest text-muted mb-1">Due (optional)</div>
          <Input type="date" value={newDue} onChange={(e) => setNewDue(e.target.value)} />
        </div>
        <Button onClick={add} disabled={!newTask.trim()}><Plus className="size-4" /> Add</Button>
      </Card>

      {v.mvpTasks.length === 0 ? (
        <EmptyState icon={Wrench} title="No MVP tasks yet" body="Break your MVP into shippable units. Each task ≤ 2 days of work." />
      ) : (
        <div className="grid gap-2">
          {todo.map((t) => (
            <TaskRow key={t.id} t={t} onToggle={() => toggleMvpTask(v.id, t.id)} onDelete={() => removeTask(t.id)} />
          ))}
          {done.length > 0 && (
            <div className="mt-6">
              <div className="text-xs uppercase tracking-widest text-muted mb-2">Shipped ({done.length})</div>
              {done.map((t) => (
                <TaskRow key={t.id} t={t} onToggle={() => toggleMvpTask(v.id, t.id)} onDelete={() => removeTask(t.id)} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TaskRow({ t, onToggle, onDelete }: { t: { id: string; title: string; done: boolean; due?: string }; onToggle: () => void; onDelete: () => void }) {
  return (
    <div className={`glass rounded-xl px-4 py-3 flex items-center gap-3 group ${t.done ? "opacity-60" : ""}`}>
      <button onClick={onToggle} className="shrink-0">
        {t.done ? <CheckCircle2 className="size-5 text-emerald" /> : <Circle className="size-5 text-muted hover:text-emerald transition" />}
      </button>
      <span className={`flex-1 ${t.done ? "line-through text-muted" : ""}`}>{t.title}</span>
      {t.due && (
        <span className="text-xs text-muted flex items-center gap-1">
          <Calendar className="size-3" /> {t.due}
        </span>
      )}
      <button onClick={onDelete} className="opacity-0 group-hover:opacity-100 transition text-muted hover:text-rust">
        <Trash2 className="size-4" />
      </button>
    </div>
  );
}
