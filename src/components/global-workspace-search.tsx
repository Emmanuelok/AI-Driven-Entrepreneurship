"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase";
import { Search, Loader2, MessageSquare, FileText, KanbanSquare, Calendar, Paperclip, X, ArrowUpRight } from "lucide-react";
import type { GlobalSearchHit } from "@/app/api/v2/me/search/route";

// Global cross-workspace search palette. Cmd/Ctrl+K opens it from the
// Workspaces hub; every hit shows the workspace it came from with the
// workspace's accent dot, so the user can scan results across many
// rooms at once. Click → deep-link to that workspace.

const KIND_ICON: Record<GlobalSearchHit["kind"], typeof MessageSquare> = {
  message: MessageSquare,
  note: FileText,
  task: KanbanSquare,
  deadline: Calendar,
  file: Paperclip,
};

const KIND_LABEL: Record<GlobalSearchHit["kind"], string> = {
  message: "Discussion",
  note: "Notes",
  task: "Tasks",
  deadline: "Deadlines",
  file: "Files",
};

const ACCENT_HEX: Record<string, string> = {
  emerald: "#2cc295",
  amber: "#f4a949",
  indigo: "#6c8cff",
  rust: "#d96444",
};

export function GlobalWorkspaceSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<GlobalSearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastQueryRef = useRef("");

  useEffect(() => {
    if (open) {
      setQ("");
      setResults([]);
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const trimmed = q.trim();
    if (trimmed.length < 2) { setResults([]); setLoading(false); return; }
    setLoading(true);
    const t = setTimeout(async () => {
      const sb = supabaseBrowser();
      if (!sb) { setLoading(false); return; }
      const { data: sess } = await sb.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) { setLoading(false); return; }
      try {
        lastQueryRef.current = trimmed;
        const res = await fetch(`/api/v2/me/search?q=${encodeURIComponent(trimmed)}`, { headers: { Authorization: `Bearer ${token}` } });
        const data = (await res.json()) as { ok: boolean; results?: GlobalSearchHit[] };
        if (lastQueryRef.current !== trimmed) return; // stale
        setResults(data.ok && data.results ? data.results : []);
        setActive(0);
      } finally {
        setLoading(false);
      }
    }, 240);
    return () => clearTimeout(t);
  }, [q, open]);

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

  // Group by workspace first (more useful than by kind across workspaces).
  const groupedByWs = useMemo(() => {
    const m = new Map<string, { title: string; accent: string; items: GlobalSearchHit[] }>();
    for (const r of results) {
      const g = m.get(r.workspace_id) ?? { title: r.workspace_title, accent: r.workspace_accent, items: [] };
      g.items.push(r);
      m.set(r.workspace_id, g);
    }
    return m;
  }, [results]);

  function jump(hit: GlobalSearchHit) {
    router.push(`/studio/workspaces/${hit.workspace_id}`);
    onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-start justify-center pt-[10vh] px-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="glass rounded-2xl w-full max-w-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Search className="size-4 text-emerald shrink-0" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search across every workspace — messages, notes, tasks, deadlines, files…"
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted"
          />
          {loading && <Loader2 className="size-3.5 text-muted animate-spin" />}
          <button onClick={onClose} className="size-7 rounded-md text-muted hover:text-foreground hover:bg-surface-2 flex items-center justify-center" aria-label="Close">
            <X className="size-3.5" />
          </button>
        </div>

        <div className="max-h-[65vh] overflow-y-auto">
          {q.trim().length < 2 ? (
            <div className="px-4 py-12 text-center text-xs text-muted">
              Search across every workspace you belong to. Archived workspaces are hidden.
            </div>
          ) : results.length === 0 && !loading ? (
            <div className="px-4 py-12 text-center text-sm text-muted">No matches.</div>
          ) : (
            <div className="p-2 space-y-3">
              {Array.from(groupedByWs.entries()).map(([wsId, group]) => (
                <div key={wsId}>
                  <div className="flex items-center gap-2 px-2 mb-1">
                    <span className="size-1.5 rounded-full" style={{ background: ACCENT_HEX[group.accent] ?? ACCENT_HEX.emerald }} />
                    <span className="text-[10px] uppercase tracking-widest text-foreground/80">{group.title}</span>
                    <span className="text-[10px] text-muted">· {group.items.length}</span>
                  </div>
                  <ul>
                    {group.items.map((hit) => {
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
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium truncate">{hit.title}</span>
                                <span className="text-[9px] uppercase tracking-widest text-muted shrink-0">{KIND_LABEL[hit.kind]}</span>
                              </div>
                              {hit.snippet && <div className="text-[11px] text-muted line-clamp-2 leading-snug mt-0.5">{hit.snippet}</div>}
                              <div className="text-[10px] text-muted mt-0.5">{hit.meta}</div>
                            </div>
                            {isActive && <ArrowUpRight className="size-3.5 text-emerald shrink-0 mt-1" />}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
          <div className="px-4 py-2 border-t border-border text-[10px] text-muted flex items-center gap-3">
            <span><kbd className="px-1.5 py-0.5 rounded bg-surface-2 text-foreground/70">↑↓</kbd> navigate</span>
            <span><kbd className="px-1.5 py-0.5 rounded bg-surface-2 text-foreground/70">↵</kbd> open workspace</span>
            <span><kbd className="px-1.5 py-0.5 rounded bg-surface-2 text-foreground/70">Esc</kbd> close</span>
          </div>
        </div>
      </div>
    </div>
  );
}
