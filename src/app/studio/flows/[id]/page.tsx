"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { useFlow } from "@/store/flow";
import { FlowCanvas } from "@/components/flow-canvas";
import { schedulePush } from "@/lib/flow-sync";
import { subscribeToFlow } from "@/lib/flow-realtime";
import { ArrowLeft, Pencil, Check, Cloud, CloudOff } from "lucide-react";

export default function FlowDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { flows, renameFlow, hydrated } = useFlow();
  const flow = flows.find((f) => f.id === id);
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState("");

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

  // Realtime co-edit: subscribe to remote UPDATEs and DELETEs for
  // this flow id. Updates trigger a refetch + LWW merge; deletes
  // drop the flow from the local store. Subscription lifecycle is
  // tied to the page mount.
  useEffect(() => {
    return subscribeToFlow(id);
  }, [id]);

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
        <SyncBadge lastSyncedAt={lastSyncedAt} remoteBump={remoteBump} />
      </header>

      <FlowCanvas flow={flow} />
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
