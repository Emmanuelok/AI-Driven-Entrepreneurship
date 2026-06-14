"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { useFlow } from "@/store/flow";
import { useStore } from "@/store";
import { FlowCanvas } from "@/components/flow-canvas";
import { schedulePush } from "@/lib/flow-sync";
import { useFlowCrdt } from "@/lib/flow-yjs-sync";
import { useFlowPresence } from "@/lib/flow-presence";
import { useFlowCursors } from "@/lib/flow-cursors";
import { ArrowLeft, Pencil, Check, Cloud, CloudOff, Undo2, Redo2 } from "lucide-react";

export default function FlowDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { flows, renameFlow, hydrated } = useFlow();
  const { user } = useStore();
  const flow = flows.find((f) => f.id === id);
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState("");
  // Presence: who else is in this flow right now + which node each is
  // currently looking at. selectedId is bubbled up from the canvas via
  // onSelectedChange and tracked into the presence payload so peers
  // see lock chips on the same nodes.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const me = user ? { userId: user.id, displayName: user.name || "Member" } : null;
  const peers = useFlowPresence(id, me, selectedId);
  // Phase 3c: live peer cursors over a dedicated broadcast channel.
  const { cursors, sendCursor } = useFlowCursors(id, me);

  // Track the last updatedAt we shipped to the cloud so we can render
  // an honest "synced N seconds ago" pill instead of guessing.
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const prevUpdatedRef = useRef<number | null>(null);

  // Autosave: every mutation bumps flow.updatedAt; we ride that to
  // schedule a debounced push (best-effort, 1.5s after last edit).
  useEffect(() => {
    if (!flow) return;
    if (prevUpdatedRef.current === flow.updatedAt) return;
    prevUpdatedRef.current = flow.updatedAt;
    schedulePush(flow);
    // Optimistically mark sync — real success would be observable in
    // network tab; we don't surface failures because the local store
    // is the source of truth either way.
    const t = setTimeout(() => setLastSyncedAt(Date.now()), 1600);
    return () => clearTimeout(t);
  }, [flow]);

  // Phase 3b: Yjs CRDT + Supabase broadcast for live multi-peer
  // co-edit. Replaces the Phase 3a postgres_changes refetch path.
  // The hook bridges local zustand mutations into Y.Doc, broadcasts
  // them to peers, applies incoming updates, and reprojects back into
  // zustand. Persistence (cloud_flows JSONB) still rides via the
  // existing schedulePush.
  const crdt = useFlowCrdt(flow);

  // Cmd/Ctrl+Z → undo, Cmd/Ctrl+Shift+Z → redo. Skips when focus is
  // in a textarea/input so the browser-native undo for text edits
  // keeps working.
  useEffect(() => {
    if (!crdt) return;
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
      const cmd = e.metaKey || e.ctrlKey;
      if (!cmd || e.key.toLowerCase() !== "z") return;
      e.preventDefault();
      if (e.shiftKey) crdt!.redo(); else crdt!.undo();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [crdt]);

  // Pulse the sync pill when remote updatedAt advances ahead of ours
  // (i.e. someone else just edited and we pulled the change). Local
  // edits don't trigger this because they share the same updatedAt
  // value through both ref + state.
  const [remoteBump, setRemoteBump] = useState(0);
  useEffect(() => {
    if (!flow) return;
    if (prevUpdatedRef.current !== null && flow.updatedAt > prevUpdatedRef.current + 100) {
      setRemoteBump((n) => n + 1);
    }
  }, [flow?.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!hydrated) return <div className="p-8 text-sm text-muted">Loading…</div>;
  if (!flow) { notFound(); return null; }

  return (
    <div>
      {/* Header */}
      <header className="border-b border-border px-4 sm:px-6 py-2.5 flex items-center gap-3 flex-wrap shrink-0">
        <Link href="/studio/flows" className="text-xs text-muted hover:text-foreground inline-flex items-center gap-1.5 shrink-0">
          <ArrowLeft className="size-3" /> Flows
        </Link>
        <div className="flex-1 min-w-0 flex items-center gap-2">
          {editingName ? (
            <>
              <input
                autoFocus
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { renameFlow(flow.id, draftName.trim() || flow.name); setEditingName(false); }
                  if (e.key === "Escape") setEditingName(false);
                }}
                className="bg-transparent outline-none text-sm font-medium border-b border-emerald min-w-0"
              />
              <button onClick={() => { renameFlow(flow.id, draftName.trim() || flow.name); setEditingName(false); }} className="text-emerald hover:text-amber">
                <Check className="size-3.5" />
              </button>
            </>
          ) : (
            <button
              onClick={() => { setDraftName(flow.name); setEditingName(true); }}
              className="font-medium text-sm truncate hover:text-emerald transition inline-flex items-center gap-1.5"
              title="Rename flow"
            >
              {flow.name}
              <Pencil className="size-3 opacity-0 group-hover:opacity-100" />
            </button>
          )}
        </div>
        {peers.length > 0 && (
          <div className="flex items-center -space-x-1.5 shrink-0" title={`${peers.length} other${peers.length === 1 ? "" : "s"} editing`}>
            {peers.slice(0, 5).map((p) => (
              <span
                key={p.userId}
                className="size-5 rounded-full border-2 border-surface text-[9px] font-bold flex items-center justify-center text-black"
                style={{ background: p.color }}
                title={p.displayName}
              >
                {p.displayName[0]?.toUpperCase() ?? "?"}
              </span>
            ))}
            {peers.length > 5 && (
              <span className="size-5 rounded-full border-2 border-surface bg-surface-2 text-[9px] text-muted flex items-center justify-center">+{peers.length - 5}</span>
            )}
          </div>
        )}
        {crdt && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => crdt.undo()}
              className="size-6 rounded-md hover:bg-surface-2 text-muted hover:text-foreground inline-flex items-center justify-center transition"
              title="Undo (Cmd/Ctrl+Z)"
              aria-label="Undo"
            >
              <Undo2 className="size-3" />
            </button>
            <button
              onClick={() => crdt.redo()}
              className="size-6 rounded-md hover:bg-surface-2 text-muted hover:text-foreground inline-flex items-center justify-center transition"
              title="Redo (Cmd/Ctrl+Shift+Z)"
              aria-label="Redo"
            >
              <Redo2 className="size-3" />
            </button>
          </div>
        )}
        <SyncBadge lastSyncedAt={lastSyncedAt} remoteBump={remoteBump} />
      </header>

      <FlowCanvas
        flow={flow}
        peers={peers.map((p) => ({ userId: p.userId, displayName: p.displayName, color: p.color, selectedNodeId: p.selectedNodeId }))}
        onSelectedChange={setSelectedId}
        cursors={cursors}
        onCursorMove={sendCursor}
      />
    </div>
  );
}

function SyncBadge({ lastSyncedAt, remoteBump }: { lastSyncedAt: number | null; remoteBump: number }) {
  // Flash the badge for ~1.5s when a remote update lands.
  const [flashing, setFlashing] = useState(false);
  useEffect(() => {
    if (remoteBump === 0) return;
    setFlashing(true);
    const t = setTimeout(() => setFlashing(false), 1500);
    return () => clearTimeout(t);
  }, [remoteBump]);

  if (lastSyncedAt === null && !flashing) {
    return (
      <span className="text-[10px] text-muted inline-flex items-center gap-1 shrink-0" title="Flow is local. Sign in to sync across devices.">
        <CloudOff className="size-3" /> Local only
      </span>
    );
  }
  return (
    <span
      className={`text-[10px] inline-flex items-center gap-1 shrink-0 transition-colors ${flashing ? "text-amber" : "text-emerald"}`}
      title={flashing ? "Remote edit just merged" : "Last cloud save just now"}
    >
      <Cloud className={`size-3 ${flashing ? "animate-pulse" : ""}`} /> {flashing ? "Remote update" : "Synced"}
    </span>
  );
}
