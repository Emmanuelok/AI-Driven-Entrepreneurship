import { describe, it, expect } from "vitest";
import { buildMonthGrid, shiftMonth, localDayKey, MONTH_NAMES } from "./calendar-grid";

// All tests anchor against a fixed June 2026 so "today" is deterministic.
const NOW = new Date(2026, 5, 15, 12).getTime();

describe("buildMonthGrid — layout", () => {
  it("always returns 42 cells in row-major order", () => {
    for (const m of [0, 1, 6, 11]) {
      const g = buildMonthGrid(2026, m, [], { now: NOW });
      expect(g.cells.length).toBe(42);
    }
  });

  it("February in a leap year still produces 42 cells", () => {
    // 2024 is a leap year; Feb has 29 days, still 6 rows.
    const g = buildMonthGrid(2024, 1, [], { now: NOW });
    expect(g.cells.length).toBe(42);
    expect(g.cells.filter((c) => c.inMonth).length).toBe(29);
  });

  it("starts the grid on Sunday by default", () => {
    const g = buildMonthGrid(2026, 5, [], { now: NOW }); // June 2026
    expect(g.weekdays[0]).toBe("Sun");
    expect(g.cells[0].date.getDay()).toBe(0);
  });

  it("respects weekStart=1 (Monday)", () => {
    const g = buildMonthGrid(2026, 5, [], { weekStart: 1, now: NOW });
    expect(g.weekdays[0]).toBe("Mon");
    expect(g.cells[0].date.getDay()).toBe(1);
  });

  it("marks the in-month cells correctly for June 2026", () => {
    const g = buildMonthGrid(2026, 5, [], { now: NOW });
    // June has 30 days.
    expect(g.cells.filter((c) => c.inMonth).length).toBe(30);
    expect(g.cells.find((c) => c.date.getDate() === 1 && c.inMonth)?.date.getMonth()).toBe(5);
  });
});

describe("buildMonthGrid — today flag", () => {
  it("flips isToday only for the local-day match", () => {
    const g = buildMonthGrid(2026, 5, [], { now: NOW });
    const todays = g.cells.filter((c) => c.isToday);
    expect(todays.length).toBe(1);
    expect(todays[0].date.getDate()).toBe(15);
  });
  it("no cell is today for a different month", () => {
    const g = buildMonthGrid(2026, 0, [], { now: NOW });
    expect(g.cells.some((c) => c.isToday)).toBe(false);
  });
});

describe("buildMonthGrid — item bucketing", () => {
  it("groups items by their LOCAL day", () => {
    const items = [
      { iso: new Date(2026, 5, 15, 9).toISOString(), id: "a" },
      { iso: new Date(2026, 5, 15, 14).toISOString(), id: "b" },
      { iso: new Date(2026, 5, 18, 8).toISOString(), id: "c" },
    ];
    const g = buildMonthGrid(2026, 5, items, { now: NOW });
    const day15 = g.cells.find((c) => c.date.getDate() === 15 && c.inMonth)!;
    expect(day15.items.map((i) => i.id)).toEqual(["a", "b"]);
    const day18 = g.cells.find((c) => c.date.getDate() === 18 && c.inMonth)!;
    expect(day18.items.map((i) => i.id)).toEqual(["c"]);
  });

  it("sorts items inside a day by their time", () => {
    const items = [
      { iso: new Date(2026, 5, 20, 18).toISOString(), id: "late" },
      { iso: new Date(2026, 5, 20, 9).toISOString(), id: "early" },
    ];
    const g = buildMonthGrid(2026, 5, items, { now: NOW });
    const day = g.cells.find((c) => c.date.getDate() === 20 && c.inMonth)!;
    expect(day.items.map((i) => i.id)).toEqual(["early", "late"]);
  });

  it("ignores items with invalid ISO timestamps", () => {
    const items = [{ iso: "not-a-date", id: "x" }];
    const g = buildMonthGrid(2026, 5, items, { now: NOW });
    expect(g.cells.every((c) => c.items.length === 0)).toBe(true);
  });

  it("places items from spillover days into the leading/trailing cells", () => {
    // June 1 2026 is a Monday; the leading cell (Sun) is May 31.
    const items = [{ iso: new Date(2026, 4, 31, 10).toISOString(), id: "spill" }];
    const g = buildMonthGrid(2026, 5, items, { now: NOW });
    expect(g.cells[0].items.map((i) => i.id)).toEqual(["spill"]);
    expect(g.cells[0].inMonth).toBe(false);
  });
});

describe("shiftMonth", () => {
  it("rolls forward across a year boundary", () => {
    expect(shiftMonth(2026, 11, 1)).toEqual({ year: 2027, month: 0 });
  });
  it("rolls backward across a year boundary", () => {
    expect(shiftMonth(2026, 0, -1)).toEqual({ year: 2025, month: 11 });
  });
  it("handles multi-year shifts", () => {
    expect(shiftMonth(2026, 5, 24)).toEqual({ year: 2028, month: 5 });
    expect(shiftMonth(2026, 5, -24)).toEqual({ year: 2024, month: 5 });
  });
});

describe("localDayKey", () => {
  it("zero-pads month and day", () => {
    expect(localDayKey(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(localDayKey(new Date(2026, 8, 9))).toBe("2026-09-09");
  });
});

describe("MONTH_NAMES", () => {
  it("has 12 entries", () => {
    expect(MONTH_NAMES.length).toBe(12);
    expect(MONTH_NAMES[0]).toBe("January");
    expect(MONTH_NAMES[11]).toBe("December");
  });
});
