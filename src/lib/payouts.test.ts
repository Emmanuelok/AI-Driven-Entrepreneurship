import { describe, it, expect } from "vitest";
import {
  toLedgerRows, filterLedger, summarizeLedger, groupLedgerByMonth,
  categorizeBalance, summarizePayoutSchedule,
  formatMoney, isZeroDecimalCurrency,
  normalizePayout, payoutStatusLabel,
  type RawSession, type RawSeat, type RawOffering,
} from "./payouts";

const NOW = new Date("2026-06-15T12:00:00Z");
const COUNTERPARTIES = new Map([
  ["f1", { display_name: "Ada", slug: "ada" }],
  ["f2", { display_name: "Kofi", slug: "kofi" }],
]);

function session(over: Partial<RawSession> = {}): RawSession {
  return {
    id: "s1",
    status: "paid",
    price_cents: 10000,
    application_fee_pct: 10,
    currency: "usd",
    paid_at: "2026-06-01T00:00:00Z",
    scheduled_at: "2026-06-01T18:00:00Z",  // past
    topic: "Pricing strategy",
    founder_user_id: "f1",
    stripe_payment_intent_id: "pi_1",
    ...over,
  };
}
function seat(over: Partial<RawSeat> = {}): RawSeat {
  return {
    id: "st1",
    office_hours_id: "oh1",
    status: "paid",
    paid_at: "2026-06-02T00:00:00Z",
    founder_user_id: "f2",
    stripe_payment_intent_id: "pi_2",
    ...over,
  };
}
function offering(over: Partial<RawOffering> = {}): RawOffering {
  return {
    id: "oh1",
    title: "Fundraising Q&A",
    scheduled_at: "2026-06-02T17:00:00Z", // past
    price_per_seat_cents: 2000,
    application_fee_pct: 10,
    currency: "usd",
    ...over,
  };
}

// ── Ledger ──────────────────────────────────────────────────────────

describe("toLedgerRows — sessions", () => {
  it("emits an 'earned' row for paid past sessions with topic + net math", () => {
    const rows = toLedgerRows({ sessions: [session()], seats: [], offerings: [], counterpartyById: COUNTERPARTIES, now: NOW });
    expect(rows.length).toBe(1);
    const r = rows[0];
    expect(r.status).toBe("earned");
    expect(r.netCents).toBe(9000);
    expect(r.feeCents).toBe(1000);
    expect(r.grossCents).toBe(10000);
    expect(r.label).toBe("Pricing strategy");
    expect(r.counterpartyName).toBe("Ada");
    expect(r.counterpartySlug).toBe("ada");
    expect(r.detailUrl).toBe("/studio/mentor-sessions/s1");
  });

  it("emits 'upcoming' for paid sessions in the future", () => {
    const rows = toLedgerRows({
      sessions: [session({ scheduled_at: "2026-07-01T00:00:00Z" })],
      seats: [], offerings: [], counterpartyById: COUNTERPARTIES, now: NOW,
    });
    expect(rows[0].status).toBe("upcoming");
    expect(rows[0].netCents).toBe(9000);
    expect(rows[0].occurredAt).toBe("2026-07-01T00:00:00Z");
  });

  it("emits 'refunded' with NEGATIVE amounts on refunded sessions", () => {
    const rows = toLedgerRows({
      sessions: [session({ status: "refunded" })],
      seats: [], offerings: [], counterpartyById: COUNTERPARTIES, now: NOW,
    });
    expect(rows[0].status).toBe("refunded");
    expect(rows[0].grossCents).toBe(-10000);
    expect(rows[0].netCents).toBe(-9000);
    expect(rows[0].feeCents).toBe(-1000);
  });

  it("counts completed + reviewed sessions as earned", () => {
    const rows = toLedgerRows({
      sessions: [session({ id: "a", status: "completed" }), session({ id: "b", status: "reviewed" })],
      seats: [], offerings: [], counterpartyById: COUNTERPARTIES, now: NOW,
    });
    expect(rows.every((r) => r.status === "earned")).toBe(true);
    expect(rows.length).toBe(2);
  });

  it("skips sessions where no money has moved", () => {
    const rows = toLedgerRows({
      sessions: [
        session({ id: "a", status: "requested", paid_at: null }),
        session({ id: "b", status: "accepted", paid_at: null }),
        session({ id: "c", status: "cancelled", paid_at: null }),
      ],
      seats: [], offerings: [], counterpartyById: COUNTERPARTIES, now: NOW,
    });
    expect(rows.length).toBe(0);
  });

  it("falls back to a generic counterparty when the founder isn't in the map", () => {
    const rows = toLedgerRows({
      sessions: [session({ founder_user_id: "unknown" })],
      seats: [], offerings: [], counterpartyById: COUNTERPARTIES, now: NOW,
    });
    expect(rows[0].counterpartyName).toBe("Founder");
    expect(rows[0].counterpartySlug).toBeNull();
  });

  it("truncates very long session topics in the label", () => {
    const topic = "x".repeat(200);
    const rows = toLedgerRows({
      sessions: [session({ topic })],
      seats: [], offerings: [], counterpartyById: COUNTERPARTIES, now: NOW,
    });
    expect(rows[0].label.length).toBe(120);
  });
});

describe("toLedgerRows — office-hours seats", () => {
  it("emits 'earned' for paid past seats", () => {
    const rows = toLedgerRows({
      sessions: [], seats: [seat()], offerings: [offering()],
      counterpartyById: COUNTERPARTIES, now: NOW,
    });
    expect(rows[0].source).toBe("office_hours");
    expect(rows[0].status).toBe("earned");
    expect(rows[0].netCents).toBe(1800);
    expect(rows[0].label).toBe("Fundraising Q&A");
    expect(rows[0].detailUrl).toBe("/studio/office-hours/oh1");
  });

  it("counts 'attended' seats as earned", () => {
    const rows = toLedgerRows({
      sessions: [], seats: [seat({ status: "attended" })], offerings: [offering()],
      counterpartyById: COUNTERPARTIES, now: NOW,
    });
    expect(rows[0].status).toBe("earned");
  });

  it("treats future paid seats as upcoming", () => {
    const rows = toLedgerRows({
      sessions: [], seats: [seat()], offerings: [offering({ scheduled_at: "2026-08-01T00:00:00Z" })],
      counterpartyById: COUNTERPARTIES, now: NOW,
    });
    expect(rows[0].status).toBe("upcoming");
  });

  it("emits 'refunded' for refunded seats with negative amounts", () => {
    const rows = toLedgerRows({
      sessions: [], seats: [seat({ status: "refunded" })], offerings: [offering()],
      counterpartyById: COUNTERPARTIES, now: NOW,
    });
    expect(rows[0].netCents).toBe(-1800);
  });

  it("ignores seats whose offering record is missing (defensive)", () => {
    const rows = toLedgerRows({
      sessions: [], seats: [seat({ office_hours_id: "missing" })], offerings: [],
      counterpartyById: COUNTERPARTIES, now: NOW,
    });
    expect(rows.length).toBe(0);
  });

  it("ignores seats in non-money states (pending, cancelled)", () => {
    const rows = toLedgerRows({
      sessions: [], seats: [
        seat({ id: "p", status: "pending" }),
        seat({ id: "c", status: "cancelled" }),
      ], offerings: [offering()],
      counterpartyById: COUNTERPARTIES, now: NOW,
    });
    expect(rows.length).toBe(0);
  });
});

describe("toLedgerRows — sorting", () => {
  it("emits newest first across mixed sources", () => {
    const rows = toLedgerRows({
      sessions: [
        session({ id: "a", paid_at: "2026-05-01T00:00:00Z", scheduled_at: "2026-05-01T18:00:00Z" }),
        session({ id: "b", paid_at: "2026-06-10T00:00:00Z", scheduled_at: "2026-06-10T18:00:00Z" }),
      ],
      seats: [seat({ id: "x", paid_at: "2026-06-05T00:00:00Z" })],
      offerings: [offering()],
      counterpartyById: COUNTERPARTIES, now: NOW,
    });
    expect(rows.map((r) => r.id)).toEqual([
      "sess_b_earned",
      "seat_x_earned",
      "sess_a_earned",
    ]);
  });
});

// ── filterLedger ───────────────────────────────────────────────────

describe("filterLedger", () => {
  const rows = toLedgerRows({
    sessions: [
      session({ id: "a" }),
      session({ id: "b", status: "refunded" }),
      session({ id: "c", scheduled_at: "2026-08-01T00:00:00Z" }),
    ],
    seats: [seat()],
    offerings: [offering()],
    counterpartyById: COUNTERPARTIES, now: NOW,
  });

  it("filters by source", () => {
    expect(filterLedger(rows, { source: "office_hours" }).every((r) => r.source === "office_hours")).toBe(true);
    expect(filterLedger(rows, { source: "session" }).every((r) => r.source === "session")).toBe(true);
  });

  it("filters by status", () => {
    expect(filterLedger(rows, { status: "refunded" }).length).toBe(1);
    expect(filterLedger(rows, { status: "upcoming" }).length).toBe(1);
  });

  it("filters by date range (inclusive)", () => {
    const r = filterLedger(rows, { from: "2026-06-02T00:00:00Z", to: "2026-06-02T23:59:59Z" });
    expect(r.length).toBe(1);
    expect(r[0].source).toBe("office_hours");
  });

  it("composes filters", () => {
    const r = filterLedger(rows, { source: "session", status: "earned" });
    expect(r.length).toBe(1);
    expect(r[0].id).toBe("sess_a_earned");
  });
});

// ── summarizeLedger ────────────────────────────────────────────────

describe("summarizeLedger", () => {
  it("returns zeros on empty", () => {
    const s = summarizeLedger([]);
    expect(s.earnedNetCents).toBe(0);
    expect(s.upcomingNetCents).toBe(0);
    expect(s.refundedCount).toBe(0);
    expect(s.primaryCurrency).toBeNull();
  });

  it("aggregates earned + upcoming + refunded across rows", () => {
    const rows = toLedgerRows({
      sessions: [
        session({ id: "a" }),                               // earned 9000
        session({ id: "b", status: "refunded" }),           // refund -9000
        session({ id: "c", scheduled_at: "2026-08-01T00:00:00Z" }), // upcoming 9000
      ],
      seats: [seat()],                                       // earned 1800
      offerings: [offering()],
      counterpartyById: COUNTERPARTIES, now: NOW,
    });
    const s = summarizeLedger(rows);
    expect(s.earnedNetCents).toBe(9000 + 1800);
    expect(s.earnedCount).toBe(2);
    expect(s.upcomingNetCents).toBe(9000);
    expect(s.upcomingCount).toBe(1);
    expect(s.refundedNetCents).toBe(-9000);
    expect(s.refundedCount).toBe(1);
    expect(s.earnedFeeCents).toBe(1000 + 200);
    expect(s.primaryCurrency).toBe("usd");
  });

  it("picks the most-common currency as primary when mixed", () => {
    const rows = toLedgerRows({
      sessions: [
        session({ id: "a" }),
        session({ id: "b" }),
        session({ id: "c", currency: "gbp" }),
      ],
      seats: [], offerings: [],
      counterpartyById: COUNTERPARTIES, now: NOW,
    });
    expect(summarizeLedger(rows).primaryCurrency).toBe("usd");
  });
});

// ── groupLedgerByMonth ─────────────────────────────────────────────

describe("groupLedgerByMonth", () => {
  it("groups rows by UTC month, newest month first", () => {
    const rows = toLedgerRows({
      sessions: [
        session({ id: "a", paid_at: "2026-04-10T00:00:00Z", scheduled_at: "2026-04-10T18:00:00Z" }),
        session({ id: "b", paid_at: "2026-06-12T00:00:00Z", scheduled_at: "2026-06-12T18:00:00Z" }),
        session({ id: "c", paid_at: "2026-06-13T00:00:00Z", scheduled_at: "2026-06-13T18:00:00Z" }),
      ],
      seats: [], offerings: [],
      counterpartyById: COUNTERPARTIES, now: NOW,
    });
    const groups = groupLedgerByMonth(rows);
    expect(groups.map((g) => g.month)).toEqual(["2026-06", "2026-04"]);
    expect(groups[0].rows.length).toBe(2);
    expect(groups[0].netCents).toBe(18000);
  });

  it("includes refunds in netCents per-month bucket", () => {
    const rows = toLedgerRows({
      sessions: [
        session({ id: "a", paid_at: "2026-06-01T00:00:00Z", scheduled_at: "2026-06-01T18:00:00Z" }),
        session({ id: "b", status: "refunded", paid_at: "2026-06-05T00:00:00Z", scheduled_at: "2026-06-05T18:00:00Z" }),
      ],
      seats: [], offerings: [],
      counterpartyById: COUNTERPARTIES, now: NOW,
    });
    const groups = groupLedgerByMonth(rows);
    expect(groups[0].netCents).toBe(0); // 9000 - 9000
  });

  it("excludes upcoming rows from the netCents tally", () => {
    const rows = toLedgerRows({
      sessions: [
        session({ id: "a", scheduled_at: "2026-08-01T00:00:00Z" }),
      ],
      seats: [], offerings: [],
      counterpartyById: COUNTERPARTIES, now: NOW,
    });
    const groups = groupLedgerByMonth(rows);
    expect(groups[0].rows.length).toBe(1);
    expect(groups[0].netCents).toBe(0);
  });
});

// ── categorizeBalance ──────────────────────────────────────────────

describe("categorizeBalance", () => {
  it("picks the currency with the largest combined total", () => {
    const b = categorizeBalance({
      available: [{ amount: 9000, currency: "usd" }, { amount: 100, currency: "gbp" }],
      pending: [{ amount: 1000, currency: "usd" }],
      instant_available: [],
    });
    expect(b.currency).toBe("usd");
    expect(b.availableCents).toBe(9000);
    expect(b.pendingCents).toBe(1000);
  });

  it("honors preferCurrency when present in the balance", () => {
    const b = categorizeBalance({
      available: [{ amount: 9000, currency: "usd" }, { amount: 100, currency: "gbp" }],
      pending: [],
    }, "gbp");
    expect(b.currency).toBe("gbp");
    expect(b.availableCents).toBe(100);
  });

  it("falls back to usd when balance is empty", () => {
    const b = categorizeBalance({ available: [], pending: [] });
    expect(b.currency).toBe("usd");
    expect(b.availableCents).toBe(0);
    expect(b.pendingCents).toBe(0);
  });

  it("breaks ties by lexicographically smaller code", () => {
    const b = categorizeBalance({
      available: [{ amount: 1000, currency: "gbp" }, { amount: 1000, currency: "eur" }],
      pending: [],
    });
    expect(b.currency).toBe("eur");
  });

  it("sums instant_available into the picked currency", () => {
    const b = categorizeBalance({
      available: [{ amount: 5000, currency: "usd" }],
      pending: [{ amount: 1000, currency: "usd" }],
      instant_available: [{ amount: 800, currency: "usd" }],
    });
    expect(b.instantAvailableCents).toBe(800);
  });
});

// ── summarizePayoutSchedule ────────────────────────────────────────

describe("summarizePayoutSchedule", () => {
  it("manual when schedule is missing or interval=manual", () => {
    expect(summarizePayoutSchedule(null).label).toBe("Manual");
    expect(summarizePayoutSchedule({ interval: "manual" }).label).toBe("Manual");
    expect(summarizePayoutSchedule(null).nextPayoutAt).toBeNull();
  });

  it("daily schedule with delay", () => {
    const s = summarizePayoutSchedule({ interval: "daily", delay_days: 2 }, { availableCents: 1000, now: NOW });
    expect(s.label).toBe("Daily (T+2)");
    expect(s.isAutomatic).toBe(true);
    expect(s.nextPayoutAt).toMatch(/^2026-06-16/);
  });

  it("weekly schedule with anchor returns label + next-weekday date", () => {
    const s = summarizePayoutSchedule({ interval: "weekly", weekly_anchor: "friday" }, { availableCents: 1000, now: NOW });
    expect(s.label).toBe("Weekly on Fridays");
    expect(s.nextPayoutAt).toMatch(/^2026-06-19/); // Monday Jun 15 → next Friday Jun 19
  });

  it("weekly defaults to Friday when no anchor given", () => {
    const s = summarizePayoutSchedule({ interval: "weekly" }, { availableCents: 1000, now: NOW });
    expect(s.label).toBe("Weekly on Fridays");
  });

  it("monthly schedule formats ordinal day", () => {
    const s = summarizePayoutSchedule({ interval: "monthly", monthly_anchor: 1 }, { availableCents: 1000, now: NOW });
    expect(s.label).toBe("Monthly on the 1st");
    expect(s.nextPayoutAt).toMatch(/^2026-07-01/);
  });

  it("monthly schedule clamps to last day of shorter months", () => {
    const feb = new Date("2026-02-15T00:00:00Z");
    const s = summarizePayoutSchedule({ interval: "monthly", monthly_anchor: 31 }, { availableCents: 1000, now: feb });
    expect(s.nextPayoutAt).toMatch(/^2026-02-28/);
  });

  it("returns nextPayoutAt=null when availableCents=0 (no funds to pay out)", () => {
    const s = summarizePayoutSchedule({ interval: "daily" }, { availableCents: 0, now: NOW });
    expect(s.nextPayoutAt).toBeNull();
  });

  it("weekly schedule skips today even when today matches anchor", () => {
    // NOW is Monday 2026-06-15. If anchor is monday, next should be 7 days out.
    const s = summarizePayoutSchedule({ interval: "weekly", weekly_anchor: "monday" }, { availableCents: 1000, now: NOW });
    expect(s.nextPayoutAt).toMatch(/^2026-06-22/);
  });
});

// ── formatMoney + isZeroDecimalCurrency ────────────────────────────

describe("currency formatting", () => {
  it("isZeroDecimalCurrency matches Stripe's list", () => {
    expect(isZeroDecimalCurrency("jpy")).toBe(true);
    expect(isZeroDecimalCurrency("KRW")).toBe(true);
    expect(isZeroDecimalCurrency("usd")).toBe(false);
  });

  it("formats USD with thousands separator + 2 decimals", () => {
    expect(formatMoney(123456, "usd")).toBe("$1,234.56");
    expect(formatMoney(0, "usd")).toBe("$0.00");
  });

  it("formats JPY without decimals (zero-decimal)", () => {
    expect(formatMoney(123456, "jpy")).toBe("¥123,456");
  });

  it("preserves a leading negative for refunds", () => {
    expect(formatMoney(-1000, "usd")).toBe("-$10.00");
  });

  it("falls back gracefully for unknown ISO codes", () => {
    expect(formatMoney(1000, "zzz")).toMatch(/ZZZ/);
  });
});

// ── normalizePayout + payoutStatusLabel ────────────────────────────

describe("normalizePayout", () => {
  it("converts unix timestamps to ISO", () => {
    const p = normalizePayout({
      id: "po_1", amount: 5000, currency: "usd", status: "in_transit",
      arrival_date: 1750000000, created: 1749900000,
      method: "standard", automatic: true,
      description: null, failure_message: null,
    });
    expect(p.amountCents).toBe(5000);
    expect(p.arrivalAt).toMatch(/^2025-06/);
    expect(p.createdAt).toMatch(/^2025-06/);
  });
});

describe("payoutStatusLabel", () => {
  it("maps known statuses to friendly labels", () => {
    expect(payoutStatusLabel("paid")).toBe("Paid");
    expect(payoutStatusLabel("in_transit")).toBe("In transit");
    expect(payoutStatusLabel("canceled")).toBe("Cancelled");
  });
  it("passes through unknown statuses verbatim", () => {
    expect(payoutStatusLabel("weird_unknown")).toBe("weird_unknown");
  });
});
