import { describe, it, expect } from "vitest";
import * as Y from "yjs";
import { flowToDoc, docToFlow, encodeUpdate, applyUpdate } from "./flow-crdt";
import { LOCAL, REMOTE, mutateLocal } from "./flow-yjs-sync";
import type { Flow } from "@/store/flow";

// We can't exercise the React hook itself without a DOM + Supabase,
// but the two pieces it's built from — origin tagging on transact +
// fingerprint-based echo dedupe — are testable in isolation.

function flow(): Flow {
  return {
    id: "f1", name: "Sync test", description: "",
    createdAt: 1, updatedAt: 1,
    nodes: [{ id: "n1", kind: "problem", label: "P", x: 0, y: 0, config: {}, status: "idle" }],
    edges: [],
  };
}

describe("origin tagging on Y.Doc transacts", () => {
  it("update listener receives the symbol we passed as origin", () => {
    const doc = flowToDoc(flow());
    const origins: unknown[] = [];
    doc.on("update", (_u: Uint8Array, origin: unknown) => { origins.push(origin); });

    mutateLocal(doc, () => {
      doc.getMap("meta").set("name", "renamed");
    });
    // Apply an "incoming" update with REMOTE origin.
    const other = flowToDoc(flow());
    other.getMap("meta").set("name", "from peer");
    doc.transact(() => applyUpdate(doc, encodeUpdate(other)), REMOTE);

    expect(origins).toContain(LOCAL);
    expect(origins).toContain(REMOTE);
    // No transact without an explicit origin should have happened.
    for (const o of origins) {
      expect(o === LOCAL || o === REMOTE).toBe(true);
    }
  });

  it("an update broadcast by peer A applied to peer B converges values", () => {
    // Seed A from a flow; seed B as a fresh doc that pulls A's full
    // state. This mirrors what the real bootstrap does: cold-start
    // peers fetch the JSONB snapshot, hydrate locally, then start
    // listening for incremental broadcasts.
    const a = flowToDoc(flow());
    const b = new Y.Doc();
    applyUpdate(b, encodeUpdate(a));

    // A renames; broadcast the resulting incremental update bytes to B.
    let lastUpdate: Uint8Array | null = null;
    a.on("update", (u: Uint8Array, origin: unknown) => {
      if (origin === LOCAL) lastUpdate = u;
    });
    mutateLocal(a, () => { a.getMap("meta").set("name", "renamed by A"); });
    expect(lastUpdate).not.toBeNull();
    b.transact(() => applyUpdate(b, lastUpdate!), REMOTE);

    expect(b.getMap("meta").get("name")).toBe("renamed by A");
  });

  it("REMOTE-origin updates do not echo when listener filters by origin", () => {
    // The real hook only broadcasts when origin === LOCAL. This test
    // simulates that filter and confirms an incoming remote update
    // doesn't re-trigger a broadcast.
    const a = flowToDoc(flow());
    let broadcasts = 0;
    a.on("update", (_u: Uint8Array, origin: unknown) => {
      if (origin === LOCAL) broadcasts++;
    });

    const peerUpdate = (() => {
      const p = flowToDoc(flow());
      p.getMap("meta").set("name", "from peer");
      return encodeUpdate(p);
    })();
    a.transact(() => applyUpdate(a, peerUpdate), REMOTE);
    expect(broadcasts).toBe(0);

    mutateLocal(a, () => { a.getMap("meta").set("name", "from A"); });
    expect(broadcasts).toBe(1);
  });
});

describe("undo manager respects trackedOrigins", () => {
  it("only undoes local edits, not remote ones", () => {
    const a = flowToDoc(flow());
    const meta = a.getMap("meta");
    const undo = new Y.UndoManager(meta, { trackedOrigins: new Set([LOCAL]), captureTimeout: 0 });

    mutateLocal(a, () => meta.set("name", "local 1"));
    a.transact(() => meta.set("name", "remote intervention"), REMOTE);
    mutateLocal(a, () => meta.set("name", "local 2"));

    expect(meta.get("name")).toBe("local 2");
    undo.undo();
    // Undoes "local 2" → should land back on "remote intervention"
    // (which the undo manager never tracked, so it stays).
    expect(meta.get("name")).toBe("remote intervention");
    undo.undo();
    // Undoes "local 1" → meta name reverts to the seeded value.
    expect(meta.get("name")).toBe(flow().name);
  });
});
