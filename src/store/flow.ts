"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { nanoid } from "nanoid";
import type { NodeKind } from "@/lib/flow-nodes";

// Flow store — local-first (zustand persist). A cloud sync layer will
// land in Phase 2; the schema below is shaped so a mirror table can
// be added without breaking the store API.
//
// Edges are implicit + explicit: @<id> references in prompts create
// implicit dependencies (resolved at run time), and the user can
// also draw explicit edges in the UI for nodes that don't @-reference
// each other but still flow together visually.

export type FlowNode = {
  id: string;            // short nanoid (8) — also used as @-ref token
  kind: NodeKind;
  x: number;
  y: number;
  label: string;         // user-visible name (defaults to kind label + index)
  // Per-kind config. We keep this flat (no discriminated union) so the
  // store API stays simple — each component reads only the fields it
  // cares about.
  config: {
    prompt?: string;     // free-form prompt for AI nodes
    text?: string;       // body for note nodes
    problemId?: string;  // selected Atlas problem id for problem nodes
    model?: string;      // model id; defaults to claude-sonnet-4-6
    customerHint?: string; // persona-only: extra guidance
  };
  output?: {
    text?: string;
    html?: string;       // build nodes
    json?: Record<string, unknown>; // structured (persona, etc.)
    tokensIn?: number;
    tokensOut?: number;
    durationMs?: number;
    runAt?: number;
  };
  // Bounded run history (last 10). Powers the "Play with" timeline
  // scrub — you can step back through prior runs without losing the
  // current one. Capped at 10 so persisted store size stays sensible.
  runs?: Array<{
    ts: number;
    text?: string;
    html?: string;
    json?: Record<string, unknown>;
    tokensIn?: number;
    tokensOut?: number;
    durationMs?: number;
    promptUsed?: string;  // the resolved prompt sent for that run
  }>;
  status: "idle" | "running" | "ok" | "error";
  error?: string;
};

export type FlowEdge = {
  id: string;
  fromNodeId: string;
  toNodeId: string;
};

export type Flow = {
  id: string;
  name: string;
  description: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  createdAt: number;
  updatedAt: number;
};

type State = {
  flows: Flow[];
  hydrated: boolean;

  createFlow: (name?: string) => string;
  deleteFlow: (id: string) => void;
  // Merge a cloud-fetched flow into the local store. If the local
  // copy is newer (later updatedAt) we keep ours — last-write-wins.
  upsertFromCloud: (flow: Flow) => void;
  renameFlow: (id: string, name: string) => void;
  updateFlowMeta: (id: string, patch: Partial<Pick<Flow, "name" | "description">>) => void;

  addNode: (flowId: string, kind: NodeKind, x: number, y: number) => string;
  removeNode: (flowId: string, nodeId: string) => void;
  moveNode: (flowId: string, nodeId: string, x: number, y: number) => void;
  patchNodeConfig: (flowId: string, nodeId: string, patch: Partial<FlowNode["config"]>) => void;
  setNodeLabel: (flowId: string, nodeId: string, label: string) => void;
  setNodeStatus: (flowId: string, nodeId: string, status: FlowNode["status"], error?: string) => void;
  setNodeOutput: (flowId: string, nodeId: string, output: FlowNode["output"]) => void;

  addEdge: (flowId: string, fromNodeId: string, toNodeId: string) => void;
  removeEdge: (flowId: string, edgeId: string) => void;
};

const dummy = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

function nextNodeLabel(nodes: FlowNode[], kind: NodeKind): string {
  // "Problem 1", "Problem 2" — keeps labels short and predictable.
  const n = nodes.filter((x) => x.kind === kind).length + 1;
  return `${kind[0].toUpperCase() + kind.slice(1)} ${n}`;
}

export const useFlow = create<State>()(
  persist(
    (set, get) => ({
      flows: [],
      hydrated: false,

      createFlow: (name) => {
        const id = nanoid(8);
        const flow: Flow = {
          id,
          name: name?.trim() || "Untitled flow",
          description: "",
          nodes: [],
          edges: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        set({ flows: [flow, ...get().flows] });
        return id;
      },
      deleteFlow: (id) => set({ flows: get().flows.filter((f) => f.id !== id) }),
      upsertFromCloud: (incoming) => set({
        flows: (() => {
          const cur = get().flows;
          const i = cur.findIndex((f) => f.id === incoming.id);
          if (i < 0) return [incoming, ...cur];
          // Local newer → keep ours (avoids clobbering unsaved edits
          // that just haven't synced yet).
          if (cur[i].updatedAt >= incoming.updatedAt) return cur;
          const next = cur.slice();
          next[i] = incoming;
          return next;
        })(),
      }),
      renameFlow: (id, name) => set({ flows: get().flows.map((f) => f.id === id ? { ...f, name, updatedAt: Date.now() } : f) }),
      updateFlowMeta: (id, patch) => set({ flows: get().flows.map((f) => f.id === id ? { ...f, ...patch, updatedAt: Date.now() } : f) }),

      addNode: (flowId, kind, x, y) => {
        const id = nanoid(8);
        set({
          flows: get().flows.map((f) => {
            if (f.id !== flowId) return f;
            const node: FlowNode = {
              id, kind, x, y,
              label: nextNodeLabel(f.nodes, kind),
              config: { model: "claude-sonnet-4-6" },
              status: "idle",
            };
            return { ...f, nodes: [...f.nodes, node], updatedAt: Date.now() };
          }),
        });
        return id;
      },
      removeNode: (flowId, nodeId) => {
        set({
          flows: get().flows.map((f) => f.id !== flowId ? f : {
            ...f,
            nodes: f.nodes.filter((n) => n.id !== nodeId),
            edges: f.edges.filter((e) => e.fromNodeId !== nodeId && e.toNodeId !== nodeId),
            updatedAt: Date.now(),
          }),
        });
      },
      moveNode: (flowId, nodeId, x, y) => {
        set({
          flows: get().flows.map((f) => f.id !== flowId ? f : {
            ...f,
            nodes: f.nodes.map((n) => n.id === nodeId ? { ...n, x, y } : n),
            updatedAt: Date.now(),
          }),
        });
      },
      patchNodeConfig: (flowId, nodeId, patch) => {
        set({
          flows: get().flows.map((f) => f.id !== flowId ? f : {
            ...f,
            nodes: f.nodes.map((n) => n.id === nodeId ? { ...n, config: { ...n.config, ...patch } } : n),
            updatedAt: Date.now(),
          }),
        });
      },
      setNodeLabel: (flowId, nodeId, label) => {
        set({
          flows: get().flows.map((f) => f.id !== flowId ? f : {
            ...f,
            nodes: f.nodes.map((n) => n.id === nodeId ? { ...n, label: label.slice(0, 60) } : n),
            updatedAt: Date.now(),
          }),
        });
      },
      setNodeStatus: (flowId, nodeId, status, error) => {
        set({
          flows: get().flows.map((f) => f.id !== flowId ? f : {
            ...f,
            nodes: f.nodes.map((n) => n.id === nodeId ? { ...n, status, error: error ?? n.error } : n),
            updatedAt: Date.now(),
          }),
        });
      },
      setNodeOutput: (flowId, nodeId, output) => {
        set({
          flows: get().flows.map((f) => f.id !== flowId ? f : {
            ...f,
            nodes: f.nodes.map((n) => {
              if (n.id !== nodeId) return n;
              // Append to runs[] (capped at 10) so the scrubber has
              // history without ballooning the persisted store.
              const runs = (n.runs ?? []).slice(-9);
              if (output) {
                runs.push({
                  ts: output.runAt ?? Date.now(),
                  text: output.text,
                  html: output.html,
                  json: output.json,
                  tokensIn: output.tokensIn,
                  tokensOut: output.tokensOut,
                  durationMs: output.durationMs,
                });
              }
              return { ...n, output, runs, status: "ok" } as FlowNode;
            }),
            updatedAt: Date.now(),
          }),
        });
      },

      addEdge: (flowId, fromNodeId, toNodeId) => {
        if (fromNodeId === toNodeId) return;
        set({
          flows: get().flows.map((f) => {
            if (f.id !== flowId) return f;
            const exists = f.edges.some((e) => e.fromNodeId === fromNodeId && e.toNodeId === toNodeId);
            if (exists) return f;
            return { ...f, edges: [...f.edges, { id: nanoid(8), fromNodeId, toNodeId }], updatedAt: Date.now() };
          }),
        });
      },
      removeEdge: (flowId, edgeId) => {
        set({
          flows: get().flows.map((f) => f.id !== flowId ? f : {
            ...f,
            edges: f.edges.filter((e) => e.id !== edgeId),
            updatedAt: Date.now(),
          }),
        });
      },
    }),
    {
      name: "sankofa-flow-v1",
      storage: createJSONStorage(() => (typeof window === "undefined" ? dummy : localStorage)),
      onRehydrateStorage: () => (state) => { if (state) state.hydrated = true; },
    },
  ),
);

// Resolve @<id-or-label> references in a node's prompt against the
// upstream nodes' outputs. Returns the prompt with references replaced
// by the referenced node's text output. Unresolvable refs are left in
// place (so the user sees the typo).
export function resolveRefs(prompt: string, nodes: FlowNode[]): string {
  return prompt.replace(/@([a-zA-Z0-9_-]+)/g, (full, token) => {
    const t = token.toLowerCase();
    const match = nodes.find((n) => n.id === token || n.label.toLowerCase().replace(/\s+/g, "_") === t || n.label.toLowerCase() === t);
    if (!match?.output?.text) return full;
    return `[from ${match.label}]\n${match.output.text}\n[/from ${match.label}]`;
  });
}

// Topological sort — returns node ids in dependency order. Cycles are
// reported (the UI can highlight). Combines edges and implicit @-refs.
export function topoSort(flow: Flow): { order: string[]; cycle: boolean } {
  const adj = new Map<string, Set<string>>();
  for (const n of flow.nodes) adj.set(n.id, new Set());
  for (const e of flow.edges) adj.get(e.fromNodeId)?.add(e.toNodeId);
  // Implicit deps via @-refs in prompts.
  for (const n of flow.nodes) {
    const text = n.config.prompt ?? "";
    const refs = text.match(/@([a-zA-Z0-9_-]+)/g) ?? [];
    for (const ref of refs) {
      const token = ref.slice(1);
      const tk = token.toLowerCase();
      const target = flow.nodes.find((x) => x.id === token || x.label.toLowerCase().replace(/\s+/g, "_") === tk);
      if (target && target.id !== n.id) adj.get(target.id)?.add(n.id);
    }
  }
  // Kahn's algorithm.
  const indeg = new Map<string, number>();
  for (const id of adj.keys()) indeg.set(id, 0);
  for (const [, outs] of adj) for (const t of outs) indeg.set(t, (indeg.get(t) ?? 0) + 1);
  const queue: string[] = [];
  for (const [id, d] of indeg) if (d === 0) queue.push(id);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const t of adj.get(id) ?? []) {
      const d = (indeg.get(t) ?? 0) - 1;
      indeg.set(t, d);
      if (d === 0) queue.push(t);
    }
  }
  return { order, cycle: order.length !== flow.nodes.length };
}
