import { describe, it, expect } from "vitest";
import * as Y from "yjs";
import { flowToDoc, docToFlow, applyUpdate, encodeUpdate, getFlowMaps } from "./flow-crdt";
import type { Flow, FlowNode } from "@/store/flow";

function makeNode(id: string, kind: FlowNode["kind"], label: string): FlowNode {
  return {
    id, kind, label, x: 100, y: 100,
    config: { prompt: `seed for ${label}` },
    status: "idle",
  };
}

function makeFlow(): Flow {
  return {
    id: "f1", name: "Test flow", description: "",
    createdAt: 1_700_000_000_000, updatedAt: 1_700_000_000_000,
    nodes: [
      makeNode("n1", "problem", "Problem"),
      makeNode("n2", "wedge", "Wedge"),
    ],
    edges: [{ id: "e1", fromNodeId: "n1", toNodeId: "n2" }],
  };
}

describe("flowToDoc / docToFlow round-trip", () => {
  it("preserves meta, nodes, and edges", () => {
    const original = makeFlow();
    const doc = flowToDoc(original);
    const restored = docToFlow(doc);
    expect(restored.id).toBe(original.id);
    expect(restored.name).toBe(original.name);
    expect(restored.nodes).toHaveLength(2);
    expect(restored.edges).toHaveLength(1);
    expect(restored.nodes.find((n) => n.id === "n1")?.label).toBe("Problem");
    expect(restored.edges[0].fromNodeId).toBe("n1");
  });

  it("preserves node config + status", () => {
    const restored = docToFlow(flowToDoc(makeFlow()));
    const n1 = restored.nodes.find((n) => n.id === "n1")!;
    expect(n1.config.prompt).toBe("seed for Problem");
    expect(n1.status).toBe("idle");
  });
});

describe("CRDT convergence", () => {
  it("two concurrent edits to different nodes both land", () => {
    const flow = makeFlow();
    // User A's doc + User B's doc start from the same state.
    const docA = flowToDoc(flow);
    const docB = new Y.Doc();
    applyUpdate(docB, encodeUpdate(docA));

    // A renames node n1; B moves node n2 — different ids, no conflict.
    const ma = getFlowMaps(docA);
    const mb = getFlowMaps(docB);
    (ma.nodes.get("n1") as Y.Map<unknown>).set("label", "Sharpened Problem");
    (mb.nodes.get("n2") as Y.Map<unknown>).set("x", 800);

    // Cross-apply both updates.
    applyUpdate(docB, encodeUpdate(docA));
    applyUpdate(docA, encodeUpdate(docB));

    const flowA = docToFlow(docA);
    const flowB = docToFlow(docB);
    expect(flowA.nodes.find((n) => n.id === "n1")?.label).toBe("Sharpened Problem");
    expect(flowA.nodes.find((n) => n.id === "n2")?.x).toBe(800);
    // Both docs converged to the same state.
    expect(flowA).toEqual(flowB);
  });

  it("concurrent edits to the same field of the same node converge deterministically (LWW within Y)", () => {
    // Y resolves concurrent same-key writes deterministically — both
    // peers end up agreeing on one winner; neither one's history is
    // lost from the doc's perspective.
    const flow = makeFlow();
    const docA = flowToDoc(flow);
    const docB = new Y.Doc();
    applyUpdate(docB, encodeUpdate(docA));

    (getFlowMaps(docA).nodes.get("n1") as Y.Map<unknown>).set("label", "From A");
    (getFlowMaps(docB).nodes.get("n1") as Y.Map<unknown>).set("label", "From B");

    applyUpdate(docB, encodeUpdate(docA));
    applyUpdate(docA, encodeUpdate(docB));

    // Same value on both sides — deterministic resolution.
    expect(docToFlow(docA).nodes.find((n) => n.id === "n1")?.label)
      .toBe(docToFlow(docB).nodes.find((n) => n.id === "n1")?.label);
  });

  it("a node added on B survives a round-trip into A", () => {
    const flow = makeFlow();
    const docA = flowToDoc(flow);
    const docB = new Y.Doc();
    applyUpdate(docB, encodeUpdate(docA));

    // B adds a new node.
    const { nodes } = getFlowMaps(docB);
    const m = new Y.Map<unknown>();
    m.set("id", "n3"); m.set("kind", "build"); m.set("x", 200); m.set("y", 200);
    m.set("label", "Build"); m.set("config", {}); m.set("status", "idle");
    nodes.set("n3", m);

    applyUpdate(docA, encodeUpdate(docB));
    expect(docToFlow(docA).nodes.map((n) => n.id).sort()).toEqual(["n1", "n2", "n3"]);
  });
});
