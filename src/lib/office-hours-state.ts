// Pure state machine + booking math for mentor office hours (Phase 67).
// Same shape as mentor-session-state.ts but for the seat-based group
// session model. Reused by API validation, the UI button enablers,
// and the unit tests.

export type OfficeHoursStatus = "open" | "cancelled" | "completed";

export type SeatStatus =
  | "pending"    // founder reserved a seat, hasn't paid
  | "paid"       // founder paid via Stripe (webhook flips this)
  | "cancelled"  // founder cancelled pre-payment
  | "refunded"   // post-payment refund (mentor cancel or admin)
  | "attended";  // mentor marked the founder as present post-session

export type SeatActor = "founder" | "mentor";

// Seat state transitions and who can drive each.
type Transition = { to: SeatStatus; actor: SeatActor | "system" };

const SEAT_TRANSITIONS: Record<SeatStatus, Transition[]> = {
  pending: [
    { to: "paid", actor: "system" },          // Stripe webhook
    { to: "cancelled", actor: "founder" },    // founder backs out before paying
    { to: "cancelled", actor: "mentor" },     // mentor cancels the whole offering
  ],
  paid: [
    { to: "attended", actor: "mentor" },      // mentor marks present after session
    { to: "refunded", actor: "mentor" },      // mentor refunds (rare)
    { to: "refunded", actor: "system" },      // Stripe webhook (admin / mentor refund)
  ],
  attended: [
    // Reviews live on the seat row but are a separate field — not a status
    // transition. Refund is still possible post-attendance for disputes.
    { to: "refunded", actor: "mentor" },
    { to: "refunded", actor: "system" },
  ],
  // Terminal.
  cancelled: [],
  refunded: [],
};

export function canTransitionSeat(
  from: SeatStatus,
  to: SeatStatus,
  actor: SeatActor | "system",
): boolean {
  return SEAT_TRANSITIONS[from]?.some((t) => t.to === to && t.actor === actor) ?? false;
}

export function nextSeatStatusesForActor(
  from: SeatStatus,
  actor: SeatActor,
): SeatStatus[] {
  return (SEAT_TRANSITIONS[from] ?? [])
    .filter((t) => t.actor === actor)
    .map((t) => t.to);
}

export function isSeatTerminal(s: SeatStatus): boolean {
  return s === "cancelled" || s === "refunded";
}

export function seatHasPaid(s: SeatStatus): boolean {
  return s === "paid" || s === "attended" || s === "refunded";
}

// ───── Capacity + booking eligibility ────────────────────────────

export const MIN_CAPACITY = 2;
export const MAX_CAPACITY = 50;

export function isValidCapacity(n: number): boolean {
  return Number.isInteger(n) && n >= MIN_CAPACITY && n <= MAX_CAPACITY;
}

// How many seats are currently "counted" against capacity. We count
// pending + paid + attended; cancelled/refunded seats free up.
export function countActiveSeats(seats: Array<{ status: SeatStatus }>): number {
  return seats.filter((s) => s.status === "pending" || s.status === "paid" || s.status === "attended").length;
}

// Whether a new booking is allowed.
export type BookingCheck =
  | { ok: true }
  | { ok: false; reason: "offering_cancelled" | "offering_completed" | "scheduled_in_past" | "capacity_full" | "already_booked" };

export function canBookSeat(args: {
  offering: { status: OfficeHoursStatus; scheduled_at: string; capacity: number };
  seats: Array<{ status: SeatStatus; founder_user_id: string }>;
  founderUserId: string;
  now?: Date;
}): BookingCheck {
  const now = args.now ?? new Date();
  if (args.offering.status === "cancelled") return { ok: false, reason: "offering_cancelled" };
  if (args.offering.status === "completed") return { ok: false, reason: "offering_completed" };
  if (new Date(args.offering.scheduled_at).getTime() < now.getTime()) {
    return { ok: false, reason: "scheduled_in_past" };
  }
  // Already booked check counts any non-terminal seat by the same founder.
  const existing = args.seats.find(
    (s) => s.founder_user_id === args.founderUserId && !isSeatTerminal(s.status),
  );
  if (existing) return { ok: false, reason: "already_booked" };
  if (countActiveSeats(args.seats) >= args.offering.capacity) {
    return { ok: false, reason: "capacity_full" };
  }
  return { ok: true };
}

// ───── Pricing ───────────────────────────────────────────────────

// Office hours pricing is per-seat. Unlike 1:1, the mentor sets the
// price directly (not derived from hourly rate) because group session
// economics are different — usually 30-50% per seat of the 1:1 rate.
// We validate the price is sensible: 0..100k cents per seat.

export const MAX_PRICE_PER_SEAT_CENTS = 100_00 * 50; // $5000

export function isValidSeatPriceCents(n: number): boolean {
  return Number.isInteger(n) && n >= 0 && n <= MAX_PRICE_PER_SEAT_CENTS;
}

// Total revenue the mentor takes home if all seats sell at the given
// price. priceCents × seats × (1 - feePct/100), with rounding per-seat
// to match how Stripe actually splits each charge.
export function mentorTotalTakeHomeCents(
  priceCents: number,
  seats: number,
  applicationFeePct: number,
): number {
  if (priceCents <= 0 || seats <= 0) return 0;
  const feePerSeat = Math.round(priceCents * applicationFeePct / 100);
  return Math.max(0, (priceCents - feePerSeat) * seats);
}

// Format helpers.
export function formatPriceUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

const STATUS_LABEL: Record<OfficeHoursStatus, string> = {
  open: "Open",
  cancelled: "Cancelled",
  completed: "Completed",
};
export function officeHoursStatusLabel(s: OfficeHoursStatus): string {
  return STATUS_LABEL[s] ?? s;
}

const SEAT_STATUS_LABEL: Record<SeatStatus, string> = {
  pending: "Reserved",
  paid: "Paid",
  cancelled: "Cancelled",
  refunded: "Refunded",
  attended: "Attended",
};
export function seatStatusLabel(s: SeatStatus): string {
  return SEAT_STATUS_LABEL[s] ?? s;
}
