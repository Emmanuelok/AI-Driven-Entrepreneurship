import { describe, it, expect } from "vitest";
import {
  canTransitionMentorSession, nextStatusesForActor,
  isTerminalStatus, hasMoneyChanged,
  isAllowedDuration, computeSessionPriceCents,
  mentorTakeHomeCents, formatPriceUsd, statusLabel,
  type MentorSessionStatus,
} from "./mentor-session-state";

describe("canTransitionMentorSession", () => {
  it("allows the happy path: requested → accepted → paid → completed → reviewed", () => {
    expect(canTransitionMentorSession("requested", "accepted", "mentor")).toBe(true);
    expect(canTransitionMentorSession("accepted", "paid", "system")).toBe(true);
    expect(canTransitionMentorSession("paid", "completed", "mentor")).toBe(true);
    expect(canTransitionMentorSession("completed", "reviewed", "founder")).toBe(true);
  });

  it("rejects mentor trying to mark paid (only the Stripe webhook can)", () => {
    expect(canTransitionMentorSession("accepted", "paid", "mentor")).toBe(false);
    expect(canTransitionMentorSession("accepted", "paid", "founder")).toBe(false);
  });

  it("rejects founder trying to mark completed (only the mentor confirms)", () => {
    expect(canTransitionMentorSession("paid", "completed", "founder")).toBe(false);
  });

  it("rejects mentor trying to leave the review", () => {
    expect(canTransitionMentorSession("completed", "reviewed", "mentor")).toBe(false);
  });

  it("rejects skipping payment", () => {
    expect(canTransitionMentorSession("accepted", "completed", "mentor")).toBe(false);
    expect(canTransitionMentorSession("requested", "completed", "mentor")).toBe(false);
  });

  it("allows either party to cancel before payment", () => {
    expect(canTransitionMentorSession("requested", "cancelled", "mentor")).toBe(true);
    expect(canTransitionMentorSession("requested", "cancelled", "founder")).toBe(true);
    expect(canTransitionMentorSession("accepted", "cancelled", "mentor")).toBe(true);
    expect(canTransitionMentorSession("accepted", "cancelled", "founder")).toBe(true);
  });

  it("rejects cancellation after payment — must refund instead", () => {
    expect(canTransitionMentorSession("paid", "cancelled", "mentor")).toBe(false);
    expect(canTransitionMentorSession("paid", "cancelled", "founder")).toBe(false);
    expect(canTransitionMentorSession("paid", "refunded", "mentor")).toBe(true);
  });

  it("rejects every transition out of a terminal state", () => {
    const terminals: MentorSessionStatus[] = ["reviewed", "cancelled", "refunded"];
    for (const t of terminals) {
      for (const next of ["requested", "accepted", "paid", "completed", "reviewed", "cancelled", "refunded"] as MentorSessionStatus[]) {
        for (const actor of ["mentor", "founder", "system"] as const) {
          expect(canTransitionMentorSession(t, next, actor)).toBe(false);
        }
      }
    }
  });
});

describe("nextStatusesForActor", () => {
  it("for mentor on 'requested': accept or cancel only", () => {
    expect(nextStatusesForActor("requested", "mentor").sort()).toEqual(["accepted", "cancelled"]);
  });

  it("for founder on 'requested': cancel only", () => {
    expect(nextStatusesForActor("requested", "founder")).toEqual(["cancelled"]);
  });

  it("for founder on 'completed': leave the review", () => {
    expect(nextStatusesForActor("completed", "founder")).toEqual(["reviewed"]);
  });

  it("excludes system-only transitions", () => {
    // The 'accepted' → 'paid' transition is system-only — it should
    // not appear on either actor's allowed list.
    expect(nextStatusesForActor("accepted", "mentor")).not.toContain("paid");
    expect(nextStatusesForActor("accepted", "founder")).not.toContain("paid");
  });

  it("returns empty array for terminal states", () => {
    expect(nextStatusesForActor("reviewed", "founder")).toEqual([]);
    expect(nextStatusesForActor("cancelled", "mentor")).toEqual([]);
    expect(nextStatusesForActor("refunded", "mentor")).toEqual([]);
  });
});

describe("isTerminalStatus + hasMoneyChanged", () => {
  it("marks reviewed/cancelled/refunded as terminal", () => {
    expect(isTerminalStatus("reviewed")).toBe(true);
    expect(isTerminalStatus("cancelled")).toBe(true);
    expect(isTerminalStatus("refunded")).toBe(true);
  });

  it("does not mark in-flight statuses as terminal", () => {
    expect(isTerminalStatus("requested")).toBe(false);
    expect(isTerminalStatus("accepted")).toBe(false);
    expect(isTerminalStatus("paid")).toBe(false);
    expect(isTerminalStatus("completed")).toBe(false);
  });

  it("treats paid + completed + reviewed + refunded as 'money moved'", () => {
    expect(hasMoneyChanged("paid")).toBe(true);
    expect(hasMoneyChanged("completed")).toBe(true);
    expect(hasMoneyChanged("reviewed")).toBe(true);
    expect(hasMoneyChanged("refunded")).toBe(true);
  });

  it("treats pre-payment statuses as money-not-moved", () => {
    expect(hasMoneyChanged("requested")).toBe(false);
    expect(hasMoneyChanged("accepted")).toBe(false);
    expect(hasMoneyChanged("cancelled")).toBe(false);
  });
});

describe("isAllowedDuration", () => {
  it("accepts the allowed durations", () => {
    for (const d of [15, 30, 45, 60, 90]) expect(isAllowedDuration(d)).toBe(true);
  });

  it("rejects other durations", () => {
    for (const d of [0, 10, 25, 75, 120, -30, 60.5]) expect(isAllowedDuration(d)).toBe(false);
  });
});

describe("computeSessionPriceCents", () => {
  it("computes integer cents at the standard durations", () => {
    expect(computeSessionPriceCents(100, 60)).toBe(10000); // $100 for 60 min
    expect(computeSessionPriceCents(100, 30)).toBe(5000);  // $50 for 30 min
    expect(computeSessionPriceCents(100, 15)).toBe(2500);  // $25 for 15 min
    expect(computeSessionPriceCents(120, 90)).toBe(18000); // $180 for 90 min
  });

  it("rounds to integer cents", () => {
    // $50/hr × 45 min = $37.50 → 3750 cents
    expect(computeSessionPriceCents(50, 45)).toBe(3750);
    // $33.33/hr × 30 min = $16.665 → 1667 cents
    expect(computeSessionPriceCents(33.33, 30)).toBe(1667);
  });

  it("rejects invalid hourly rates", () => {
    expect(computeSessionPriceCents(0, 60)).toBeNull();
    expect(computeSessionPriceCents(-50, 60)).toBeNull();
    expect(computeSessionPriceCents(5001, 60)).toBeNull();
    expect(computeSessionPriceCents(null, 60)).toBeNull();
    expect(computeSessionPriceCents(undefined, 60)).toBeNull();
    expect(computeSessionPriceCents(NaN, 60)).toBeNull();
  });

  it("rejects disallowed durations", () => {
    expect(computeSessionPriceCents(100, 25)).toBeNull();
    expect(computeSessionPriceCents(100, 120)).toBeNull();
  });
});

describe("mentorTakeHomeCents", () => {
  it("subtracts the application fee", () => {
    expect(mentorTakeHomeCents(10000, 10)).toBe(9000); // 10% fee
    expect(mentorTakeHomeCents(5000, 15)).toBe(4250);  // 15% fee
    expect(mentorTakeHomeCents(10000, 0)).toBe(10000); // no fee
  });

  it("never goes negative", () => {
    expect(mentorTakeHomeCents(100, 200)).toBe(0);
    expect(mentorTakeHomeCents(0, 10)).toBe(0);
  });
});

describe("formatPriceUsd", () => {
  it("always shows two decimals", () => {
    expect(formatPriceUsd(10000)).toBe("$100.00");
    expect(formatPriceUsd(3050)).toBe("$30.50");
    expect(formatPriceUsd(50)).toBe("$0.50");
    expect(formatPriceUsd(0)).toBe("$0.00");
  });
});

describe("statusLabel", () => {
  it("returns distinct human labels per status", () => {
    const labels = ["requested", "accepted", "paid", "completed", "reviewed", "cancelled", "refunded"]
      .map((s) => statusLabel(s as MentorSessionStatus));
    expect(new Set(labels).size).toBe(7);
  });
});
