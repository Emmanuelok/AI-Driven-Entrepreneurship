import { describe, it, expect } from "vitest";
import {
  canTransitionSeat, nextSeatStatusesForActor, isSeatTerminal, seatHasPaid,
  isValidCapacity, countActiveSeats, canBookSeat,
  isValidSeatPriceCents, mentorTotalTakeHomeCents, formatPriceUsd,
  officeHoursStatusLabel, seatStatusLabel,
  type SeatStatus,
} from "./office-hours-state";

describe("seat transitions", () => {
  it("pending → paid only by system (Stripe webhook)", () => {
    expect(canTransitionSeat("pending", "paid", "system")).toBe(true);
    expect(canTransitionSeat("pending", "paid", "founder")).toBe(false);
    expect(canTransitionSeat("pending", "paid", "mentor")).toBe(false);
  });

  it("pending → cancelled by either party", () => {
    expect(canTransitionSeat("pending", "cancelled", "founder")).toBe(true);
    expect(canTransitionSeat("pending", "cancelled", "mentor")).toBe(true);
    expect(canTransitionSeat("pending", "cancelled", "system")).toBe(false);
  });

  it("paid → attended by mentor only", () => {
    expect(canTransitionSeat("paid", "attended", "mentor")).toBe(true);
    expect(canTransitionSeat("paid", "attended", "founder")).toBe(false);
  });

  it("paid → refunded by mentor or system", () => {
    expect(canTransitionSeat("paid", "refunded", "mentor")).toBe(true);
    expect(canTransitionSeat("paid", "refunded", "system")).toBe(true);
    expect(canTransitionSeat("paid", "refunded", "founder")).toBe(false);
  });

  it("attended → refunded still permitted (post-session disputes)", () => {
    expect(canTransitionSeat("attended", "refunded", "mentor")).toBe(true);
  });

  it("cancelled + refunded are terminal", () => {
    expect(isSeatTerminal("cancelled")).toBe(true);
    expect(isSeatTerminal("refunded")).toBe(true);
    expect(isSeatTerminal("pending")).toBe(false);
    expect(nextSeatStatusesForActor("cancelled", "founder")).toEqual([]);
    expect(nextSeatStatusesForActor("refunded", "mentor")).toEqual([]);
  });

  it("seatHasPaid is true once money moved", () => {
    expect(seatHasPaid("paid")).toBe(true);
    expect(seatHasPaid("attended")).toBe(true);
    expect(seatHasPaid("refunded")).toBe(true);
    expect(seatHasPaid("pending")).toBe(false);
    expect(seatHasPaid("cancelled")).toBe(false);
  });

  it("founder actions exclude system-only transitions", () => {
    const next = nextSeatStatusesForActor("pending", "founder");
    expect(next).toContain("cancelled");
    expect(next).not.toContain("paid");
  });
});

describe("capacity + booking", () => {
  const OFFERING = {
    status: "open" as const,
    scheduled_at: "2026-12-01T18:00:00Z",
    capacity: 5,
  };
  const NOW = new Date("2026-06-15T12:00:00Z");

  it("isValidCapacity rejects out-of-range values", () => {
    expect(isValidCapacity(1)).toBe(false);
    expect(isValidCapacity(2)).toBe(true);
    expect(isValidCapacity(50)).toBe(true);
    expect(isValidCapacity(51)).toBe(false);
    expect(isValidCapacity(1.5)).toBe(false);
    expect(isValidCapacity(NaN)).toBe(false);
  });

  it("countActiveSeats excludes terminal statuses", () => {
    const seats: Array<{ status: SeatStatus }> = [
      { status: "pending" }, { status: "paid" }, { status: "attended" },
      { status: "cancelled" }, { status: "refunded" },
    ];
    expect(countActiveSeats(seats)).toBe(3);
  });

  it("blocks bookings on cancelled or completed offerings", () => {
    expect(canBookSeat({ offering: { ...OFFERING, status: "cancelled" }, seats: [], founderUserId: "f1", now: NOW })).toEqual({ ok: false, reason: "offering_cancelled" });
    expect(canBookSeat({ offering: { ...OFFERING, status: "completed" }, seats: [], founderUserId: "f1", now: NOW })).toEqual({ ok: false, reason: "offering_completed" });
  });

  it("blocks bookings on past scheduled_at", () => {
    expect(canBookSeat({ offering: { ...OFFERING, scheduled_at: "2025-01-01T00:00:00Z" }, seats: [], founderUserId: "f1", now: NOW })).toEqual({ ok: false, reason: "scheduled_in_past" });
  });

  it("blocks rebooking when founder already has a non-terminal seat", () => {
    const seats = [{ status: "paid" as SeatStatus, founder_user_id: "f1" }];
    expect(canBookSeat({ offering: OFFERING, seats, founderUserId: "f1", now: NOW })).toEqual({ ok: false, reason: "already_booked" });
  });

  it("allows rebooking when the founder's prior seat was cancelled/refunded", () => {
    const seats = [{ status: "cancelled" as SeatStatus, founder_user_id: "f1" }];
    expect(canBookSeat({ offering: OFFERING, seats, founderUserId: "f1", now: NOW })).toEqual({ ok: true });
  });

  it("blocks bookings at capacity", () => {
    const seats: Array<{ status: SeatStatus; founder_user_id: string }> = [
      { status: "paid", founder_user_id: "a" },
      { status: "paid", founder_user_id: "b" },
      { status: "pending", founder_user_id: "c" },
      { status: "attended", founder_user_id: "d" },
      { status: "paid", founder_user_id: "e" },
    ];
    expect(canBookSeat({ offering: OFFERING, seats, founderUserId: "f1", now: NOW })).toEqual({ ok: false, reason: "capacity_full" });
  });

  it("allows booking when capacity has terminal seats", () => {
    const seats: Array<{ status: SeatStatus; founder_user_id: string }> = [
      { status: "paid", founder_user_id: "a" },
      { status: "cancelled", founder_user_id: "b" },
      { status: "refunded", founder_user_id: "c" },
    ];
    expect(canBookSeat({ offering: OFFERING, seats, founderUserId: "f1", now: NOW })).toEqual({ ok: true });
  });
});

describe("pricing", () => {
  it("isValidSeatPriceCents bounds", () => {
    expect(isValidSeatPriceCents(0)).toBe(true);
    expect(isValidSeatPriceCents(500_000)).toBe(true);
    expect(isValidSeatPriceCents(500_001)).toBe(false);
    expect(isValidSeatPriceCents(-1)).toBe(false);
    expect(isValidSeatPriceCents(1.5)).toBe(false);
  });

  it("mentorTotalTakeHomeCents subtracts per-seat fee then multiplies", () => {
    // $20 × 10 seats at 10% fee = ($20 - $2) × 10 = $180 = 18000 cents.
    expect(mentorTotalTakeHomeCents(2000, 10, 10)).toBe(18000);
  });

  it("zero seats or zero price yields zero take-home", () => {
    expect(mentorTotalTakeHomeCents(2000, 0, 10)).toBe(0);
    expect(mentorTotalTakeHomeCents(0, 10, 10)).toBe(0);
  });

  it("formats cents to USD", () => {
    expect(formatPriceUsd(0)).toBe("$0.00");
    expect(formatPriceUsd(2500)).toBe("$25.00");
    expect(formatPriceUsd(1099)).toBe("$10.99");
  });
});

describe("labels", () => {
  it("returns distinct labels per status", () => {
    const oh = ["open", "cancelled", "completed"].map((s) => officeHoursStatusLabel(s as Parameters<typeof officeHoursStatusLabel>[0]));
    expect(new Set(oh).size).toBe(3);
    const seat = ["pending", "paid", "cancelled", "refunded", "attended"].map((s) => seatStatusLabel(s as SeatStatus));
    expect(new Set(seat).size).toBe(5);
  });
});
