"use client";

import { useEffect, useState } from "react";
import { useWorkspaceDoc, useWorkspaceDocList } from "@/lib/use-workspace-content";
import { workspaceApi } from "@/lib/workspace-api";
import { Markdown } from "@/components/markdown";
import { FileText, Plus, Loader2, Check, AlertTriangle, Eye, Pencil, Trash2, Cloud } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

// Shared collaborative notes for a workspace. Left rail lists notes;
// the editor autosaves with optimistic-concurrency conflict handling and
// a live markdown preview toggle. Realtime keeps the list + the open
// doc fresh as collaborators edit.

export function WorkspaceNotesPanel({ workspaceId, canEdit, accent }: { workspaceId: string; canEdit: boolean; accent: string }) {
  const { docs, loading, refresh } = useWorkspaceDocList(workspaceId);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // Auto-open the most recent note when the list first loads.
  useEffect(() => {
    if (!activeId && docs.length > 0) setActiveId(docs[0].id);
  }, [docs, activeId]);

  async function createNote() {
    setCreating(true);
    const r = await workspaceApi.createDoc(workspaceId, "Untitled note");
    setCreating(false);
    if (r.ok) { await refresh(); setActiveId(r.doc.id); }
  }

  return (
    <div className="grid lg:grid-cols-[240px_1fr] gap-4 min-h-[560px]">
      {/* Note list */}
      <div className="glass rounded-2xl p-3 flex flex-col">
        <div className="flex items-center justify-between px-1 mb-2">
          <span className="text-[10px] uppercase tracking-widest text-muted">Notes</span>
          {canEdit && (
            <button onClick={createNote} disabled={creating} className="size-6 rounded-lg hover:bg-surface-2 flex items-center justify-center text-muted hover:text-emerald transition" title="New note">
              {creating ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
            </button>
          )}
        </div>
        {loading ? (
          <div className="flex-1 flex items-center justify-center"><Loader2 className="size-4 text-emerald animate-spin" /></div>
        ) : docs.length === 0 ? (
          <p className="text-xs text-muted px-1 py-4">No notes yet. {canEdit ? "Create one to start a shared draft." : "An editor can create the first note."}</p>
        ) : (
          <div className="space-y-0.5 overflow-y-auto">
            {docs.map((d) => (
              <button
                key={d.id}
                onClick={() => setActiveId(d.id)}
                className={`w-full text-left px-2.5 py-2 rounded-lg transition group ${activeId === d.id ? "bg-emerald/10 border border-emerald/20" : "border border-transparent hover:bg-surface-2"}`}
              >
                <div className="flex items-center gap-2">
                  <FileText className={`size-3.5 shrink-0 ${activeId === d.id ? "text-emerald" : "text-muted"}`} />
                  <span className="text-sm font-medium truncate">{d.title}</span>
                </div>
                <div className="text-[10px] text-muted mt-0.5 pl-5.5">
                  {d.updated_by_name ? `${d.updated_by_name} · ` : ""}{formatDistanceToNow(new Date(d.updated_at))} ago
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Editor */}
      {activeId ? (
        <NoteEditor key={activeId} workspaceId={workspaceId} docId={activeId} canEdit={canEdit} accent={accent} onDeleted={() => { setActiveId(null); refresh(); }} />
      ) : (
        <div className="glass rounded-2xl flex items-center justify-center text-sm text-muted">
          Select a note, or create one.
        </div>
      )}
    </div>
  );
}

function NoteEditor({ workspaceId, docId, canEdit, accent, onDeleted }: { workspaceId: string; docId: string; canEdit: boolean; accent: string; onDeleted: () => void }) {
  const { doc, loading, saveState, queueSave, reload } = useWorkspaceDoc(workspaceId, docId);
  const [mode, setMode] = useState<"write" | "preview">("write");

  if (loading || !doc) {
    return <div className="glass rounded-2xl flex items-center justify-center"><Loader2 className="size-5 text-emerald animate-spin" /></div>;
  }

  return (
    <div className="glass rounded-2xl flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border">
        <input
          value={doc.title}
          onChange={(e) => queueSave({ title: e.target.value })}
          disabled={!canEdit}
          className="flex-1 bg-transparent outline-none font-medium text-sm disabled:opacity-70"
          placeholder="Note title"
        />
        <SaveIndicator state={saveState} updatedByName={doc.updated_by_name} version={doc.version} />
        <div className="flex items-center gap-1 ml-2">
          <button onClick={() => setMode("write")} className={`size-7 rounded-lg flex items-center justify-center transition ${mode === "write" ? "bg-emerald/15 text-emerald" : "text-muted hover:bg-surface-2"}`} title="Write"><Pencil className="size-3.5" /></button>
          <button onClick={() => setMode("preview")} className={`size-7 rounded-lg flex items-center justify-center transition ${mode === "preview" ? "bg-emerald/15 text-emerald" : "text-muted hover:bg-surface-2"}`} title="Preview"><Eye className="size-3.5" /></button>
          {canEdit && (
            <button
              onClick={async () => { if (confirm("Delete this note?")) { await workspaceApi.deleteDoc(workspaceId, docId); onDeleted(); } }}
              className="size-7 rounded-lg text-muted hover:text-rust hover:bg-rust/10 flex items-center justify-center transition"
              title="Delete note"
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {saveState === "conflict" && (
        <div className="px-4 py-2 bg-amber/10 border-b border-amber/30 text-xs text-amber flex items-center justify-between gap-3">
          <span className="flex items-center gap-1.5"><AlertTriangle className="size-3.5" /> A collaborator saved a newer version while you were editing.</span>
          <button onClick={reload} className="underline hover:text-foreground shrink-0">Load theirs (discards your unsaved text)</button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {mode === "write" ? (
          <textarea
            value={doc.body}
            onChange={(e) => queueSave({ body: e.target.value })}
            disabled={!canEdit}
            placeholder={canEdit ? "Write together in markdown. Autosaves as you type." : "Read-only — you don't have edit access."}
            className="w-full h-full min-h-[460px] bg-transparent outline-none resize-none p-5 text-sm leading-relaxed font-mono disabled:opacity-70"
            spellCheck
          />
        ) : (
          <div className="p-5">
            {doc.body.trim() ? <Markdown src={doc.body} className="prose-chat" /> : <p className="text-sm text-muted italic">Nothing to preview yet.</p>}
          </div>
        )}
      </div>
    </div>
  );
}

function SaveIndicator({ state, updatedByName, version }: { state: string; updatedByName: string | null; version: number }) {
  if (state === "saving") return <span className="text-[11px] text-muted flex items-center gap-1"><Loader2 className="size-3 animate-spin" /> Saving…</span>;
  if (state === "saved") return <span className="text-[11px] text-emerald flex items-center gap-1"><Check className="size-3" /> Saved</span>;
  if (state === "error") return <span className="text-[11px] text-rust flex items-center gap-1"><AlertTriangle className="size-3" /> Save failed</span>;
  return <span className="text-[11px] text-muted flex items-center gap-1" title={updatedByName ? `Last edited by ${updatedByName}` : undefined}><Cloud className="size-3" /> v{version}</span>;
}
