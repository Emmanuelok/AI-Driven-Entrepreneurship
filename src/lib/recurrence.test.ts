import { describe, it, expect } from "vitest";
import { nextOccurrence, describeRule, validateRule, toRRule, type RecurrenceRule } from "./recurrence";

// All dates anchored to known UTC instants to keep the math obvious.
const T_MON_2026_06_15_09 = new Date(Date.UTC(2026, 5, 15, 9, 0, 0)); // Monday
const T_TUE_2026_06_16_09 = new Date(Date.UTC(2026, 5, 16, 9, 0, 0)); // Tuesday
const T_JAN_31_2026 = new Date(Date.UTC(2026, 0, 31, 9, 0, 0));

describe("nextOccurrence — DAILY", () => {
  it("advances by one day", () => {
    const next = nextOccurrence({ freq: "daily" }, T_MON_2026_06_15_09, 1)!;
    expect(next.toISOString()).toBe("2026-06-16T09:00:00.000Z");
  });

  it("honors INTERVAL", () => {
    const next = nextOccurrence({ freq: "daily", interval: 3 }, T_MON_2026_06_15_09, 1)!;
    expect(next.toISOString()).toBe("2026-06-18T09:00:00.000Z");
  });

  it("stops after COUNT occurrences", () => {
    const rule: RecurrenceRule = { freq: "daily", count: 3 };
    // After 3 completions, no more.
    expect(nextOccurrence(rule, T_MON_2026_06_15_09, 3)).toBeNull();
  });

  it("stops after UNTIL", () => {
    const rule: RecurrenceRule = { freq: "daily", until: "2026-06-15T23:59:59Z" };
    expect(nextOccurrence(rule, T_MON_2026_06_15_09, 1)).toBeNull();
  });
});

describe("nextOccurrence — WEEKLY", () => {
  it("with no byDay, picks the same weekday next week", () => {
    const next = nextOccurrence({ freq: "weekly" }, T_MON_2026_06_15_09, 1)!;
    expect(next.getUTCDay()).toBe(1); // Monday
    expect(next.toISOString()).toBe("2026-06-22T09:00:00.000Z");
  });

  it("with byDay=[TU], from a Monday lands on the next Tuesday", () => {
    const next = nextOccurrence({ freq: "weekly", byDay: ["TU"] }, T_MON_2026_06_15_09, 1)!;
    expect(next.getUTCDay()).toBe(2);
    expect(next.toISOString()).toBe("2026-06-16T09:00:00.000Z");
  });

  it("with byDay=[MO,WE,FR], from a Monday jumps to Wednesday", () => {
    const next = nextOccurrence({ freq: "weekly", byDay: ["MO", "WE", "FR"] }, T_MON_2026_06_15_09, 1)!;
    expect(next.getUTCDay()).toBe(3);
    expect(next.toISOString()).toBe("2026-06-17T09:00:00.000Z");
  });

  it("with byDay=[MO,WE,FR], from a Friday jumps to the next Monday", () => {
    const friday = new Date(Date.UTC(2026, 5, 19, 9, 0, 0));
    const next = nextOccurrence({ freq: "weekly", byDay: ["MO", "WE", "FR"] }, friday, 1)!;
    expect(next.getUTCDay()).toBe(1);
    expect(next.toISOString()).toBe("2026-06-22T09:00:00.000Z");
  });

  it("INTERVAL=2 from Tuesday with byDay=[TU] gives the Tuesday two weeks later", () => {
    const next = nextOccurrence({ freq: "weekly", interval: 2, byDay: ["TU"] }, T_TUE_2026_06_16_09, 1)!;
    expect(next.toISOString()).toBe("2026-06-30T09:00:00.000Z");
  });

  it("respects UNTIL", () => {
    const rule: RecurrenceRule = { freq: "weekly", until: "2026-06-21T23:59:59Z" };
    expect(nextOccurrence(rule, T_MON_2026_06_15_09, 1)).toBeNull();
  });
});

describe("nextOccurrence — MONTHLY", () => {
  it("advances by one month preserving the day", () => {
    const next = nextOccurrence({ freq: "monthly" }, T_MON_2026_06_15_09, 1)!;
    expect(next.toISOString()).toBe("2026-07-15T09:00:00.000Z");
  });

  it("INTERVAL=3 yields a quarterly cadence", () => {
    const next = nextOccurrence({ freq: "monthly", interval: 3 }, T_MON_2026_06_15_09, 1)!;
    expect(next.toISOString()).toBe("2026-09-15T09:00:00.000Z");
  });

  it("clamps to the last day of a shorter month (Jan 31 → Feb 28)", () => {
    const next = nextOccurrence({ freq: "monthly" }, T_JAN_31_2026, 1)!;
    expect(next.toISOString()).toBe("2026-02-28T09:00:00.000Z");
  });

  it("handles February in a leap year (Jan 31 2024 → Feb 29 2024)", () => {
    const jan31_2024 = new Date(Date.UTC(2024, 0, 31, 9, 0, 0));
    const next = nextOccurrence({ freq: "monthly" }, jan31_2024, 1)!;
    expect(next.toISOString()).toBe("2024-02-29T09:00:00.000Z");
  });

  it("rolls over the year", () => {
    const dec15 = new Date(Date.UTC(2026, 11, 15, 9, 0, 0));
    const next = nextOccurrence({ freq: "monthly" }, dec15, 1)!;
    expect(next.toISOString()).toBe("2027-01-15T09:00:00.000Z");
  });
});

describe("describeRule", () => {
  it("renders friendly headings for each frequency", () => {
    expect(describeRule({ freq: "daily" })).toBe("Daily");
    expect(describeRule({ freq: "daily", interval: 3 })).toBe("Every 3 days");
    expect(describeRule({ freq: "weekly" })).toBe("Weekly");
    expect(describeRule({ freq: "weekly", byDay: ["MO", "WE", "FR"] })).toBe("Weekly on Mon, Wed, Fri");
    expect(describeRule({ freq: "weekly", interval: 2, byDay: ["TU"] })).toBe("Every 2 weeks on Tue");
    expect(describeRule({ freq: "monthly" })).toBe("Monthly");
    expect(describeRule({ freq: "monthly", interval: 3 })).toBe("Every 3 months");
  });

  it("appends 'until' or 'N times' when present", () => {
    expect(describeRule({ freq: "weekly", until: "2026-12-31T00:00:00Z" })).toContain("until 2026-12-31");
    expect(describeRule({ freq: "weekly", count: 6 })).toContain("6 times");
  });
});

describe("toRRule (RFC 5545)", () => {
  it("renders daily and INTERVAL", () => {
    expect(toRRule({ freq: "daily" })).toBe("FREQ=DAILY");
    expect(toRRule({ freq: "daily", interval: 3 })).toBe("FREQ=DAILY;INTERVAL=3");
  });
  it("renders weekly with BYDAY", () => {
    expect(toRRule({ freq: "weekly", byDay: ["MO", "WE", "FR"] })).toBe("FREQ=WEEKLY;BYDAY=MO,WE,FR");
  });
  it("renders monthly", () => {
    expect(toRRule({ freq: "monthly", interval: 2 })).toBe("FREQ=MONTHLY;INTERVAL=2");
  });
  it("renders COUNT and UNTIL (UTC, no separators)", () => {
    expect(toRRule({ freq: "weekly", count: 6 })).toContain("COUNT=6");
    expect(toRRule({ freq: "weekly", until: "2026-12-31T23:59:00Z" })).toContain("UNTIL=20261231T235900Z");
  });
});

describe("validateRule", () => {
  it("accepts well-formed rules", () => {
    expect(validateRule({ freq: "daily" }).ok).toBe(true);
    expect(validateRule({ freq: "weekly", byDay: ["MO"], interval: 2 }).ok).toBe(true);
  });
  it("rejects bad freq, bad interval, bad byDay, and conflicting until+count", () => {
    expect(validateRule({ freq: "yearly" }).ok).toBe(false);
    expect(validateRule({ freq: "daily", interval: 0 }).ok).toBe(false);
    expect(validateRule({ freq: "daily", byDay: ["MO"] }).ok).toBe(false); // byDay only for weekly
    expect(validateRule({ freq: "weekly", byDay: ["XX" as never] }).ok).toBe(false);
    expect(validateRule({ freq: "weekly", until: "not-a-date" }).ok).toBe(false);
    expect(validateRule({ freq: "weekly", count: 5, until: "2026-12-31" }).ok).toBe(false);
  });
  it("rejects non-objects", () => {
    expect(validateRule(null).ok).toBe(false);
    expect(validateRule("daily").ok).toBe(false);
  });
});
