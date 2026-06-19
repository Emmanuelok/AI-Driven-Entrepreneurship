import { describe, it, expect } from "vitest";
import { sortedModules, totalMinutesFromModules, validateModules, type Module } from "./curriculum-track";

const m = (over: Partial<Module>): Module => ({
  id: "m1", order: 0, title: "T", summary: "", kind: "concept",
  duration_min: 10, resources: [], milestones: [], ...over,
});

describe("sortedModules", () => {
  it("sorts by order field, ascending", () => {
    const out = sortedModules([m({ id: "b", order: 2 }), m({ id: "a", order: 0 }), m({ id: "c", order: 1 })]);
    expect(out.map((x) => x.id)).toEqual(["a", "c", "b"]);
  });

  it("falls back to array index when order missing", () => {
    const out = sortedModules([
      { ...m({ id: "x" }), order: undefined as unknown as number },
      { ...m({ id: "y" }), order: undefined as unknown as number },
    ]);
    expect(out.map((x) => x.id)).toEqual(["x", "y"]);
  });
});

describe("totalMinutesFromModules", () => {
  it("sums duration_min across modules", () => {
    expect(totalMinutesFromModules([m({ duration_min: 30 }), m({ duration_min: 45 }), m({ duration_min: 25 })])).toBe(100);
  });

  it("treats non-finite durations as 0", () => {
    expect(totalMinutesFromModules([m({ duration_min: 30 }), { ...m({}), duration_min: NaN as unknown as number }])).toBe(30);
  });

  it("returns 0 on empty list", () => {
    expect(totalMinutesFromModules([])).toBe(0);
  });
});

describe("validateModules", () => {
  it("rejects non-array input", () => {
    const r = validateModules("not an array");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("modules_must_be_array");
  });

  it("rejects too-long arrays", () => {
    const big = Array.from({ length: 201 }, (_, i) => m({ id: `m${i}` }));
    const r = validateModules(big);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("too_many_modules");
  });

  it("rejects modules missing a title", () => {
    const r = validateModules([{ id: "a" }]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("module_0_missing_title");
  });

  it("rejects duplicate ids", () => {
    const r = validateModules([
      { id: "same", title: "A" },
      { id: "same", title: "B" },
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("duplicate_module_id_same");
  });

  it("fills sensible defaults for missing optional fields", () => {
    const r = validateModules([{ id: "x", title: "Hello" }]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.modules[0]).toMatchObject({
        id: "x", title: "Hello", summary: "",
        kind: "concept", duration_min: 0,
      });
      expect(r.modules[0].resources).toEqual([]);
      expect(r.modules[0].milestones).toEqual([]);
    }
  });

  it("preserves valid kinds; collapses unknown to 'concept'", () => {
    const r = validateModules([
      { id: "a", title: "X", kind: "lab" },
      { id: "b", title: "Y", kind: "weird" },
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.modules[0].kind).toBe("lab");
      expect(r.modules[1].kind).toBe("concept");
    }
  });

  it("auto-mints an id when one is missing or empty", () => {
    const r = validateModules([{ title: "Untitled-id mod" }]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.modules[0].id.length).toBeGreaterThan(0);
  });
});
