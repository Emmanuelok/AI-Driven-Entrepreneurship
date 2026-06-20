// Pure types + math for the mentor payouts dashboard (Phase 74).
//
// Three concerns live here, all pure:
//
//   1. Ledger normalization — converts raw mentor_sessions and
//      mentor_office_hours_seats rows into a unified LedgerRow shape
//      so the dashboard can render a single sortable list.
//
//   2. Stripe Balance categorization — Stripe returns balance broken
//      out by currency × source_type. Mentors care about ONE number
//      per currency per state: available, pending, in-transit.
//
//   3. Payout schedule interpretation — turns the connected
//      account's payout_schedule object into a human label and a
//      next-payout estimate.
//
// Pure → the API + dashboard + unit tests can never disagree.

// ── Ledger ──────────────────────────────────────────────────────────

export type LedgerSource = "session" | "office_hours";
export type LedgerStatus = "earned" | "upcoming" | "refunded";

export type LedgerRow = {
  id: string;                       // synthetic, source-prefixed
  source: LedgerSource;
  occurredAt: string;               // ISO; when the money moved (or was scheduled)
  status: LedgerStatus;
  grossCents: number;               // founder paid this
  feeCents: number;                 // platform took this
  netCents: number;                 // mentor keeps this (negative on refund)
  currency: string;                 // ISO 4217, lower-case
  counterpartyName: string;
  counterpartySlug: string | null;
  label: string;                    // session topic OR office-hours title
  detailUrl: string;
  stripePaymentIntentId: string | null;
};

// Raw shapes the API hands us. Kept narrow so the pure code doesn't
// need to know about the rest of the DB.

export type RawSession = {
  id: string;
  status: string;                   // mentor-session status
  price_cents: number;
  application_fee_pct: number;
  currency: string;
  paid_at: string | null;
  scheduled_at: string | null;
  topic: string;
  founder_user_id: string;
  stripe_payment_intent_id: string | null;
};

export type RawSeat = {
  id: string;
  office_hours_id: string;
  status: string;                   // seat status
  paid_at: string | null;
  founder_user_id: string;
  stripe_payment_intent_id: string | null;
};

export type RawOffering = {
  id: string;
  title: string;
  scheduled_at: string;
  price_per_seat_cents: number;
  application_fee_pct: number;
  currency: string;
};

export type Counterparty = { display_name: string; slug: string | null };

function takeHome(gross: number, feePct: number): { feeCents: number; netCents: number } {
  if (gross <= 0) return { feeCents: 0, netCents: 0 };
  const feeCents = Math.round((gross * feePct) / 100);
  const netCents = Math.max(0, gross - feeCents);
  return { feeCents, netCents };
}

// Convert raw rows into a unified ledger. `now` is injected so the
// "earned vs upcoming" partition is deterministic in tests.
export function toLedgerRows(args: {
  sessions: RawSession[];
  seats: RawSeat[];
  offerings: RawOffering[];
  counterpartyById: Map<string, Counterparty>;
  now?: Date;
}): LedgerRow[] {
  const now = (args.now ?? new Date()).getTime();
  const offeringById = new Map(args.offerings.map((o) => [o.id, o]));
  const rows: LedgerRow[] = [];

  // ── Sessions ────
  for (const s of args.sessions) {
    const isFuture = s.scheduled_at ? new Date(s.scheduled_at).getTime() > now : false;
    const cp = args.counterpartyById.get(s.founder_user_id) ?? { display_name: "Founder", slug: null };
    const { feeCents, netCents } = takeHome(s.price_cents, s.application_fee_pct);

    if (s.status === "refunded") {
      rows.push({
        id: `sess_${s.id}_refund`,
        source: "session",
        occurredAt: s.paid_at ?? s.scheduled_at ?? new Date(now).toISOString(),
        status: "refunded",
        grossCents: -s.price_cents,
        feeCents: -feeCents,
        netCents: -netCents,
        currency: s.currency,
        counterpartyName: cp.display_name,
        counterpartySlug: cp.slug,
        label: s.topic.slice(0, 120),
        detailUrl: `/studio/mentor-sessions/${s.id}`,
        stripePaymentIntentId: s.stripe_payment_intent_id,
      });
    } else if (s.status === "paid" && isFuture) {
      rows.push({
        id: `sess_${s.id}_upcoming`,
        source: "session",
        occurredAt: s.scheduled_at ?? new Date(now).toISOString(),
        status: "upcoming",
        grossCents: s.price_cents,
        feeCents,
        netCents,
        currency: s.currency,
        counterpartyName: cp.display_name,
        counterpartySlug: cp.slug,
        label: s.topic.slice(0, 120),
        detailUrl: `/studio/mentor-sessions/${s.id}`,
        stripePaymentIntentId: s.stripe_payment_intent_id,
      });
    } else if (s.status === "paid" || s.status === "completed" || s.status === "reviewed") {
      rows.push({
        id: `sess_${s.id}_earned`,
        source: "session",
        occurredAt: s.paid_at ?? new Date(now).toISOString(),
        status: "earned",
        grossCents: s.price_cents,
        feeCents,
        netCents,
        currency: s.currency,
        counterpartyName: cp.display_name,
        counterpartySlug: cp.slug,
        label: s.topic.slice(0, 120),
        detailUrl: `/studio/mentor-sessions/${s.id}`,
        stripePaymentIntentId: s.stripe_payment_intent_id,
      });
    }
    // requested / accepted / cancelled → no money moved.
  }

  // ── Office-hours seats ────
  for (const seat of args.seats) {
    const o = offeringById.get(seat.office_hours_id);
    if (!o) continue;
    const isFuture = new Date(o.scheduled_at).getTime() > now;
    const cp = args.counterpartyById.get(seat.founder_user_id) ?? { display_name: "Founder", slug: null };
    const { feeCents, netCents } = takeHome(o.price_per_seat_cents, o.application_fee_pct);

    if (seat.status === "refunded") {
      rows.push({
        id: `seat_${seat.id}_refund`,
        source: "office_hours",
        occurredAt: seat.paid_at ?? o.scheduled_at,
        status: "refunded",
        grossCents: -o.price_per_seat_cents,
        feeCents: -feeCents,
        netCents: -netCents,
        currency: o.currency,
        counterpartyName: cp.display_name,
        counterpartySlug: cp.slug,
        label: o.title,
        detailUrl: `/studio/office-hours/${o.id}`,
        stripePaymentIntentId: seat.stripe_payment_intent_id,
      });
    } else if (seat.status === "paid" && isFuture) {
      rows.push({
        id: `seat_${seat.id}_upcoming`,
        source: "office_hours",
        occurredAt: o.scheduled_at,
        status: "upcoming",
        grossCents: o.price_per_seat_cents,
        feeCents,
        netCents,
        currency: o.currency,
        counterpartyName: cp.display_name,
        counterpartySlug: cp.slug,
        label: o.title,
        detailUrl: `/studio/office-hours/${o.id}`,
        stripePaymentIntentId: seat.stripe_payment_intent_id,
      });
    } else if (seat.status === "paid" || seat.status === "attended") {
      rows.push({
        id: `seat_${seat.id}_earned`,
        source: "office_hours",
        occurredAt: seat.paid_at ?? o.scheduled_at,
        status: "earned",
        grossCents: o.price_per_seat_cents,
        feeCents,
        netCents,
        currency: o.currency,
        counterpartyName: cp.display_name,
        counterpartySlug: cp.slug,
        label: o.title,
        detailUrl: `/studio/office-hours/${o.id}`,
        stripePaymentIntentId: seat.stripe_payment_intent_id,
      });
    }
  }

  // Newest first.
  rows.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
  return rows;
}

// ── Ledger filtering + summary ─────────────────────────────────────

export type LedgerFilter = {
  source?: LedgerSource;
  status?: LedgerStatus;
  from?: string;       // ISO
  to?: string;         // ISO inclusive
};

export function filterLedger(rows: LedgerRow[], f: LedgerFilter): LedgerRow[] {
  return rows.filter((r) => {
    if (f.source && r.source !== f.source) return false;
    if (f.status && r.status !== f.status) return false;
    if (f.from && new Date(r.occurredAt) < new Date(f.from)) return false;
    if (f.to && new Date(r.occurredAt) > new Date(f.to)) return false;
    return true;
  });
}

export type LedgerSummary = {
  earnedNetCents: number;
  earnedGrossCents: number;
  earnedFeeCents: number;
  earnedCount: number;
  upcomingNetCents: number;
  upcomingCount: number;
  refundedNetCents: number;     // negative
  refundedCount: number;
  // The currency the bulk of the rows use. If mixed, returns the most
  // common; null if there are no rows.
  primaryCurrency: string | null;
};

export function summarizeLedger(rows: LedgerRow[]): LedgerSummary {
  let earnedNet = 0, earnedGross = 0, earnedFee = 0, earnedCount = 0;
  let upcomingNet = 0, upcomingCount = 0;
  let refundedNet = 0, refundedCount = 0;
  const ccyCount = new Map<string, number>();

  for (const r of rows) {
    ccyCount.set(r.currency, (ccyCount.get(r.currency) ?? 0) + 1);
    if (r.status === "earned") {
      earnedNet += r.netCents;
      earnedGross += r.grossCents;
      earnedFee += r.feeCents;
      earnedCount += 1;
    } else if (r.status === "upcoming") {
      upcomingNet += r.netCents;
      upcomingCount += 1;
    } else if (r.status === "refunded") {
      refundedNet += r.netCents; // already negative
      refundedCount += 1;
    }
  }

  let primaryCurrency: string | null = null;
  let max = 0;
  for (const [c, n] of ccyCount) {
    if (n > max) { primaryCurrency = c; max = n; }
  }

  return {
    earnedNetCents: earnedNet,
    earnedGrossCents: earnedGross,
    earnedFeeCents: earnedFee,
    earnedCount,
    upcomingNetCents: upcomingNet,
    upcomingCount,
    refundedNetCents: refundedNet,
    refundedCount,
    primaryCurrency,
  };
}

export type MonthGroup = { month: string; rows: LedgerRow[]; netCents: number };

export function groupLedgerByMonth(rows: LedgerRow[]): MonthGroup[] {
  const map = new Map<string, MonthGroup>();
  for (const r of rows) {
    const d = new Date(r.occurredAt);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const g = map.get(key) ?? { month: key, rows: [], netCents: 0 };
    g.rows.push(r);
    if (r.status === "earned" || r.status === "refunded") g.netCents += r.netCents;
    map.set(key, g);
  }
  // Most recent month first.
  return Array.from(map.values()).sort((a, b) => b.month.localeCompare(a.month));
}

// ── Stripe Balance categorization ──────────────────────────────────

// Subset of the Stripe Balance shape — we only need amount + currency
// per bucket. Lets us unit-test without depending on the SDK type.
export type RawBalanceBucket = { amount: number; currency: string };

export type RawStripeBalance = {
  available: RawBalanceBucket[];
  pending: RawBalanceBucket[];
  instant_available?: RawBalanceBucket[];
};

export type BalanceState = {
  currency: string;
  availableCents: number;
  pendingCents: number;
  instantAvailableCents: number;
};

// Picks ONE currency to surface and sums every bucket inside it.
// Strategy: prefer the currency with the largest TOTAL across all
// three states; ties go to the lexicographically smaller code.
export function categorizeBalance(balance: RawStripeBalance, preferCurrency?: string): BalanceState {
  const totals = new Map<string, number>();
  function bump(b: RawBalanceBucket | undefined) {
    if (!b) return;
    totals.set(b.currency, (totals.get(b.currency) ?? 0) + Math.max(0, b.amount));
  }
  for (const b of balance.available) bump(b);
  for (const b of balance.pending) bump(b);
  for (const b of balance.instant_available ?? []) bump(b);

  let currency = preferCurrency ?? "";
  if (!currency || !totals.has(currency)) {
    let max = -1;
    for (const [c, t] of totals) {
      if (t > max || (t === max && c < currency)) { currency = c; max = t; }
    }
  }
  if (!currency) currency = "usd";

  const sum = (arr: RawBalanceBucket[]) => arr
    .filter((b) => b.currency === currency)
    .reduce((acc, b) => acc + b.amount, 0);

  return {
    currency,
    availableCents: sum(balance.available),
    pendingCents: sum(balance.pending),
    instantAvailableCents: sum(balance.instant_available ?? []),
  };
}

// ── Payout schedule interpretation ─────────────────────────────────

export type RawSchedule = {
  delay_days?: number;
  interval?: string;                 // 'manual' | 'daily' | 'weekly' | 'monthly'
  weekly_anchor?: string;            // 'monday' | …
  monthly_anchor?: number;           // 1..31
};

export type PayoutScheduleSummary = {
  label: string;                     // "Daily" / "Weekly on Fridays" / "Monthly on the 1st" / "Manual"
  isAutomatic: boolean;
  delayDays: number;
  // Estimated next payout date (UTC midnight) given the current
  // available balance + schedule. Null when manual or no available
  // funds.
  nextPayoutAt: string | null;
};

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

export function summarizePayoutSchedule(
  schedule: RawSchedule | null | undefined,
  args: { availableCents: number; now?: Date } = { availableCents: 0 },
): PayoutScheduleSummary {
  const now = args.now ?? new Date();
  if (!schedule || !schedule.interval || schedule.interval === "manual") {
    return { label: "Manual", isAutomatic: false, delayDays: schedule?.delay_days ?? 0, nextPayoutAt: null };
  }
  const isAutomatic = true;
  const delayDays = schedule.delay_days ?? 0;

  let label = "Automatic";
  let nextPayoutAt: string | null = null;

  if (schedule.interval === "daily") {
    label = `Daily${delayDays > 0 ? ` (T+${delayDays})` : ""}`;
    if (args.availableCents > 0) nextPayoutAt = addDays(now, 1).toISOString();
  } else if (schedule.interval === "weekly") {
    const anchorIdx = schedule.weekly_anchor ? WEEKDAYS.indexOf(schedule.weekly_anchor.toLowerCase()) : 5; // default Friday
    const anchor = anchorIdx >= 0 ? anchorIdx : 5;
    label = `Weekly on ${capitalize(WEEKDAYS[anchor])}s`;
    if (args.availableCents > 0) nextPayoutAt = nextWeekday(now, anchor).toISOString();
  } else if (schedule.interval === "monthly") {
    const day = schedule.monthly_anchor ?? 1;
    label = `Monthly on the ${ordinal(day)}`;
    if (args.availableCents > 0) nextPayoutAt = nextMonthly(now, day).toISOString();
  }

  return { label, isAutomatic, delayDays, nextPayoutAt };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function addDays(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n));
}

function nextWeekday(now: Date, targetIdx: number): Date {
  const today = now.getUTCDay();
  let delta = (targetIdx - today + 7) % 7;
  if (delta === 0) delta = 7; // always the next occurrence, not today
  return addDays(now, delta);
}

function nextMonthly(now: Date, day: number): Date {
  let y = now.getUTCFullYear();
  let m = now.getUTCMonth();
  const candidate = new Date(Date.UTC(y, m, Math.min(day, lastDayOfMonth(y, m))));
  if (candidate.getTime() > now.getTime()) return candidate;
  m += 1;
  if (m > 11) { m = 0; y += 1; }
  return new Date(Date.UTC(y, m, Math.min(day, lastDayOfMonth(y, m))));
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

// ── Currency formatting ────────────────────────────────────────────

// Zero-decimal currencies per Stripe docs:
// https://stripe.com/docs/currencies#zero-decimal
const ZERO_DECIMAL = new Set(["bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga", "pyg", "rwf", "ugx", "vnd", "vuv", "xaf", "xof", "xpf"]);

export function isZeroDecimalCurrency(c: string): boolean {
  return ZERO_DECIMAL.has(c.toLowerCase());
}

// Format cents into a localized currency string. Handles zero-decimal
// currencies (JPY/KRW etc. count whole units, not cents).
export function formatMoney(cents: number, currency: string): string {
  const ccy = currency.toUpperCase();
  const isZero = isZeroDecimalCurrency(currency);
  const amount = isZero ? cents : cents / 100;
  const sign = amount < 0 ? "-" : "";
  const abs = Math.abs(amount);
  try {
    return sign + new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: ccy,
      minimumFractionDigits: isZero ? 0 : 2,
      maximumFractionDigits: isZero ? 0 : 2,
    }).format(abs);
  } catch {
    // Unsupported ISO code → fall back.
    return `${sign}${abs.toFixed(isZero ? 0 : 2)} ${ccy}`;
  }
}

// ── Payout row (Stripe shape, normalized for the UI) ───────────────

export type PayoutRow = {
  id: string;
  amountCents: number;
  currency: string;
  status: string;                  // "paid" | "pending" | "in_transit" | "canceled" | "failed"
  arrivalAt: string;               // ISO
  createdAt: string;
  method: string;                  // "standard" | "instant"
  automatic: boolean;
  description: string | null;
  failureMessage: string | null;
};

// Stripe returns arrival_date + created as unix seconds. Normalize.
export function normalizePayout(p: {
  id: string;
  amount: number;
  currency: string;
  status: string;
  arrival_date: number;
  created: number;
  method: string;
  automatic: boolean;
  description: string | null;
  failure_message: string | null;
}): PayoutRow {
  return {
    id: p.id,
    amountCents: p.amount,
    currency: p.currency,
    status: p.status,
    arrivalAt: new Date(p.arrival_date * 1000).toISOString(),
    createdAt: new Date(p.created * 1000).toISOString(),
    method: p.method,
    automatic: p.automatic,
    description: p.description,
    failureMessage: p.failure_message,
  };
}

const STATUS_LABEL: Record<string, string> = {
  paid: "Paid",
  pending: "Pending",
  in_transit: "In transit",
  canceled: "Cancelled",
  failed: "Failed",
};
export function payoutStatusLabel(s: string): string {
  return STATUS_LABEL[s] ?? s;
}
