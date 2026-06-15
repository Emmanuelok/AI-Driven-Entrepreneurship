"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { workspaceApi, type SearchHit } from "@/lib/workspace-api";
import { Search, Loader2, MessageSquare, FileText, KanbanSquare, Calendar, Paperclip, X } from "lucide-react";

// In-workspace search. Cmd/Ctrl+K opens it from anywhere inside a
// workspace; the query is debounced 220ms; the API runs ILIKE in
// parallel across messages, notes, tasks, deadlines, and files; results
// group by kind and click switches the room's tab so the user lands in
// the right context.

type Tab = "overview" | "tasks" | "discussion" | "notes" | "files";

const KIND_ICON: Record<SearchHit["kind"], typeof MessageSquare> = {
  message: MessageSquare,
  note: FileText,
  task: KanbanSquare,
  deadline: Calendar,
  file: Paperclip,
};
const KIND_TAB: Record<SearchHit["kind"], Tab> = {
  message: "discussion",
  note: "notes",
  task: "tasks",
  deadline: "overview",
  file: "files",
};
const KIND_LABEL: Record<SearchHit["kind"], string> = {
  message: "Discussion",
  note: "Notes",
  task: "Tasks",
  deadline: "Deadlines",
  file: "Files",
};

export function WorkspaceSearchDialog({ workspaceId, open, onClose, onJump }: {
  workspaceId: string;
  open: boolean;
  onClose: () => void;
  onJump: (tab: Tab) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastQueryRef = useRef("");

  // Reset state when reopened.
  useEffect(() => {
    if (open) {
      setQ("");
      setResults([]);
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  // Debounced search.
  useEffect(() => {
    if (!open) return;
    const trimmed = q.trim();
    if (trimmed.length < 2) { setResults([]); setLoading(false); return; }
    setLoading(true);
    const t = setTimeout(async () => {
      lastQueryRef.current = trimmed;
      const r = await workspaceApi.search(workspaceId, trimmed);
      // Stale-response guard: discard if the query has moved on.
      if (lastQueryRef.current !== trimmed) return;
      if (r.ok) setResults(r.results);
      setActive(0);
      setLoading(false);
    }, 220);
    return () => clearTimeout(t);
  }, [q, open, workspaceId]);

  // Keyboard navigation.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(results.length - 1, a + 1)); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); return; }
      if (e.key === "Enter") { e.preventDefault(); const hit = results[active]; if (hit) jump(hit); return; }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, results, active]);

  const grouped = useMemo(() => {
    const map = new Map<SearchHit["kind"], SearchHit[]>();
    for (const r of results) {
      const arr = map.get(r.kind) ?? [];
      arr.push(r);
      map.set(r.kind, arr);
    }
    return map;
  }, [results]);

  function jump(hit: SearchHit) {
    onJump(KIND_TAB[hit.kind]);
    onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-start justify-center pt-[12vh] px-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="glass rounded-2xl w-full max-w-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Search className="size-4 text-emerald shrink-0" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search messages, notes, tasks, deadlines, files…"
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted"
          />
          {loading && <Loader2 className="size-3.5 text-muted animate-spin" />}
          <button onClick={onClose} className="size-7 rounded-md text-muted hover:text-foreground hover:bg-surface-2 flex items-center justify-center" aria-label="Close">
            <X className="size-3.5" />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {q.trim().length < 2 ? (
            <div className="px-4 py-10 text-center text-xs text-muted">
              Type at least two characters. <span className="ml-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-surface-2 text-foreground/80">↑↓</span> to navigate, <span className="ml-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-surface-2 text-foreground/80">↵</span> to open, <span className="ml-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-surface-2 text-foreground/80">Esc</span> to close.
            </div>
          ) : results.length === 0 && !loading ? (
            <div className="px-4 py-10 text-center text-sm text-muted">Nothing matched.</div>
          ) : (
            <div className="p-2 space-y-3">
              {(["message", "note", "task", "deadline", "file"] as SearchHit["kind"][]).map((kind) => {
                const group = grouped.get(kind);
                if (!group || group.length === 0) return null;
                return (
                  <div key={kind}>
                    <div className="text-[10px] uppercase tracking-widest text-muted px-2 mb-1">{KIND_LABEL[kind]} · {group.length}</div>
                    <ul>
                      {group.map((hit) => {
                        const Icon = KIND_ICON[hit.kind];
                        const idx = results.indexOf(hit);
                        const isActive = idx === active;
                        return (
                          <li key={`${hit.kind}-${hit.id}`}>
                            <button
                              onClick={() => jump(hit)}
                              onMouseEnter={() => setActive(idx)}
                              className={`w-full text-left flex items-start gap-3 px-2.5 py-2 rounded-lg transition ${isActive ? "bg-emerald/10" : "hover:bg-surface-2/60"}`}
                            >
                              <div className={`size-7 rounded-md flex items-center justify-center shrink-0 ${isActive ? "bg-emerald/20" : "bg-surface-2"}`}>
                                <Icon className={`size-3.5 ${isActive ? "text-emerald" : "text-muted"}`} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className={`text-sm font-medium truncate ${isActive ? "text-foreground" : "text-foreground/90"}`}>{hit.title}</div>
                                {hit.snippet && <div className="text-[11px] text-muted line-clamp-2 leading-snug mt-0.5">{hit.snippet}</div>}
                                <div className="text-[10px] text-muted mt-0.5">{hit.meta}</div>
                              </div>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
