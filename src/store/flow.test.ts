import { describe, it, expect } from "vitest";
import { resolveRefs, topoSort, type Flow, type FlowNode } from "./flow";

function node(id: string, label: string, prompt?: string, outputText?: string): FlowNode {
  return {
    id, label, kind: "wedge", x: 0, y: 0,
    config: { prompt },
    output: outputText ? { text: outputText } : undefined,
    status: "idle",
  };
}

function flow(nodes: FlowNode[], edges: { from: string; to: string }[] = []): Flow {
  return {
    id: "f", name: "test", description: "", createdAt: 0, updatedAt: 0,
    nodes,
    edges: edges.map((e, i) => ({ id: `e${i}`, fromNodeId: e.from, toNodeId: e.to })),
  };
}

describe("resolveRefs", () => {
  it("leaves a prompt with no refs unchanged", () => {
    const nodes = [node("a", "A", undefined, "hello")];
    expect(resolveRefs("write code", nodes)).toBe("write code");
  });

  it("resolves @<id> against the matching node's output text", () => {
    const nodes = [node("a", "A", undefined, "Mama Adwoa, tomato seller in Tamale")];
    const out = resolveRefs("Persona context: @a", nodes);
    expect(out).toContain("Mama Adwoa");
    expect(out).toContain("[from A]");
  });

  it("resolves @<label> case-insensitively with spaces → underscores", () => {
    const nodes = [node("xyz", "Problem 1", undefined, "post-harvest loss")];
    const out = resolveRefs("Refine @problem_1 for the persona", nodes);
    expect(out).toContain("post-harvest loss");
  });

  it("leaves unresolvable refs in place so the user sees the typo", () => {
    expect(resolveRefs("see @ghost", [])).toBe("see @ghost");
  });
});

describe("topoSort", () => {
  it("orders nodes by explicit edges", () => {
    const f = flow(
      [node("a", "A"), node("b", "B"), node("c", "C")],
      [{ from: "a", to: "b" }, { from: "b", to: "c" }],
    );
    const { order, cycle } = topoSort(f);
    expect(cycle).toBe(false);
    expect(order.indexOf("a")).toBeLessThan(order.indexOf("b"));
    expect(order.indexOf("b")).toBeLessThan(order.indexOf("c"));
  });

  it("adds an implicit dep when a prompt @-references another node", () => {
    const f = flow([
      node("a", "Problem"),
      node("b", "Wedge", "Tighten @Problem into a slice"),
    ]);
    const { order, cycle } = topoSort(f);
    expect(cycle).toBe(false);
    expect(order).toEqual(["a", "b"]);
  });

  it("flags a cycle", () => {
    const f = flow(
      [node("a", "A"), node("b", "B")],
      [{ from: "a", to: "b" }, { from: "b", to: "a" }],
    );
    expect(topoSort(f).cycle).toBe(true);
  });

  it("self-references don't count as a cycle", () => {
    const f = flow([node("a", "A", "see @a")]);
    expect(topoSort(f).cycle).toBe(false);
  });
});
