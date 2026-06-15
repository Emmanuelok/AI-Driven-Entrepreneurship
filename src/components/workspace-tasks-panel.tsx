"use client";

import { useMemo, useState } from "react";
import { useWorkspaceTasks } from "@/lib/use-workspace-content";
import type { WorkspaceTask, TaskStatus, WorkspaceMember } from "@/lib/workspace-api";
import { Button } from "@/components/ui";
import { WorkspaceAttachments } from "@/components/workspace-attachments";
import { Plus, Loader2, ChevronLeft, ChevronRight, Trash2, X, User2, CircleDot, Circle, CheckCircle2, Ban } from "lucide-react";

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
  const { tasks, loading, move, add, patch, remove } = useWorkspaceTasks(workspaceId);
  const [adding, setAdding] = useState<TaskStatus | null>(null);
  const [editing, setEditing] = useState<WorkspaceTask | null>(null);

  const byColumn = useMemo(() => {
    const m: Record<TaskStatus, WorkspaceTask[]> = { todo: [], doing: [], done: [], blocked: [] };
    for (const t of tasks) (m[t.status] ?? m.todo).push(t);
    for (const k of ORDER) m[k].sort((a, b) => a.position - b.position || new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
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
          return (
            <div key={col.id} className="glass rounded-2xl p-3 flex flex-col min-h-[200px]">
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
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {editing && (
        <TaskDialog
          task={editing}
          workspaceId={workspaceId}
          members={members}
          canEdit={canEdit}
          accent={accent}
          onClose={() => setEditing(null)}
          onSave={async (p) => { await patch({ id: editing.id, ...p }); setEditing(null); }}
          onDelete={async () => { await remove(editing.id); setEditing(null); }}
        />
      )}
    </div>
  );
}

function TaskCard({ task, canEdit, canMoveLeft, canMoveRight, onMoveLeft, onMoveRight, onOpen }: {
  task: WorkspaceTask; canEdit: boolean; canMoveLeft: boolean; canMoveRight: boolean; onMoveLeft: () => void; onMoveRight: () => void; onOpen: () => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface-2/40 hover:border-emerald/30 transition group">
      <button onClick={onOpen} className="w-full text-left p-3">
        <div className={`text-sm font-medium leading-snug ${task.status === "done" ? "line-through text-muted" : ""}`}>{task.title}</div>
        {task.detail && <p className="text-[11px] text-muted mt-1 line-clamp-2">{task.detail}</p>}
        {task.assignee_name && (
          <div className="mt-2 flex items-center gap-1.5">
            <span className="size-4 rounded-full bg-gradient-to-br from-emerald to-amber flex items-center justify-center text-black text-[8px] font-bold">{task.assignee_name[0]?.toUpperCase()}</span>
            <span className="text-[10px] text-muted">{task.assignee_name}</span>
          </div>
        )}
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

function TaskDialog({ task, workspaceId, members, canEdit, accent, onClose, onSave, onDelete }: {
  task: WorkspaceTask; workspaceId: string; members: WorkspaceMember[]; canEdit: boolean; accent: string;
  onClose: () => void; onSave: (p: { title?: string; detail?: string; assigneeUserId?: string | null }) => void; onDelete: () => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [detail, setDetail] = useState(task.detail);
  const [assignee, setAssignee] = useState<string>(task.assignee_user_id ?? "");

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
          <select value={assignee} onChange={(e) => setAssignee(e.target.value)} disabled={!canEdit} className="w-full bg-surface-2 border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-emerald mb-5 disabled:opacity-70">
            <option value="">Unassigned</option>
            {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.display_name || m.email || "Member"}</option>)}
          </select>

          <div className="mb-5 p-3 rounded-xl border border-border bg-surface-2/30">
            <WorkspaceAttachments workspaceId={workspaceId} canEdit={canEdit} attach={{ kind: "task", id: task.id }} label="Files for this task" />
          </div>

          {canEdit && (
            <div className="flex items-center justify-between gap-2">
              <button onClick={onDelete} className="text-xs text-rust hover:underline flex items-center gap-1"><Trash2 className="size-3.5" /> Delete</button>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={onClose}>Cancel</Button>
                <Button onClick={() => onSave({ title: title.trim(), detail: detail.trim(), assigneeUserId: assignee || null })}>Save</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
