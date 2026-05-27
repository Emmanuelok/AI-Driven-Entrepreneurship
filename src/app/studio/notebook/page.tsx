"use client";

import { useMemo, useState } from "react";
import { useExt, Note } from "@/store/extensions";
import { Card, Button, Input, Textarea, EmptyState, Badge } from "@/components/ui";
import { Notebook, Plus, Pin, PinOff, Trash2, Search, Sparkles } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function NotebookPage() {
  const { notes, addNote, updateNote, removeNote } = useExt();
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(notes[0]?.id ?? null);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  const filtered = useMemo(() => {
    const all = [...notes].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);
    if (!q) return all;
    return all.filter((n) => `${n.title} ${n.body} ${n.tags.join(" ")}`.toLowerCase().includes(q.toLowerCase()));
  }, [notes, q]);

  const current = filtered.find((n) => n.id === selected) ?? filtered[0];

  function create() {
    if (!newTitle.trim()) return;
    const id = addNote(newTitle, "", []);
    setSelected(id);
    setNewTitle("");
    setCreating(false);
  }

  return (
    <div className="max-w-7xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <div className="mb-8">
        <p className="text-xs uppercase tracking-[0.22em] text-emerald mb-2 flex items-center gap-1.5">
          <Notebook className="size-3.5" /> Notebook
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight">
          A founder's second brain.
        </h1>
        <p className="mt-3 text-muted max-w-2xl">
          Journal reflections, customer call notes, observations, hypotheses. Tag with #venture/#problem/#interview. Sage reads them when relevant.
        </p>
      </div>

      <div className="grid lg:grid-cols-[320px_1fr] gap-4">
        <Card className="overflow-hidden flex flex-col h-[70vh]">
          <div className="p-3 border-b border-border space-y-2">
            <div className="flex items-center gap-2 bg-surface-2 border border-border rounded-xl px-3 py-2">
              <Search className="size-4 text-muted" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search notes" className="flex-1 bg-transparent outline-none text-sm" />
            </div>
            {creating ? (
              <div className="flex gap-1">
                <Input autoFocus placeholder="Note title" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} />
                <Button size="sm" onClick={create}><Plus className="size-3.5" /></Button>
              </div>
            ) : (
              <Button onClick={() => setCreating(true)} variant="secondary" className="w-full"><Plus className="size-4" /> New note</Button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 && (
              <div className="text-center py-12 text-muted text-sm">No notes yet.</div>
            )}
            {filtered.map((n) => (
              <button
                key={n.id}
                onClick={() => setSelected(n.id)}
                className={`block w-full text-left px-4 py-3 border-b border-border hover:bg-surface-2 transition ${selected === n.id ? "bg-surface-2" : ""}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-sm truncate">{n.title || "Untitled"}</span>
                  {n.pinned && <Pin className="size-3 text-amber shrink-0" />}
                </div>
                <div className="text-xs text-muted line-clamp-1 mt-0.5">{n.body || "Empty"}</div>
                <div className="text-[10px] text-muted mt-1">{formatDistanceToNow(n.updatedAt, { addSuffix: true })}</div>
              </button>
            ))}
          </div>
        </Card>

        <Card className="overflow-hidden flex flex-col h-[70vh]">
          {current ? (
            <NoteEditor key={current.id} note={current} onChange={(p) => updateNote(current.id, p)} onDelete={() => { removeNote(current.id); setSelected(filtered[1]?.id ?? null); }} />
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted">Pick a note or create one.</div>
          )}
        </Card>
      </div>
    </div>
  );
}

function NoteEditor({ note, onChange, onDelete }: { note: Note; onChange: (p: { title?: string; body?: string; tags?: string[]; pinned?: boolean }) => void; onDelete: () => void }) {
  const [tagInput, setTagInput] = useState("");

  function addTag() {
    const t = tagInput.trim().replace(/^#/, "");
    if (!t) return;
    if (note.tags.includes(t)) { setTagInput(""); return; }
    onChange({ tags: [...note.tags, t] });
    setTagInput("");
  }

  return (
    <>
      <div className="px-5 py-3 border-b border-border flex items-center gap-2">
        <input
          value={note.title}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder="Note title"
          className="flex-1 bg-transparent outline-none font-[family-name:var(--font-display)] text-lg font-semibold"
        />
        <button onClick={() => onChange({ pinned: !note.pinned })} className="size-8 rounded-lg hover:bg-surface-2 flex items-center justify-center transition" title={note.pinned ? "Unpin" : "Pin"}>
          {note.pinned ? <PinOff className="size-4 text-amber" /> : <Pin className="size-4 text-muted" />}
        </button>
        <button onClick={onDelete} className="size-8 rounded-lg hover:bg-surface-2 flex items-center justify-center transition" title="Delete">
          <Trash2 className="size-4 text-muted hover:text-rust" />
        </button>
      </div>
      <div className="px-5 py-2 border-b border-border flex flex-wrap gap-2 items-center">
        {note.tags.map((t) => (
          <button key={t} onClick={() => onChange({ tags: note.tags.filter((x) => x !== t) })} className="text-[10px] uppercase tracking-widest text-emerald border border-emerald/40 bg-emerald/5 px-2 py-0.5 rounded-full hover:line-through">
            #{t}
          </button>
        ))}
        <input
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addTag()}
          placeholder="+ tag"
          className="text-xs bg-transparent outline-none w-20"
        />
      </div>
      <textarea
        value={note.body}
        onChange={(e) => onChange({ body: e.target.value })}
        placeholder="Write freely. Capture what happened today, what you noticed, what you're stuck on…"
        className="flex-1 bg-transparent outline-none resize-none p-5 text-foreground/95 leading-relaxed"
      />
      <div className="px-5 py-2 border-t border-border text-xs text-muted flex justify-between">
        <span>Last edited {formatDistanceToNow(note.updatedAt, { addSuffix: true })}</span>
        <span>{note.body.split(/\s+/).filter(Boolean).length} words</span>
      </div>
    </>
  );
}
