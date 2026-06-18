"use client";

import { useMemo, useState } from "react";
import { useWorkspaceTasks } from "@/lib/use-workspace-content";
import type { WorkspaceTask, TaskStatus, WorkspaceMember } from "@/lib/workspace-api";
import { Button } from "@/components/ui";
import { WorkspaceAttachments } from "@/components/workspace-attachments";
import { relativeDue } from "@/lib/deadline-schedule";
import { Plus, Loader2, ChevronLeft, ChevronRight, Trash2, X, User2, CircleDot, Circle, CheckCircle2, Ban, Clock, ListChecks, Check, Move, UserPlus2 } from "lucide-react";

// A shared Kanban board for a workspace. Four columns: To do / Doing /
// Done / Blocked. Cards carry an assignee. Moving a card uses arrow
// buttons (← →) rather than drag-and-drop so it works on touch devices
// — important for students on phones. Realtime keeps the board in sync.

const COLUMNS: { id: TaskStatus; label: string; icon: typeof Circle; color: string }[] = [
  { id: "todo", label: "To do", icon: Circle, color: "#8ba49b" },
  { id: "doing", label: "Doing", icon: CircleDot, color: "#f4a949" },
  { id: "done", label: "Done", icon: CheckCircle2, color: "#2cc295" },
  { id: "blocked", label: "Blocked", icon: Ban, color: "#d96444" },
];

const ORDER: TaskStatus[] = ["todo", "doing", "done", "blocked"];

export function WorkspaceTasksPanel({ workspaceId, canEdit, members, accent }: { workspaceId: string; canEdit: boolean; members: WorkspaceMember[]; accent: string }) {
  const { tasks, loading, move, add, patch, remove, bulk } = useWorkspaceTasks(workspaceId);
  // Multi-select for bulk operations. Click toggles a row in/out;
  // empty when no bulk action bar is showing.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  function toggleSelect(taskId: string) {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }
  function clearSelection() { setSelected(new Set()); }
  const [adding, setAdding] = useState<TaskStatus | null>(null);
  const [editing, setEditing] = useState<WorkspaceTask | null>(null);
  // Native HTML5 drag-and-drop state. `dragId` is the task being
  // dragged; `dropCol` is the column currently hovered (for a visual
  // ring). Touch users keep the arrow buttons; desktop users get drag.
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropCol, setDropCol] = useState<TaskStatus | null>(null);

  function onDropToColumn(status: TaskStatus) {
    if (dragId) {
      const t = tasks.find((x) => x.id === dragId);
      if (t && t.status !== status) void move(dragId, status);
    }
    setDragId(null);
    setDropCol(null);
  }

  // Top-level cards form the columns; subtasks live inside their parent.
  const topLevel = useMemo(() => tasks.filter((t) => !t.parent_task_id), [tasks]);
  // Subtask roll-up per parent — { open, total } so we can render
  // '2/5 ✓' badges without re-scanning on every render.
  const subtaskCounts = useMemo(() => {
    const m = new Map<string, { open: number; total: number }>();
    for (const t of tasks) {
      if (!t.parent_task_id) continue;
      const cur = m.get(t.parent_task_id) ?? { open: 0, total: 0 };
      cur.total++;
      if (t.status !== "done") cur.open++;
      m.set(t.parent_task_id, cur);
    }
    return m;
  }, [tasks]);

  const byColumn = useMemo(() => {
    const m: Record<TaskStatus, WorkspaceTask[]> = { todo: [], doing: [], done: [], blocked: [] };
    for (const t of topLevel) (m[t.status] ?? m.todo).push(t);
    for (const k of ORDER) m[k].sort((a, b) => a.position - b.position || new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    return m;
  }, [topLevel]);

  // All subtasks scoped by their parent — passed into the dialog so it
  // can render the checklist without a second fetch.
  const subtasksByParent = useMemo(() => {
    const m = new Map<string, WorkspaceTask[]>();
    for (const t of tasks) {
      if (!t.parent_task_id) continue;
      const arr = m.get(t.parent_task_id) ?? [];
      arr.push(t);
      m.set(t.parent_task_id, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.position - b.position || new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    return m;
  }, [tasks]);

  if (loading) {
    return <div className="glass rounded-2xl h-[480px] flex items-center justify-center"><Loader2 className="size-5 text-emerald animate-spin" /></div>;
  }

  return (
    <div>
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {COLUMNS.map((col) => {
          const colTasks = byColumn[col.id];
          const idx = ORDER.indexOf(col.id);
          const isDropTarget = dropCol === col.id && dragId !== null;
          return (
            <div
              key={col.id}
              onDragOver={canEdit ? (e) => { e.preventDefault(); if (dropCol !== col.id) setDropCol(col.id); } : undefined}
              onDragLeave={canEdit ? (e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropCol((c) => (c === col.id ? null : c)); } : undefined}
              onDrop={canEdit ? (e) => { e.preventDefault(); onDropToColumn(col.id); } : undefined}
              className={`glass rounded-2xl p-3 flex flex-col min-h-[200px] transition ${isDropTarget ? "ring-2 ring-emerald/50 bg-emerald/5" : ""}`}
            >
              <div className="flex items-center justify-between px-1 mb-2">
                <span className="text-xs font-medium flex items-center gap-1.5" style={{ color: col.color }}>
                  <col.icon className="size-3.5" /> {col.label}
                  <span className="text-muted font-normal">· {colTasks.length}</span>
                </span>
                {canEdit && (
                  <button onClick={() => setAdding(col.id)} className="size-6 rounded-lg hover:bg-surface-2 flex items-center justify-center text-muted hover:text-emerald transition" title={`Add to ${col.label}`}>
                    <Plus className="size-3.5" />
                  </button>
                )}
              </div>
              <div className="space-y-2 flex-1">
                {adding === col.id && (
                  <QuickAdd
                    onCancel={() => setAdding(null)}
                    onAdd={async (title) => { const ok = await add({ title, status: col.id }); if (ok) setAdding(null); }}
                  />
                )}
                {colTasks.length === 0 && adding !== col.id && (
                  <p className="text-[11px] text-muted italic px-1 py-3">Nothing here.</p>
                )}
                {colTasks.map((t) => (
                  <TaskCard
                    key={t.id}
                    task={t}
                    canEdit={canEdit}
                    canMoveLeft={idx > 0}
                    canMoveRight={idx < ORDER.length - 1}
                    onMoveLeft={() => move(t.id, ORDER[idx - 1])}
                    onMoveRight={() => move(t.id, ORDER[idx + 1])}
                    onOpen={() => setEditing(t)}
                    subtaskCount={subtaskCounts.get(t.id) ?? null}
                    selected={selected.has(t.id)}
                    onToggleSelect={canEdit ? () => toggleSelect(t.id) : undefined}
                    draggable={canEdit}
                    isDragging={dragId === t.id}
                    onDragStart={() => setDragId(t.id)}
                    onDragEnd={() => { setDragId(null); setDropCol(null); }}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {selected.size > 0 && (
        <BulkActionBar
          count={selected.size}
          members={members}
          onMove={async (s) => { await bulk(Array.from(selected), { kind: "move", status: s }); clearSelection(); }}
          onAssign={async (u) => { await bulk(Array.from(selected), { kind: "assign", assigneeUserId: u }); clearSelection(); }}
          onDelete={async () => {
            if (!confirm(`Delete ${selected.size} task${selected.size === 1 ? "" : "s"}? This can't be undone.`)) return;
            await bulk(Array.from(selected), { kind: "delete" });
            clearSelection();
          }}
          onClear={clearSelection}
        />
      )}

      {editing && (
        <TaskDialog
          task={editing}
          workspaceId={workspaceId}
          members={members}
          canEdit={canEdit}
          accent={accent}
          subtasks={subtasksByParent.get(editing.id) ?? []}
          onAddSubtask={async (title) => { await add({ title, parentTaskId: editing.id, status: "todo" }); }}
          onToggleSubtask={async (subId, done) => { await move(subId, done ? "done" : "todo"); }}
          onRemoveSubtask={async (subId) => { await remove(subId); }}
          onClose={() => setEditing(null)}
          onSave={async (p) => { await patch({ id: editing.id, ...p }); setEditing(null); }}
          onDelete={async () => { await remove(editing.id); setEditing(null); }}
        />
      )}
    </div>
  );
}

function TaskCard({ task, canEdit, canMoveLeft, canMoveRight, onMoveLeft, onMoveRight, onOpen, subtaskCount, selected, onToggleSelect, draggable, isDragging, onDragStart, onDragEnd }: {
  task: WorkspaceTask; canEdit: boolean; canMoveLeft: boolean; canMoveRight: boolean; onMoveLeft: () => void; onMoveRight: () => void; onOpen: () => void;
  subtaskCount: { open: number; total: number } | null;
  selected: boolean;
  onToggleSelect?: () => void;
  draggable?: boolean;
  isDragging?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}) {
  return (
    <div
      draggable={draggable}
      onDragStart={draggable ? (e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", task.id); onDragStart?.(); } : undefined}
      onDragEnd={draggable ? onDragEnd : undefined}
      className={`relative rounded-xl border bg-surface-2/40 hover:border-emerald/30 transition group ${draggable ? "cursor-grab active:cursor-grabbing" : ""} ${isDragging ? "opacity-40" : ""} ${selected ? "border-emerald/60 ring-1 ring-emerald/30" : "border-border"}`}
    >
      {onToggleSelect && (
        <button
          onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
          className={`absolute mt-2 ml-2 size-4 rounded border-2 flex items-center justify-center text-emerald shrink-0 transition opacity-0 group-hover:opacity-100 ${selected ? "border-emerald bg-emerald text-black opacity-100" : "border-border bg-surface hover:border-emerald"}`}
          title="Select for bulk actions"
          aria-label={selected ? "Deselect task" : "Select task"}
          style={{ position: "absolute" }}
        >
          {selected && <Check className="size-2.5" />}
        </button>
      )}
      <button onClick={onOpen} className={`w-full text-left p-3 ${onToggleSelect ? "pl-7" : ""}`}>
        <div className={`text-sm font-medium leading-snug ${task.status === "done" ? "line-through text-muted" : ""}`}>{task.title}</div>
        {task.detail && <p className="text-[11px] text-muted mt-1 line-clamp-2">{task.detail}</p>}
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          {task.assignee_name && (
            <span className="flex items-center gap-1.5">
              <span className="size-4 rounded-full bg-gradient-to-br from-emerald to-amber flex items-center justify-center text-black text-[8px] font-bold">{task.assignee_name[0]?.toUpperCase()}</span>
              <span className="text-[10px] text-muted">{task.assignee_name}</span>
            </span>
          )}
          {task.due_at && (() => {
            const overdue = task.status !== "done" && new Date(task.due_at).getTime() < Date.now();
            return (
              <span className={`text-[10px] inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full ${overdue ? "bg-rust/15 text-rust" : "bg-surface text-muted"}`} title={new Date(task.due_at).toLocaleString()}>
                <Clock className="size-2.5" /> {relativeDue(task.due_at, Date.now())}
              </span>
            );
          })()}
          {subtaskCount && subtaskCount.total > 0 && (
            <span className="text-[10px] inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-surface text-muted" title="Subtasks">
              <ListChecks className="size-2.5" /> {subtaskCount.total - subtaskCount.open}/{subtaskCount.total}
            </span>
          )}
        </div>
      </button>
      {canEdit && (
        <div className="flex items-center justify-between px-2 pb-1.5 opacity-0 group-hover:opacity-100 transition">
          <button onClick={onMoveLeft} disabled={!canMoveLeft} className="size-6 rounded-md hover:bg-surface flex items-center justify-center text-muted hover:text-foreground disabled:opacity-20 transition" title="Move left">
            <ChevronLeft className="size-3.5" />
          </button>
          <button onClick={onMoveRight} disabled={!canMoveRight} className="size-6 rounded-md hover:bg-surface flex items-center justify-center text-muted hover:text-foreground disabled:opacity-20 transition" title="Move right">
            <ChevronRight className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

function QuickAdd({ onAdd, onCancel }: { onAdd: (title: string) => void; onCancel: () => void }) {
  const [title, setTitle] = useState("");
  return (
    <div className="rounded-xl border border-emerald/30 bg-emerald/5 p-2">
      <textarea
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (title.trim()) onAdd(title.trim()); } if (e.key === "Escape") onCancel(); }}
        placeholder="Task title — Enter to add"
        rows={2}
        autoFocus
        className="w-full bg-transparent outline-none text-sm resize-none"
      />
      <div className="flex justify-end gap-1 mt-1">
        <button onClick={onCancel} className="text-[10px] text-muted hover:text-foreground px-2 py-1">Cancel</button>
        <button onClick={() => title.trim() && onAdd(title.trim())} className="text-[10px] text-emerald hover:underline px-2 py-1">Add</button>
      </div>
    </div>
  );
}

function TaskDialog({ task, workspaceId, members, canEdit, accent, subtasks, onAddSubtask, onToggleSubtask, onRemoveSubtask, onClose, onSave, onDelete }: {
  task: WorkspaceTask; workspaceId: string; members: WorkspaceMember[]; canEdit: boolean; accent: string;
  subtasks: WorkspaceTask[];
  onAddSubtask: (title: string) => Promise<void>;
  onToggleSubtask: (id: string, done: boolean) => Promise<void>;
  onRemoveSubtask: (id: string) => Promise<void>;
  onClose: () => void; onSave: (p: { title?: string; detail?: string; assigneeUserId?: string | null; dueAt?: string | null }) => void; onDelete: () => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [detail, setDetail] = useState(task.detail);
  const [assignee, setAssignee] = useState<string>(task.assignee_user_id ?? "");
  const [due, setDue] = useState<string>(isoToLocalInput(task.due_at));
  const [newSub, setNewSub] = useState("");
  const [addingSub, setAddingSub] = useState(false);
  // Subtasks aren't allowed on subtasks (one level cap), so hide the
  // panel entirely when this task is itself a subtask.
  const isSubtaskItself = !!task.parent_task_id;
  const doneSubs = subtasks.filter((s) => s.status === "done").length;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-5 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="glass rounded-3xl max-w-md w-full max-h-[90vh] overflow-y-auto p-7 relative" onClick={(e) => e.stopPropagation()}>
        <div className="absolute -top-20 -right-20 size-44 rounded-full blur-3xl opacity-20" style={{ background: accent }} />
        <div className="relative">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">Task</h2>
            <button onClick={onClose} className="text-muted hover:text-foreground"><X className="size-4" /></button>
          </div>

          <label className="block text-[10px] uppercase tracking-widest text-muted mb-2">Title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} disabled={!canEdit} className="w-full bg-surface-2 border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-emerald mb-4 disabled:opacity-70" />

          <label className="block text-[10px] uppercase tracking-widest text-muted mb-2">Detail</label>
          <textarea value={detail} onChange={(e) => setDetail(e.target.value)} disabled={!canEdit} rows={4} className="w-full bg-surface-2 border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-emerald mb-4 resize-none disabled:opacity-70" />

          <label className="block text-[10px] uppercase tracking-widest text-muted mb-2 flex items-center gap-1.5"><User2 className="size-3" /> Assigned to</label>
          <select value={assignee} onChange={(e) => setAssignee(e.target.value)} disabled={!canEdit} className="w-full bg-surface-2 border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-emerald mb-4 disabled:opacity-70">
            <option value="">Unassigned</option>
            {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.display_name || m.email || "Member"}</option>)}
          </select>

          <label className="block text-[10px] uppercase tracking-widest text-muted mb-2 flex items-center gap-1.5"><Clock className="size-3" /> Due date (optional)</label>
          <div className="flex items-center gap-2 mb-5">
            <input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} disabled={!canEdit} className="flex-1 bg-surface-2 border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-emerald disabled:opacity-70" />
            {due && canEdit && <button onClick={() => setDue("")} className="text-xs text-muted hover:text-rust px-2" title="Clear due date">Clear</button>}
          </div>

          {!isSubtaskItself && (
            <div className="mb-5 p-3 rounded-xl border border-border bg-surface-2/30">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] uppercase tracking-widest text-muted flex items-center gap-1.5">
                  <ListChecks className="size-3" /> Subtasks
                  {subtasks.length > 0 && <span className="text-foreground">· {doneSubs}/{subtasks.length}</span>}
                </span>
              </div>
              {subtasks.length > 0 ? (
                <ul className="space-y-1 mb-2">
                  {subtasks.map((s) => {
                    const done = s.status === "done";
                    return (
                      <li key={s.id} className="flex items-center gap-2 group">
                        <button
                          onClick={() => onToggleSubtask(s.id, !done)}
                          disabled={!canEdit}
                          className={`size-4 rounded-full border-2 flex items-center justify-center shrink-0 transition ${
                            done ? "border-emerald bg-emerald text-black" : "border-border hover:border-emerald"
                          }`}
                          aria-label={done ? "Mark not done" : "Mark done"}
                        >
                          {done && <CheckCircle2 className="size-2.5" />}
                        </button>
                        <span className={`text-sm flex-1 truncate ${done ? "line-through text-muted" : ""}`}>{s.title}</span>
                        {s.assignee_name && <span className="text-[10px] text-muted hidden sm:inline truncate max-w-[80px]">{s.assignee_name}</span>}
                        {canEdit && (
                          <button onClick={() => { if (confirm(`Remove "${s.title}"?`)) onRemoveSubtask(s.id); }} className="size-5 rounded-md text-muted hover:text-rust hover:bg-rust/10 flex items-center justify-center transition opacity-0 group-hover:opacity-100" aria-label="Remove subtask">
                            <X className="size-3" />
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-[11px] text-muted italic mb-2">No subtasks. Break this down into smaller pieces.</p>
              )}
              {canEdit && (
                <div className="flex items-center gap-1">
                  <input
                    value={newSub}
                    onChange={(e) => setNewSub(e.target.value)}
                    onKeyDown={async (e) => {
                      if (e.key === "Enter" && newSub.trim() && !addingSub) {
                        e.preventDefault();
                        setAddingSub(true);
                        await onAddSubtask(newSub.trim());
                        setNewSub("");
                        setAddingSub(false);
                      }
                    }}
                    placeholder="Add a subtask — Enter to add"
                    className="flex-1 bg-surface-2 border border-border rounded-lg px-2.5 py-1.5 text-sm outline-none focus:border-emerald"
                  />
                  <button
                    onClick={async () => {
                      if (!newSub.trim() || addingSub) return;
                      setAddingSub(true);
                      await onAddSubtask(newSub.trim());
                      setNewSub("");
                      setAddingSub(false);
                    }}
                    disabled={addingSub || !newSub.trim()}
                    className="size-7 rounded-md bg-emerald/15 text-emerald hover:bg-emerald/25 disabled:opacity-30 flex items-center justify-center transition"
                    aria-label="Add subtask"
                  >
                    {addingSub ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="mb-5 p-3 rounded-xl border border-border bg-surface-2/30">
            <WorkspaceAttachments workspaceId={workspaceId} canEdit={canEdit} attach={{ kind: "task", id: task.id }} label="Files for this task" />
          </div>

          {canEdit && (
            <div className="flex items-center justify-between gap-2">
              <button onClick={onDelete} className="text-xs text-rust hover:underline flex items-center gap-1"><Trash2 className="size-3.5" /> Delete</button>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={onClose}>Cancel</Button>
                <Button onClick={() => onSave({ title: title.trim(), detail: detail.trim(), assigneeUserId: assignee || null, dueAt: due ? new Date(due).toISOString() : null })}>Save</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ISO → value for <input type="datetime-local"> in the user's local
// timezone (empty string when there's no due date).
function isoToLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function BulkActionBar({ count, members, onMove, onAssign, onDelete, onClear }: {
  count: number;
  members: WorkspaceMember[];
  onMove: (status: TaskStatus) => Promise<void>;
  onAssign: (userId: string | null) => Promise<void>;
  onDelete: () => Promise<void>;
  onClear: () => void;
}) {
  const [busy, setBusy] = useState(false);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  }
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[80] glass rounded-2xl shadow-2xl border border-emerald/30 flex items-center gap-2 px-4 py-3 max-w-[calc(100vw-2rem)] flex-wrap">
      <span className="text-sm font-medium flex items-center gap-1.5">
        <Check className="size-3.5 text-emerald" /> {count} task{count === 1 ? "" : "s"}
      </span>
      <div className="h-5 w-px bg-border mx-1" />
      <div className="flex items-center gap-1">
        {COLUMNS.map((c) => (
          <button
            key={c.id}
            onClick={() => run(() => onMove(c.id))}
            disabled={busy}
            className="text-xs px-2.5 py-1.5 rounded-lg border border-border hover:border-emerald/40 hover:bg-emerald/5 transition flex items-center gap-1.5"
            title={`Move to ${c.label}`}
          >
            <c.icon className="size-3" style={{ color: c.color }} /> {c.label}
          </button>
        ))}
      </div>
      <div className="h-5 w-px bg-border mx-1" />
      <div className="relative">
        <select
          onChange={async (e) => {
            const v = e.target.value;
            await run(() => onAssign(v === "_unassign_" ? null : v));
            e.target.value = "";
          }}
          disabled={busy}
          defaultValue=""
          className="text-xs px-2.5 py-1.5 rounded-lg border border-border hover:border-emerald/40 bg-surface appearance-none pr-7 cursor-pointer"
        >
          <option value="" disabled>Assign to…</option>
          <option value="_unassign_">Unassigned</option>
          {members.map((m) => (
            <option key={m.user_id} value={m.user_id}>{m.display_name || m.email || "Member"}</option>
          ))}
        </select>
        <UserPlus2 className="size-3 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-muted" />
      </div>
      <button
        onClick={() => run(onDelete)}
        disabled={busy}
        className="text-xs px-2.5 py-1.5 rounded-lg border border-rust/30 text-rust hover:bg-rust/10 transition flex items-center gap-1.5"
      >
        <Trash2 className="size-3" /> Delete
      </button>
      <button
        onClick={onClear}
        disabled={busy}
        className="size-7 rounded-lg text-muted hover:text-foreground hover:bg-surface-2 flex items-center justify-center transition"
        aria-label="Clear selection"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
