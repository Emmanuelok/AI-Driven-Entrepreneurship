"use client";

import { useEffect, useMemo, useRef } from "react";
import * as Y from "yjs";
import { supabaseBrowser } from "@/lib/supabase";
import { useFlow, type Flow } from "@/store/flow";
import { flowToDoc, docToFlow, encodeUpdate, applyUpdate, getFlowMaps } from "@/lib/flow-crdt";
import { schedulePush } from "@/lib/flow-sync";
import type { RealtimeChannel } from "@supabase/supabase-js";

// Phase 3b: live multi-peer co-edit via a Y.Doc per flow, transported
// over a Supabase broadcast channel.
//
// Topology:
//
//   zustand store  ←→  Y.Doc  ←→  Supabase broadcast  ←→  Y.Doc on peer
//        ↓
//   cloud_flows JSONB (durable cold-start snapshot, debounced)
//
// Echo suppression is structural: every Y.Doc transaction is tagged
// with an origin ("local" | "remote"). The 'update' listener only
// broadcasts when origin === "local". Incoming updates apply with
// origin "remote" so they never re-emit.
//
// Persistence rides on top of Y.Doc updates: every update schedules
// a debounced JSONB upsert via the existing schedulePush. New devices
// cold-start by fetching the JSONB and seeding the Y.Doc from it.
//
// Awareness (per-node lock chips) is handled separately in
// flow-presence.ts — that channel is independent of the data channel.

const LOCAL = Symbol("local");
const REMOTE = Symbol("remote");

// We dedupe by exact update bytes so a local update that round-trips
// through the broadcast doesn't replay against our own doc. The set
// is per-flow and gets garbage-collected when the hook unmounts.
function fingerprint(u: Uint8Array): string {
  // 32-bit hash; collisions are theoretically possible but at the
  // sub-millisecond timescale we care about, the worst case is one
  // missed update — sync converges anyway.
  let h = 5381;
  for (let i = 0; i < u.length; i++) h = ((h << 5) + h + u[i]) | 0;
  return `${u.length}:${h}`;
}

export type FlowCrdtHandle = {
  doc: Y.Doc;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
};

// Hydrate + sync one flow. The hook owns a Y.Doc, an UndoManager,
// and the Supabase channel; it bridges Y.Doc changes back into the
// zustand store via upsertFromCloud so the existing UI keeps reading
// from the same place.
//
// The hook is intentionally idempotent over flowId: pass the same
// id across re-renders and it keeps the same Y.Doc instance.
export function useFlowCrdt(flow: Flow | undefined): FlowCrdtHandle | null {
  const { upsertFromCloud } = useFlow();
  // One Y.Doc per flowId for the page lifetime.
  const docRef = useRef<Y.Doc | null>(null);
  const undoRef = useRef<Y.UndoManager | null>(null);
  const seenRef = useRef<Set<string>>(new Set());
  const lastSyncedSnapshotRef = useRef<string>("");
  // The updatedAt of the most recent doc → store projection. Mirror
  // skips when the flow's updatedAt equals it (no self-echo loop).
  const lastProjectedAtRef = useRef<number>(0);

  // Seed the Y.Doc from the local flow on first run only. After
  // that, mutations flow Y.Doc → store → … never store → Y.Doc, so
  // an external store change shouldn't blow away Y state.
  const flowId = flow?.id ?? null;
  useEffect(() => {
    if (!flowId || !flow) return;
    if (docRef.current) return; // already seeded for this id

    const doc = flowToDoc(flow);
    docRef.current = doc;

    // UndoManager scope: every Y type we care about. Y.UndoManager
    // takes a single type or array; passing the nested Maps means
    // undo also covers per-field changes inside a node.
    const { meta, nodes, edges } = getFlowMaps(doc);
    undoRef.current = new Y.UndoManager([meta, nodes, edges], {
      // Only undo our own edits — remote peers' edits aren't ours to
      // take back.
      trackedOrigins: new Set([LOCAL]),
      captureTimeout: 600,
    });

    return () => {
      undoRef.current?.destroy();
      undoRef.current = null;
      doc.destroy();
      docRef.current = null;
    };
  }, [flowId, flow]);

  // Wire the broadcast transport + the doc → store projection.
  useEffect(() => {
    const doc = docRef.current;
    if (!doc || !flowId) return;
    const sb = supabaseBrowser();
    // No Supabase → still useful locally: undo/redo + the rest of the
    // hook works, just no peer sync.

    let channel: RealtimeChannel | null = null;
    if (sb) {
      channel = sb.channel(`flow-crdt:${flowId}`, {
        config: { broadcast: { self: false } },
      });
      channel.on("broadcast", { event: "y-update" }, ({ payload }: { payload?: { u?: number[] } }) => {
        const arr = payload?.u;
        if (!Array.isArray(arr)) return;
        const u = new Uint8Array(arr);
        const fp = fingerprint(u);
        if (seenRef.current.has(fp)) return;     // we've already applied this
        seenRef.current.add(fp);
        // Cap the dedupe set so it doesn't grow unboundedly during a
        // long editing session.
        if (seenRef.current.size > 500) seenRef.current = new Set(Array.from(seenRef.current).slice(-250));
        doc.transact(() => applyUpdate(doc, u), REMOTE);
      });
      channel.subscribe();
    }

    // doc 'update' listener: broadcast local updates and reproject
    // the full flow into the zustand store. Remote-origin updates
    // skip the broadcast (we already got them from the wire).
    const onUpdate = (u: Uint8Array, origin: unknown) => {
      const fp = fingerprint(u);
      seenRef.current.add(fp);
      if (origin === LOCAL && channel) {
        // Broadcast as a plain number array — Supabase's broadcast
        // payload is JSON-only.
        void channel.send({ type: "broadcast", event: "y-update", payload: { u: Array.from(u) } });
      }
      // Reproject into the store. Bump updatedAt so schedulePush
      // catches the change for durable persistence.
      const projected = docToFlow(doc);
      projected.updatedAt = Date.now();
      lastProjectedAtRef.current = projected.updatedAt;
      // Idempotency: if the snapshot is byte-identical to the last
      // one we pushed, skip — avoids redundant zustand churn.
      const snap = JSON.stringify(projected);
      if (snap === lastSyncedSnapshotRef.current) return;
      lastSyncedSnapshotRef.current = snap;
      upsertFromCloud(projected);
      schedulePush(projected);
    };
    doc.on("update", onUpdate);

    return () => {
      doc.off("update", onUpdate);
      if (channel) {
        void sb?.removeChannel(channel);
      }
    };
  }, [flowId, upsertFromCloud]);

  // Mirror local zustand mutations INTO the Y.Doc. The doc 'update'
  // listener then broadcasts them to peers. We compare the current
  // flow against the Y.Doc projection and apply the differences in
  // one LOCAL transact.
  //
  // Echo guard: skip when the flow's updatedAt equals our last
  // projection (means the change just came FROM the doc).
  useEffect(() => {
    const doc = docRef.current;
    if (!doc || !flow) return;
    if (flow.updatedAt === lastProjectedAtRef.current) return;

    const projected = docToFlow(doc);
    if (JSON.stringify(projected) === JSON.stringify({
      ...flow,
      // Ignore meta-only updatedAt drift — only structural diffs matter.
      updatedAt: projected.updatedAt,
    })) return;

    mutateLocal(doc, () => {
      const { meta, nodes, edges } = getFlowMaps(doc);
      // Meta scalars
      if (meta.get("name") !== flow.name) meta.set("name", flow.name);
      if (meta.get("description") !== flow.description) meta.set("description", flow.description);

      // Nodes: upsert + delete
      const localNodeIds = new Set(flow.nodes.map((n) => n.id));
      nodes.forEach((_, id) => { if (!localNodeIds.has(id)) nodes.delete(id); });
      for (const n of flow.nodes) {
        let m = nodes.get(n.id);
        if (!m) {
          m = new Y.Map<unknown>();
          nodes.set(n.id, m);
        }
        // Apply per-field updates only when they actually changed so
        // we don't generate noisy CRDT ops for no-op renders.
        const setIf = (k: string, v: unknown) => { if (m!.get(k) !== v) m!.set(k, v); };
        setIf("id", n.id);
        setIf("kind", n.kind);
        setIf("x", n.x);
        setIf("y", n.y);
        setIf("label", n.label);
        // Complex values: deep-equal check via JSON. Cheap at flow
        // scale; correct for plain data we store.
        if (JSON.stringify(m.get("config")) !== JSON.stringify(n.config)) m.set("config", n.config);
        if (JSON.stringify(m.get("output")) !== JSON.stringify(n.output)) m.set("output", n.output);
        if (JSON.stringify(m.get("runs")) !== JSON.stringify(n.runs)) m.set("runs", n.runs);
        setIf("status", n.status);
        setIf("error", n.error);
      }

      // Edges: upsert + delete (whole-object compare is fine; edges
      // are small).
      const localEdgeIds = new Set(flow.edges.map((e) => e.id));
      edges.forEach((_, id) => { if (!localEdgeIds.has(id)) edges.delete(id); });
      for (const e of flow.edges) {
        let m = edges.get(e.id);
        if (!m) {
          m = new Y.Map<unknown>();
          edges.set(e.id, m);
        }
        if (m.get("fromNodeId") !== e.fromNodeId) m.set("fromNodeId", e.fromNodeId);
        if (m.get("toNodeId") !== e.toNodeId) m.set("toNodeId", e.toNodeId);
        if (m.get("id") !== e.id) m.set("id", e.id);
      }
    });
  }, [flow]);

  // Stable handle for the page to drive undo/redo + (later) imperative
  // doc access.
  return useMemo<FlowCrdtHandle | null>(() => {
    const doc = docRef.current;
    if (!doc) return null;
    return {
      doc,
      undo: () => undoRef.current?.undo(),
      redo: () => undoRef.current?.redo(),
      canUndo: () => !!undoRef.current && undoRef.current.canUndo(),
      canRedo: () => !!undoRef.current && undoRef.current.canRedo(),
    };
    // We rebuild the handle when the doc reference changes (new flowId).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docRef.current]);
}

// Helper: apply a local mutation as a Y.Doc transact with the LOCAL
// origin tag, so the 'update' listener broadcasts it. Exposed for
// callers that want to mutate the doc directly (e.g. an action
// debouncer in a follow-up). The zustand store integration in this
// session is one-way (doc → store reproject) — direct doc mutation
// stays opt-in for now.
export function mutateLocal(doc: Y.Doc, fn: () => void): void {
  doc.transact(fn, LOCAL);
}

export { LOCAL, REMOTE };
