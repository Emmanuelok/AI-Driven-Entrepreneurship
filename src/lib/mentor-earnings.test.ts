import { describe, it, expect } from "vitest";
import {
  takeHomeCents, aggregateEarnings, fillTrend, formatUsd, monthLabel, momNetDeltaPct,
  type EarningEvent,
} from "./mentor-earnings";

function ev(over: Partial<EarningEvent> = {}): EarningEvent {
  return {
    source: "session",
    grossCents: 10000,
    applicationFeePct: 10,
    state: "earned",
    at: "2026-06-15T00:00:00Z",
    ...over,
  };
}

describe("takeHomeCents", () => {
  it("subtracts the platform fee", () => {
    expect(takeHomeCents(10000, 10)).toBe(9000);
    expect(takeHomeCents(3333, 10)).toBe(3000); // round(333.3)=333 → 3000
  });
  it("returns 0 for non-positive input", () => {
    expect(takeHomeCents(0, 10)).toBe(0);
    expect(takeHomeCents(-5, 10)).toBe(0);
  });
});

describe("aggregateEarnings", () => {
  it("returns zeros on empty input", () => {
    const r = aggregateEarnings([]);
    expect(r.netCents).toBe(0);
    expect(r.grossCents).toBe(0);
    expect(r.paidCount).toBe(0);
    expect(r.trend).toEqual([]);
    expect(r.bySource.session.count).toBe(0);
    expect(r.bySource.office_hours.count).toBe(0);
  });

  it("sums earned events net of fee + tracks gross + fee", () => {
    const r = aggregateEarnings([
      ev({ grossCents: 10000, applicationFeePct: 10 }),
      ev({ grossCents: 5000, applicationFeePct: 10, source: "office_hours" }),
    ]);
    expect(r.grossCents).toBe(15000);
    expect(r.netCents).toBe(9000 + 4500);
    expect(r.feeCents).toBe(1500);
    expect(r.paidCount).toBe(2);
    expect(r.bySource.session.netCents).toBe(9000);
    expect(r.bySource.office_hours.netCents).toBe(4500);
  });

  it("tracks refunds separately without polluting net", () => {
    const r = aggregateEarnings([
      ev({ grossCents: 10000, state: "earned" }),
      ev({ grossCents: 4000, state: "refunded" }),
    ]);
    expect(r.netCents).toBe(9000);
    expect(r.paidCount).toBe(1);
    expect(r.refundedCents).toBe(4000);
    expect(r.refundedCount).toBe(1);
  });

  it("tracks upcoming locked-in money separately", () => {
    const r = aggregateEarnings([
      ev({ grossCents: 10000, state: "upcoming" }),
      ev({ grossCents: 20000, state: "upcoming" }),
    ]);
    expect(r.netCents).toBe(0);
    expect(r.upcomingNetCents).toBe(9000 + 18000);
    expect(r.upcomingCount).toBe(2);
  });

  it("buckets earned events by UTC month, sorted ascending", () => {
    const r = aggregateEarnings([
      ev({ at: "2026-04-10T00:00:00Z", grossCents: 10000 }),
      ev({ at: "2026-06-10T00:00:00Z", grossCents: 20000 }),
      ev({ at: "2026-04-20T00:00:00Z", grossCents: 10000 }),
    ]);
    expect(r.trend.map((b) => b.month)).toEqual(["2026-04", "2026-06"]);
    expect(r.trend[0].count).toBe(2);
    expect(r.trend[0].grossCents).toBe(20000);
    expect(r.trend[1].grossCents).toBe(20000);
  });

  it("ignores negative gross defensively", () => {
    const r = aggregateEarnings([ev({ grossCents: -100 })]);
    expect(r.netCents).toBe(0);
    expect(r.paidCount).toBe(0);
  });
});

describe("fillTrend", () => {
  it("fills gaps with zero buckets for a contiguous window", () => {
    const now = new Date("2026-06-15T00:00:00Z");
    const trend = [
      { month: "2026-04", grossCents: 10000, netCents: 9000, count: 1 },
      { month: "2026-06", grossCents: 20000, netCents: 18000, count: 1 },
    ];
    const filled = fillTrend(trend, now, 4);
    expect(filled.map((b) => b.month)).toEqual(["2026-03", "2026-04", "2026-05", "2026-06"]);
    expect(filled[0].netCents).toBe(0); // March — gap
    expect(filled[1].netCents).toBe(9000);
    expect(filled[2].netCents).toBe(0); // May — gap
    expect(filled[3].netCents).toBe(18000);
  });

  it("handles year boundaries", () => {
    const now = new Date("2026-01-15T00:00:00Z");
    const filled = fillTrend([], now, 3);
    expect(filled.map((b) => b.month)).toEqual(["2025-11", "2025-12", "2026-01"]);
  });
});

describe("formatUsd", () => {
  it("formats with thousands separators + 2 decimals", () => {
    expect(formatUsd(0)).toBe("$0.00");
    expect(formatUsd(123456)).toBe("$1,234.56");
    expect(formatUsd(100000000)).toBe("$1,000,000.00");
  });
});

describe("monthLabel", () => {
  it("returns the short month name", () => {
    expect(monthLabel("2026-06")).toBe("Jun");
    expect(monthLabel("2026-01")).toBe("Jan");
    expect(monthLabel("2026-12")).toBe("Dec");
  });
});

describe("momNetDeltaPct", () => {
  it("returns null with fewer than 2 months", () => {
    expect(momNetDeltaPct([])).toBeNull();
    expect(momNetDeltaPct([{ month: "2026-06", grossCents: 1, netCents: 1, count: 1 }])).toBeNull();
  });
  it("returns null when prior month is zero", () => {
    expect(momNetDeltaPct([
      { month: "2026-05", grossCents: 0, netCents: 0, count: 0 },
      { month: "2026-06", grossCents: 1000, netCents: 900, count: 1 },
    ])).toBeNull();
  });
  it("computes a signed percentage delta", () => {
    expect(momNetDeltaPct([
      { month: "2026-05", grossCents: 0, netCents: 1000, count: 1 },
      { month: "2026-06", grossCents: 0, netCents: 1500, count: 1 },
    ])).toBe(50);
    expect(momNetDeltaPct([
      { month: "2026-05", grossCents: 0, netCents: 1000, count: 1 },
      { month: "2026-06", grossCents: 0, netCents: 500, count: 1 },
    ])).toBe(-50);
  });
});
