// ─────────────────────────────────────────────────────────────────────────
// Recurrence rules for deadlines.
//
// A pragmatic, well-tested subset of RFC 5545 RRULE: daily / weekly /
// monthly, with INTERVAL, BYDAY (weekly), and either UNTIL or COUNT.
// Wide enough for study groups, weekly reviews, monthly journal
// submissions; narrow enough to be easy to reason about. The pure
// nextOccurrence() function takes the rule + the previous due moment +
// how many occurrences have already happened and returns the next due
// moment, OR null when the series has ended.
//
// All math is in UTC to avoid DST corner cases — calendar apps re-render
// in the viewer's local timezone via the iCalendar feed.
// ─────────────────────────────────────────────────────────────────────────

export type WeekdayCode = "SU" | "MO" | "TU" | "WE" | "TH" | "FR" | "SA";

export type RecurrenceRule = {
  freq: "daily" | "weekly" | "monthly";
  interval?: number;        // every N units (default 1)
  byDay?: WeekdayCode[];    // weekly only — which days of the week
  until?: string;            // ISO date or datetime — inclusive end
  count?: number;            // OR max total occurrences (including the first)
};

const DAY = 86_400_000;
const WEEKDAYS: WeekdayCode[] = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

// Compute the next occurrence STRICTLY AFTER `prev`. `prevCount` is the
// number of occurrences that have happened up to and including `prev`
// (so the next one will be prevCount+1). Returns null when the rule has
// no more occurrences (COUNT exhausted or UNTIL passed).
export function nextOccurrence(rule: RecurrenceRule, prev: Date, prevCount: number): Date | null {
  if (typeof rule.count === "number" && prevCount >= rule.count) return null;

  const interval = Math.max(1, Math.floor(rule.interval ?? 1));
  let candidate: Date;

  if (rule.freq === "daily") {
    candidate = new Date(prev.getTime() + interval * DAY);
  } else if (rule.freq === "weekly") {
    const days = (rule.byDay && rule.byDay.length > 0) ? rule.byDay.map((d) => WEEKDAYS.indexOf(d)).filter((i) => i >= 0).sort((a, b) => a - b) : [prev.getUTCDay()];
    candidate = nextWeekly(prev, interval, days);
  } else if (rule.freq === "monthly") {
    candidate = addMonthsPreservingDay(prev, interval);
  } else {
    return null;
  }

  if (rule.until) {
    const until = new Date(rule.until);
    if (!isNaN(until.getTime()) && candidate.getTime() > until.getTime()) return null;
  }
  return candidate;
}

// Walk forward to the next allowed weekday. The "interval" governs whole
// weeks: with interval=1 we accept any allowed day in the next 7 days;
// with interval=2 we skip the next week entirely if no allowed day fits
// in the SAME week as `prev`.
function nextWeekly(prev: Date, interval: number, allowedDays: number[]): Date {
  const prevDay = prev.getUTCDay();
  // Allowed days strictly AFTER prev in the same week (e.g. Tuesday's
  // perspective on a Mon/Wed/Fri rule: Wednesday is in-week).
  const inWeekRest = allowedDays.filter((d) => d > prevDay);
  if (interval === 1 && inWeekRest.length > 0) {
    const target = inWeekRest[0];
    return new Date(prev.getTime() + (target - prevDay) * DAY);
  }
  // Jump to the start of the Nth week from prev's week, then land on the
  // earliest allowed day of that week. Week starts on Sunday for the
  // calculation; the user's display week-start doesn't affect the
  // underlying recurrence.
  const startOfPrevWeek = prev.getTime() - prevDay * DAY;
  const startOfTargetWeek = startOfPrevWeek + interval * 7 * DAY;
  const earliest = allowedDays[0];
  return new Date(startOfTargetWeek + earliest * DAY);
}

// Add N months while preserving the day-of-month where possible. When
// the target month has fewer days (Feb after Jan-31), clamp to the
// month's last day — matches Google Calendar / Apple Calendar behavior.
function addMonthsPreservingDay(prev: Date, monthsToAdd: number): Date {
  const y = prev.getUTCFullYear();
  const m = prev.getUTCMonth() + monthsToAdd;
  const targetY = y + Math.floor(m / 12);
  const targetM = ((m % 12) + 12) % 12;
  const targetDay = prev.getUTCDate();
  const daysInTargetMonth = new Date(Date.UTC(targetY, targetM + 1, 0)).getUTCDate();
  const day = Math.min(targetDay, daysInTargetMonth);
  return new Date(Date.UTC(targetY, targetM, day, prev.getUTCHours(), prev.getUTCMinutes(), prev.getUTCSeconds()));
}

// Render a rule as a short human-readable string. Used in the deadline
// dialog and on calendar event descriptions.
export function describeRule(rule: RecurrenceRule): string {
  const i = Math.max(1, Math.floor(rule.interval ?? 1));
  const dayLabel: Record<WeekdayCode, string> = { SU: "Sun", MO: "Mon", TU: "Tue", WE: "Wed", TH: "Thu", FR: "Fri", SA: "Sat" };
  let head: string;
  if (rule.freq === "daily") {
    head = i === 1 ? "Daily" : `Every ${i} days`;
  } else if (rule.freq === "weekly") {
    if (rule.byDay && rule.byDay.length > 0) {
      head = i === 1 ? `Weekly on ${rule.byDay.map((d) => dayLabel[d]).join(", ")}` : `Every ${i} weeks on ${rule.byDay.map((d) => dayLabel[d]).join(", ")}`;
    } else {
      head = i === 1 ? "Weekly" : `Every ${i} weeks`;
    }
  } else {
    head = i === 1 ? "Monthly" : `Every ${i} months`;
  }
  const tail = rule.until ? `, until ${new Date(rule.until).toISOString().slice(0, 10)}` : rule.count ? `, ${rule.count} times` : "";
  return head + tail;
}

// Translate our internal rule shape into an RFC 5545 RRULE string for
// inclusion in the iCalendar feed. Calendar apps (Google/Apple/Outlook)
// then expand the series on their side, so subscribers see every future
// occurrence even though the server stores only one row.
export function toRRule(rule: RecurrenceRule): string {
  const parts: string[] = [];
  parts.push(`FREQ=${rule.freq.toUpperCase()}`);
  if (rule.interval && rule.interval > 1) parts.push(`INTERVAL=${rule.interval}`);
  if (rule.freq === "weekly" && rule.byDay && rule.byDay.length > 0) parts.push(`BYDAY=${rule.byDay.join(",")}`);
  if (rule.count) parts.push(`COUNT=${rule.count}`);
  if (rule.until) {
    const u = new Date(rule.until);
    if (!isNaN(u.getTime())) {
      const pad = (n: number) => String(n).padStart(2, "0");
      parts.push(`UNTIL=${u.getUTCFullYear()}${pad(u.getUTCMonth() + 1)}${pad(u.getUTCDate())}T${pad(u.getUTCHours())}${pad(u.getUTCMinutes())}${pad(u.getUTCSeconds())}Z`);
    }
  }
  return parts.join(";");
}

// Lightweight validator — returns a human reason or null when the rule
// is fine. Used by the deadlines route before persisting.
export function validateRule(rule: unknown): { ok: true; rule: RecurrenceRule } | { ok: false; error: string } {
  if (!rule || typeof rule !== "object") return { ok: false, error: "Rule must be an object." };
  const r = rule as Partial<RecurrenceRule>;
  if (!r.freq || !["daily", "weekly", "monthly"].includes(r.freq)) return { ok: false, error: "freq must be daily, weekly, or monthly." };
  if (r.interval !== undefined && (!Number.isFinite(r.interval) || r.interval < 1 || r.interval > 365)) return { ok: false, error: "interval must be a positive number ≤ 365." };
  if (r.byDay !== undefined) {
    if (!Array.isArray(r.byDay)) return { ok: false, error: "byDay must be an array." };
    for (const d of r.byDay) if (!WEEKDAYS.includes(d as WeekdayCode)) return { ok: false, error: `byDay contained unknown code ${d}.` };
    if (r.freq !== "weekly") return { ok: false, error: "byDay only applies to weekly recurrences." };
  }
  if (r.until !== undefined) {
    const u = new Date(r.until);
    if (isNaN(u.getTime())) return { ok: false, error: "until is not a valid date." };
  }
  if (r.count !== undefined && (!Number.isFinite(r.count) || r.count < 1 || r.count > 999)) return { ok: false, error: "count must be a positive number ≤ 999." };
  if (r.until !== undefined && r.count !== undefined) return { ok: false, error: "Use either until OR count, not both." };
  return { ok: true, rule: { freq: r.freq, interval: r.interval, byDay: r.byDay, until: r.until, count: r.count } };
}
