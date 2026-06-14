// ─────────────────────────────────────────────────────────────────────────
// Pure deadline scheduling logic — used by both the daily cron reminder
// job and the UI's "what's coming up" widget. Keeping it pure and
// dependency-free means we can unit-test it cheaply and reason about
// reminder cadence without spinning up Supabase fixtures.
//
// Reminder ladder for an open deadline:
//
//   • 7 days out  — "First warning"
//   • 3 days out  — "Coming up"
//   • 1 day out   — "Tomorrow"
//   • 6 hours out — "Final call"
//   • Overdue     — "Missed (snoozed)"
//
// We only fire ONE reminder per cron pass per deadline. Idempotency is
// enforced via last_reminded_at + the chosen window — once a 1-day
// warning has been sent, the cron won't re-send while we're still in
// the 1-day window.
// ─────────────────────────────────────────────────────────────────────────

export type DeadlineRow = {
  id: string;
  workspace_id: string;
  assignee_user_id: string | null;
  title: string;
  due_at: string;          // ISO 8601
  status: string;
  set_by_role: string;
  last_reminded_at: string | null;
};

export type ReminderWindow = "7d" | "3d" | "1d" | "6h" | "overdue";

const DAY = 86_400_000;
const HOUR = 3_600_000;

// Boundaries — inclusive lower bound, exclusive upper bound — keep the
// windows non-overlapping. Overdue gets a 24h grace window for the "you
// missed it" notification before we let the deadline go silent (the UI
// keeps showing missed deadlines indefinitely; the cron just stops
// nagging).
const WINDOWS: { name: ReminderWindow; lower: number; upper: number }[] = [
  { name: "6h",      lower: 0,             upper: 6 * HOUR },
  { name: "1d",      lower: 6 * HOUR,      upper: 1 * DAY  },
  { name: "3d",      lower: 1 * DAY,       upper: 3 * DAY  },
  { name: "7d",      lower: 3 * DAY,       upper: 7 * DAY  },
];

// Returns the active reminder window for an open deadline, OR
// "overdue" within the first 24h past due, OR null if no reminder
// should be sent (too far away, too long overdue, or already done).
export function dueWindow(d: DeadlineRow, now: number): ReminderWindow | null {
  if (d.status !== "open") return null;
  const due = new Date(d.due_at).getTime();
  if (isNaN(due)) return null;
  const delta = due - now;
  if (delta < 0) {
    // Overdue grace period: fire once within the first 24 hours.
    return -delta < DAY ? "overdue" : null;
  }
  for (const w of WINDOWS) {
    if (delta >= w.lower && delta < w.upper) return w.name;
  }
  return null;
}

// Whether the cron should send a reminder for this row right now.
// Returns false if a reminder has already been sent during the current
// window — using window LENGTH as the dedupe horizon so the same window
// can never fire twice.
export function shouldRemind(d: DeadlineRow, now: number): { window: ReminderWindow } | null {
  const window = dueWindow(d, now);
  if (!window) return null;
  if (!d.last_reminded_at) return { window };
  const lastMs = new Date(d.last_reminded_at).getTime();
  if (isNaN(lastMs)) return { window };
  const horizon = horizonFor(window);
  if (now - lastMs >= horizon) return { window };
  return null;
}

function horizonFor(window: ReminderWindow): number {
  // Each window deserves its own horizon. The 7-day window can sit
  // re-eligible after 4 days (we don't want to nag daily that far out);
  // the 6-hour window can re-fire after 4 hours if a previous reminder
  // failed delivery. Overdue is intentionally short — one nag, then
  // silence.
  switch (window) {
    case "7d":      return 4 * DAY;
    case "3d":      return 2 * DAY;
    case "1d":      return 12 * HOUR;
    case "6h":      return 4 * HOUR;
    case "overdue": return 24 * HOUR;
  }
}

// Human label for UI badges and notification copy. Reads naturally
// regardless of the source-of-authority on the deadline.
export function windowLabel(window: ReminderWindow): string {
  switch (window) {
    case "7d":      return "In about a week";
    case "3d":      return "In a few days";
    case "1d":      return "Tomorrow";
    case "6h":      return "Today";
    case "overdue": return "Missed";
  }
}

// Authoritative source labels for the chips next to a deadline.
export function setByLabel(setByRole: string): { label: string; tone: "muted" | "amber" | "rust" | "indigo" | "emerald" } {
  switch (setByRole) {
    case "self":       return { label: "Self-set",         tone: "muted" };
    case "admin":      return { label: "Workspace admin",  tone: "indigo" };
    case "instructor": return { label: "Instructor",       tone: "amber" };
    case "funder":     return { label: "Funder",           tone: "rust" };
    case "investor":   return { label: "Investor",         tone: "rust" };
    case "journal":    return { label: "Journal",          tone: "indigo" };
    case "mentor":     return { label: "Mentor",           tone: "emerald" };
    default:           return { label: setByRole,          tone: "muted" };
  }
}

// "Due in N days/hours/minutes" — small enough to inline anywhere.
export function relativeDue(due: string | Date, now: number): string {
  const ts = typeof due === "string" ? new Date(due).getTime() : due.getTime();
  const delta = ts - now;
  const abs = Math.abs(delta);
  const sign = delta < 0 ? "overdue" : "in";
  if (abs < 60 * 60 * 1000) {
    const m = Math.max(1, Math.round(abs / 60_000));
    return `${sign === "overdue" ? "overdue" : "in"} ${m}m`;
  }
  if (abs < DAY) {
    const h = Math.round(abs / HOUR);
    return `${sign === "overdue" ? "overdue" : "in"} ${h}h`;
  }
  const d = Math.round(abs / DAY);
  return `${sign === "overdue" ? "overdue" : "in"} ${d}d`;
}
