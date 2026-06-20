// Pure earnings + engagement aggregation for the mentor dashboard
// (Phase 71). Normalizes payments from two money rails — 1:1 mentor
// sessions (Phase 64) and office-hours seats (Phase 67) — into a
// single shape, then computes headline totals, a month-by-month
// trend, and a forward-looking "upcoming" view.
//
// Kept pure so the API aggregation + the dashboard + the unit tests
// all agree on the money math. All amounts are in CENTS.

export type EarningSource = "session" | "office_hours";

// A single money event normalized from either rail.
export type EarningEvent = {
  source: EarningSource;
  // gross is what the founder paid (price_cents / price_per_seat_cents).
  grossCents: number;
  applicationFeePct: number;
  // 'earned' = money that moved and is the mentor's to keep.
  // 'refunded' = money that moved then reversed (nets to zero).
  // 'scheduled' = accepted/paid but session is in the future.
  state: "earned" | "refunded" | "upcoming";
  // ISO timestamp the money settled (paid_at) — used for the trend.
  // For upcoming events this is the scheduled_at instead.
  at: string;
};

export type MonthBucket = {
  // "2026-06"
  month: string;
  grossCents: number;
  netCents: number;
  count: number;
};

export type MentorEarnings = {
  // Lifetime money the mentor keeps, after platform fee, net of refunds.
  netCents: number;
  // Lifetime gross (pre-fee, net of refunds).
  grossCents: number;
  // Platform fees paid lifetime.
  feeCents: number;
  // Money reversed by refunds (informational).
  refundedCents: number;
  // Count of paid (non-refunded) transactions.
  paidCount: number;
  refundedCount: number;
  // Forward-looking: money locked in for sessions not yet held.
  upcomingNetCents: number;
  upcomingCount: number;
  // Split by rail (net, earned only).
  bySource: Record<EarningSource, { netCents: number; count: number }>;
  // Month-by-month trend, oldest → newest, for the most recent N
  // months (caller decides the window; we return what exists).
  trend: MonthBucket[];
};

// Take-home cents for a single gross amount after the platform fee.
export function takeHomeCents(grossCents: number, applicationFeePct: number): number {
  if (grossCents <= 0) return 0;
  const fee = Math.round(grossCents * applicationFeePct / 100);
  return Math.max(0, grossCents - fee);
}

function monthKey(iso: string): string {
  // Use UTC to keep buckets deterministic regardless of server tz.
  const d = new Date(iso);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function aggregateEarnings(events: EarningEvent[]): MentorEarnings {
  let netCents = 0;
  let grossCents = 0;
  let feeCents = 0;
  let refundedCents = 0;
  let paidCount = 0;
  let refundedCount = 0;
  let upcomingNetCents = 0;
  let upcomingCount = 0;

  const bySource: Record<EarningSource, { netCents: number; count: number }> = {
    session: { netCents: 0, count: 0 },
    office_hours: { netCents: 0, count: 0 },
  };

  const monthMap = new Map<string, MonthBucket>();

  for (const e of events) {
    if (e.grossCents < 0) continue; // defensive
    const net = takeHomeCents(e.grossCents, e.applicationFeePct);

    if (e.state === "earned") {
      grossCents += e.grossCents;
      netCents += net;
      feeCents += e.grossCents - net;
      paidCount += 1;
      bySource[e.source].netCents += net;
      bySource[e.source].count += 1;

      const key = monthKey(e.at);
      const b = monthMap.get(key) ?? { month: key, grossCents: 0, netCents: 0, count: 0 };
      b.grossCents += e.grossCents;
      b.netCents += net;
      b.count += 1;
      monthMap.set(key, b);
    } else if (e.state === "refunded") {
      refundedCents += e.grossCents;
      refundedCount += 1;
    } else if (e.state === "upcoming") {
      upcomingNetCents += net;
      upcomingCount += 1;
    }
  }

  const trend = Array.from(monthMap.values()).sort((a, b) => a.month.localeCompare(b.month));

  return {
    netCents,
    grossCents,
    feeCents,
    refundedCents,
    paidCount,
    refundedCount,
    upcomingNetCents,
    upcomingCount,
    bySource,
    trend,
  };
}

// Build a contiguous month series (no gaps) for the last `months`
// calendar months ending at `now`, filling missing months with zero.
// Useful for a clean sparkline / bar chart with no holes.
export function fillTrend(trend: MonthBucket[], now: Date, months: number): MonthBucket[] {
  const byKey = new Map(trend.map((b) => [b.month, b]));
  const out: MonthBucket[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    out.push(byKey.get(key) ?? { month: key, grossCents: 0, netCents: 0, count: 0 });
  }
  return out;
}

// Format cents → "$1,234.56" with thousands separators.
export function formatUsd(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Short month label "Jun" from a "2026-06" key.
export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  return d.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
}

// Month-over-month delta in net earnings, as a signed percentage.
// Returns null when there's no prior month to compare against (or the
// prior month was zero — can't divide).
export function momNetDeltaPct(trend: MonthBucket[]): number | null {
  if (trend.length < 2) return null;
  const last = trend[trend.length - 1];
  const prev = trend[trend.length - 2];
  if (prev.netCents === 0) return null;
  return Math.round(((last.netCents - prev.netCents) / prev.netCents) * 100);
}
