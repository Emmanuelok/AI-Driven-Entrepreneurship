// ─────────────────────────────────────────────────────────────────────────
// Pure month-grid layout for the deadlines calendar.
//
// Given a year + month + a list of items keyed by an ISO timestamp,
// returns a 6-row × 7-column matrix of day cells with the items that
// fall inside each cell, in local time. Pure + deterministic so the
// layout can be unit-tested without rendering.
//
// Why a 6-row grid: months span 4–6 weeks depending on alignment. A
// fixed 42-cell grid means the layout never shifts as you page through
// months, which reads better and keeps row heights stable.
// ─────────────────────────────────────────────────────────────────────────

export type CalendarItem<T> = T & { iso: string };

export type DayCell<T> = {
  date: Date;          // start-of-day in local time
  inMonth: boolean;    // false for the spillover days from the prev/next month
  isToday: boolean;
  items: CalendarItem<T>[];
};

export type MonthGrid<T> = {
  year: number;
  month: number;       // 0-11
  weekStart: 0 | 1;    // 0 = Sun, 1 = Mon (used for weekday headers)
  weekdays: string[];  // 7 short labels, week-start aligned
  cells: DayCell<T>[]; // length 42, row-major
};

const SUN_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Same date in local time, with the time zeroed — used for comparing
// days across timezones (we never want to drop a Friday deadline into
// Thursday because the client's clock is a few hours off).
function startOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function buildMonthGrid<T extends { iso: string }>(
  year: number,
  month: number,
  items: T[],
  opts?: { weekStart?: 0 | 1; now?: number },
): MonthGrid<T> {
  const weekStart = opts?.weekStart ?? 0;
  const now = opts?.now ?? Date.now();
  const today = startOfLocalDay(new Date(now)).getTime();

  // First day of the month in local time, then walk back to the
  // configured week start so the first cell is always a weekStart.
  const first = new Date(year, month, 1);
  const offset = (first.getDay() - weekStart + 7) % 7;
  const gridStart = new Date(year, month, 1 - offset);

  // Bucket items by yyyy-mm-dd of their LOCAL day.
  const buckets = new Map<string, CalendarItem<T>[]>();
  for (const it of items) {
    const d = new Date(it.iso);
    if (isNaN(d.getTime())) continue;
    const key = localDayKey(d);
    const arr = buckets.get(key) ?? [];
    arr.push({ ...it } as CalendarItem<T>);
    buckets.set(key, arr);
  }
  // Stable sort inside each bucket by time so earlier items render first.
  for (const arr of buckets.values()) {
    arr.sort((a, b) => new Date(a.iso).getTime() - new Date(b.iso).getTime());
  }

  const cells: DayCell<T>[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    const day = startOfLocalDay(d);
    const key = localDayKey(day);
    cells.push({
      date: day,
      inMonth: day.getMonth() === month && day.getFullYear() === year,
      isToday: day.getTime() === today,
      items: buckets.get(key) ?? [],
    });
  }

  return {
    year,
    month,
    weekStart,
    weekdays: weekStart === 0 ? SUN_LABELS : [...SUN_LABELS.slice(1), SUN_LABELS[0]],
    cells,
  };
}

export function localDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Month names — short to avoid locale wonkiness in the header.
export const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] as const;

// Returns (year, month) shifted by `delta` months (positive or negative).
export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const total = year * 12 + month + delta;
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
}
