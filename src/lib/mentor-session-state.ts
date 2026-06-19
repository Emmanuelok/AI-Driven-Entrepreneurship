// Pure state machine + pricing math for mentor sessions (Phase 64).
// Both server and client use this; keeping it pure means the API
// validation, the UI button enabler, and the unit tests all agree on
// what's allowed next.

export type MentorSessionStatus =
  | "requested"  // founder asked, mentor hasn't responded
  | "accepted"   // mentor said yes; needs payment
  | "paid"       // founder paid via Stripe
  | "completed"  // mentor marked session done
  | "reviewed"   // founder left a review post-completion
  | "cancelled"  // pre-payment cancellation by either party
  | "refunded";  // post-payment refund

export type ActorRole = "mentor" | "founder";

// Allowed transitions, plus WHO can drive each one.
// 'system' means the transition fires from a Stripe webhook, not a
// user action.
type Transition = { to: MentorSessionStatus; actor: ActorRole | "system" };

const TRANSITIONS: Record<MentorSessionStatus, Transition[]> = {
  requested: [
    { to: "accepted", actor: "mentor" },     // mentor accepts
    { to: "cancelled", actor: "mentor" },    // mentor declines
    { to: "cancelled", actor: "founder" },   // founder withdraws
  ],
  accepted: [
    { to: "paid", actor: "system" },         // Stripe webhook
    { to: "cancelled", actor: "mentor" },    // mentor backs out
    { to: "cancelled", actor: "founder" },   // founder backs out (before paying)
  ],
  paid: [
    { to: "completed", actor: "mentor" },    // mentor marks done
    { to: "refunded", actor: "mentor" },     // mentor proactively refunds
    { to: "refunded", actor: "system" },     // Stripe webhook (admin refund)
  ],
  completed: [
    { to: "reviewed", actor: "founder" },    // founder leaves a review
    { to: "refunded", actor: "mentor" },     // post-completion refund (rare)
    { to: "refunded", actor: "system" },     // admin refund
  ],
  // Terminal — nothing else allowed.
  reviewed: [],
  cancelled: [],
  refunded: [],
};

// Check whether `actor` may move the session from `from` → `to`.
export function canTransitionMentorSession(
  from: MentorSessionStatus,
  to: MentorSessionStatus,
  actor: ActorRole | "system",
): boolean {
  return TRANSITIONS[from]?.some((t) => t.to === to && t.actor === actor) ?? false;
}

// All next statuses available to a specific actor (e.g. for rendering
// the button bar in the UI). Excludes 'system' transitions.
export function nextStatusesForActor(
  from: MentorSessionStatus,
  actor: ActorRole,
): MentorSessionStatus[] {
  return (TRANSITIONS[from] ?? [])
    .filter((t) => t.actor === actor)
    .map((t) => t.to);
}

// Whether a status is terminal (no further changes possible).
export function isTerminalStatus(s: MentorSessionStatus): boolean {
  return s === "reviewed" || s === "cancelled" || s === "refunded";
}

// Whether the session is past Stripe — once paid, certain UI
// affordances change (cancel becomes refund, etc.).
export function hasMoneyChanged(s: MentorSessionStatus): boolean {
  return s === "paid" || s === "completed" || s === "reviewed" || s === "refunded";
}

// ───── Pricing math ──────────────────────────────────────────────
//
// Mentors set persona_data.hourlyRate (USD). At request time the
// founder picks a duration; we lock in price_cents = round(rate * 100 *
// duration / 60). Rate edits after the fact don't change the
// contract.
//
// We don't support hourly rates above $5000/hr (sanity bound) or
// below $0 (free sessions go through a separate "pro-bono" path
// that doesn't touch Stripe — out of scope for Phase 64).

export const ALLOWED_DURATIONS = [15, 30, 45, 60, 90] as const;
export type AllowedDurationMin = typeof ALLOWED_DURATIONS[number];

export function isAllowedDuration(d: number): d is AllowedDurationMin {
  return (ALLOWED_DURATIONS as readonly number[]).includes(d);
}

// Compute the session price in CENTS given the mentor's hourly rate
// (USD as a number) and the chosen duration. Returns null when the
// input is invalid — caller handles by rejecting the booking.
export function computeSessionPriceCents(hourlyRateUsd: number | null | undefined, durationMin: number): number | null {
  if (typeof hourlyRateUsd !== "number" || !Number.isFinite(hourlyRateUsd)) return null;
  if (hourlyRateUsd < 1 || hourlyRateUsd > 5000) return null;
  if (!isAllowedDuration(durationMin)) return null;
  return Math.round(hourlyRateUsd * 100 * durationMin / 60);
}

// What the mentor takes home in cents, after the platform's
// application fee. Used by the UI to be transparent about the split.
export function mentorTakeHomeCents(priceCents: number, applicationFeePct: number): number {
  if (priceCents <= 0) return 0;
  const fee = Math.round(priceCents * applicationFeePct / 100);
  return Math.max(0, priceCents - fee);
}

// Pretty-print cents → USD-formatted string. Used by the UI; pure so
// it's also testable. We always go to 2 decimals so $30 → "$30.00".
export function formatPriceUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// Label for each status, used by the UI in badges + filter chips.
const STATUS_LABEL: Record<MentorSessionStatus, string> = {
  requested: "Awaiting mentor",
  accepted: "Needs payment",
  paid: "Booked",
  completed: "Completed",
  reviewed: "Reviewed",
  cancelled: "Cancelled",
  refunded: "Refunded",
};
export function statusLabel(s: MentorSessionStatus): string {
  return STATUS_LABEL[s] ?? s;
}
