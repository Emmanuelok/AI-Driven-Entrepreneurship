import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { embed } from "./embeddings";

// We exercise only the local-fallback path so we don't hit Voyage in CI.
let savedKey: string | undefined;
beforeEach(() => { savedKey = process.env.VOYAGE_API_KEY; delete process.env.VOYAGE_API_KEY; });
afterEach(() => { if (savedKey) process.env.VOYAGE_API_KEY = savedKey; });

describe("embed (local fallback)", () => {
  it("returns one 1024-dim vector per input", async () => {
    const out = await embed(["hello world", "another input"]);
    expect(out).toHaveLength(2);
    expect(out[0]).toHaveLength(1024);
    expect(out[1]).toHaveLength(1024);
  });

  it("is deterministic — same text → same vector", async () => {
    const [a] = await embed(["the quick brown fox"]);
    const [b] = await embed(["the quick brown fox"]);
    expect(a).toEqual(b);
  });

  it("differs for different inputs", async () => {
    const [a] = await embed(["cassava prices in Lagos"]);
    const [b] = await embed(["fintech in Nairobi"]);
    expect(a).not.toEqual(b);
  });

  it("is case-insensitive (lowercase tokenization)", async () => {
    const [a] = await embed(["Hello World"]);
    const [b] = await embed(["hello world"]);
    expect(a).toEqual(b);
  });

  it("returns L2-normalized vectors (unit length)", async () => {
    const [v] = await embed(["any text here"]);
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    expect(norm).toBeCloseTo(1, 5);
  });

  it("returns [] for empty input", async () => {
    const out = await embed([]);
    expect(out).toEqual([]);
  });

  it("handles whitespace-only strings without throwing", async () => {
    const out = await embed(["   ", ""]);
    expect(out).toHaveLength(2);
    // Empty token set → zero vector, norm guarded to 1 → all zeros stays valid.
    expect(out[0]).toHaveLength(1024);
  });
});
