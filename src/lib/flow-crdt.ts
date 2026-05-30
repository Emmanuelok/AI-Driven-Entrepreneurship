// ─────────────────────────────────────────────────────────────────────────
// Flow CRDT (Phase 3b foundation).
//
// Phase 3a ships row-level LWW: when two users edit the same flow,
// the latest writer wins and earlier edits are overwritten silently.
// That's fine when co-edit is rare; it gets painful as soon as two
// people are in the same flow at once.
//
// Phase 3b moves the merge to a real CRDT (Y.Doc) so concurrent edits
// converge instead of clobbering each other:
//
//   user A drags node X to (100, 200)
//   user B simultaneously renames node X
//   → both edits land; nothing is lost
//
// This file is the foundation. It exposes the Y.Doc schema and the
// serialize/deserialize functions that bridge our existing FlowNode /
// FlowEdge shape to and from Y types. The actual sync layer
// (y-supabase or y-websocket adapter, awareness, undo manager) lands
// in a follow-up; this file is intentionally NOT yet wired into
// src/store/flow.ts so the LWW path keeps working.
//
// Schema design:
//
//   doc
//   ├─ meta:    Y.Map<string, string|number>   (id, name, description, createdAt, updatedAt)
//   ├─ nodes:   Y.Map<nodeId, Y.Map<field, value>>
//   └─ edges:   Y.Map<edgeId, Y.Map<field, value>>
//
// We use nested Y.Maps (not Y.Arrays) for nodes/edges because:
//   - lookup by id is constant time
//   - concurrent updates to different ids never conflict
//   - per-field updates inside one node are themselves CRDT merges
// ─────────────────────────────────────────────────────────────────────────

import * as Y from "yjs";
import type { Flow, FlowNode, FlowEdge } from "@/store/flow";

// ── Doc construction ────────────────────────────────────────────────────
export function newFlowDoc(): Y.Doc {
  return new Y.Doc();
}

export function getFlowMaps(doc: Y.Doc): {
  meta: Y.Map<unknown>;
  nodes: Y.Map<Y.Map<unknown>>;
  edges: Y.Map<Y.Map<unknown>>;
} {
  return {
    meta: doc.getMap("meta"),
    nodes: doc.getMap<Y.Map<unknown>>("nodes"),
    edges: doc.getMap<Y.Map<unknown>>("edges"),
  };
}

// ── Bridge: FlowNode/Edge ↔ Y.Map ───────────────────────────────────────
function nodeToYMap(n: FlowNode): Y.Map<unknown> {
  const m = new Y.Map<unknown>();
  m.set("id", n.id);
  m.set("kind", n.kind);
  m.set("x", n.x);
  m.set("y", n.y);
  m.set("label", n.label);
  m.set("config", n.config);
  if (n.output !== undefined) m.set("output", n.output);
  if (n.runs !== undefined) m.set("runs", n.runs);
  m.set("status", n.status);
  if (n.error !== undefined) m.set("error", n.error);
  return m;
}

function yMapToNode(m: Y.Map<unknown>): FlowNode {
  return {
    id: m.get("id") as string,
    kind: m.get("kind") as FlowNode["kind"],
    x: m.get("x") as number,
    y: m.get("y") as number,
    label: m.get("label") as string,
    config: (m.get("config") as FlowNode["config"]) ?? {},
    output: m.get("output") as FlowNode["output"],
    runs: m.get("runs") as FlowNode["runs"],
    status: (m.get("status") as FlowNode["status"]) ?? "idle",
    error: m.get("error") as string | undefined,
  };
}

function edgeToYMap(e: FlowEdge): Y.Map<unknown> {
  const m = new Y.Map<unknown>();
  m.set("id", e.id);
  m.set("fromNodeId", e.fromNodeId);
  m.set("toNodeId", e.toNodeId);
  return m;
}

function yMapToEdge(m: Y.Map<unknown>): FlowEdge {
  return {
    id: m.get("id") as string,
    fromNodeId: m.get("fromNodeId") as string,
    toNodeId: m.get("toNodeId") as string,
  };
}

// ── Whole-flow serialize / hydrate ──────────────────────────────────────
// Used at startup to seed a Y.Doc from the local zustand store, and
// at any point to project a Y.Doc back into the plain Flow shape the
// rest of the app reads from.

export function flowToDoc(flow: Flow): Y.Doc {
  const doc = newFlowDoc();
  const { meta, nodes, edges } = getFlowMaps(doc);
  doc.transact(() => {
    meta.set("id", flow.id);
    meta.set("name", flow.name);
    meta.set("description", flow.description);
    meta.set("createdAt", flow.createdAt);
    meta.set("updatedAt", flow.updatedAt);
    for (const n of flow.nodes) nodes.set(n.id, nodeToYMap(n));
    for (const e of flow.edges) edges.set(e.id, edgeToYMap(e));
  });
  return doc;
}

export function docToFlow(doc: Y.Doc): Flow {
  const { meta, nodes, edges } = getFlowMaps(doc);
  const out: Flow = {
    id: (meta.get("id") as string) ?? "",
    name: (meta.get("name") as string) ?? "Untitled flow",
    description: (meta.get("description") as string) ?? "",
    createdAt: (meta.get("createdAt") as number) ?? Date.now(),
    updatedAt: (meta.get("updatedAt") as number) ?? Date.now(),
    nodes: [],
    edges: [],
  };
  nodes.forEach((m) => out.nodes.push(yMapToNode(m)));
  edges.forEach((m) => out.edges.push(yMapToEdge(m)));
  return out;
}

// ── Update encoding for transport ───────────────────────────────────────
// In Phase 3b, the sync layer will exchange these encoded updates
// over a transport (probably a Supabase broadcast channel). The
// encoding is opaque bytes; decoders only need the Y.Doc instance.

export function encodeUpdate(doc: Y.Doc): Uint8Array {
  return Y.encodeStateAsUpdate(doc);
}

export function applyUpdate(doc: Y.Doc, update: Uint8Array): void {
  Y.applyUpdate(doc, update);
}
