// ─────────────────────────────────────────────────────────────────────────
// Minimal, correct iCalendar (RFC 5545) builder.
//
// We emit a VCALENDAR with one VEVENT per item. Pure + deterministic so
// it's unit-testable, and careful about the two things naive ICS
// generators get wrong:
//
//   1. Text escaping — backslash, comma, semicolon, and newline all have
//      to be escaped inside property values, or Google/Apple silently
//      drop the event.
//   2. Line folding — lines longer than 75 octets must be folded with
//      CRLF + a leading space, or strict parsers reject the file.
//
// Times are emitted as UTC (the trailing Z form), which every calendar
// app renders in the viewer's local zone — exactly what we want for a
// cross-timezone team.
// ─────────────────────────────────────────────────────────────────────────

export type IcsEvent = {
  uid: string;            // globally-unique, stable per logical event
  start: Date;           // event instant (we make these 30-min blocks)
  end?: Date;            // defaults to start + 30 min
  summary: string;
  description?: string;
  url?: string;
  // ISO-ish category label shown by some clients; we use it for the
  // deadline source (instructor/journal/…) or "Task".
  categories?: string[];
  // RFC 5545 RRULE string (e.g. "FREQ=WEEKLY;BYDAY=MO,WE,FR"). Optional.
  rrule?: string;
};

export type IcsCalendar = {
  name: string;
  events: IcsEvent[];
  // Suggested refresh interval the client should poll at (ISO 8601
  // duration). Defaults to 1 hour.
  refreshInterval?: string;
};

export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

// Fold a single logical line to ≤ 75 octets per physical line. We fold
// on character boundaries (good enough for our mostly-ASCII content);
// the continuation marker is CRLF + a single space.
export function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let remaining = line;
  // First line: up to 75 chars. Continuations: up to 74 (the leading
  // space counts toward the 75-octet budget).
  parts.push(remaining.slice(0, 75));
  remaining = remaining.slice(75);
  while (remaining.length > 0) {
    parts.push(" " + remaining.slice(0, 74));
    remaining = remaining.slice(74);
  }
  return parts.join("\r\n");
}

function formatUtc(d: Date): string {
  // YYYYMMDDTHHMMSSZ
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

function line(name: string, value: string): string {
  return foldLine(`${name}:${value}`);
}

export function buildIcs(cal: IcsCalendar, now: Date = new Date()): string {
  const dtstamp = formatUtc(now);
  const out: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Sankofa Studio//Workspaces//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    line("X-WR-CALNAME", escapeIcsText(cal.name)),
    line("NAME", escapeIcsText(cal.name)),
    line("REFRESH-INTERVAL;VALUE=DURATION", cal.refreshInterval ?? "PT1H"),
    line("X-PUBLISHED-TTL", cal.refreshInterval ?? "PT1H"),
  ];

  for (const ev of cal.events) {
    const end = ev.end ?? new Date(ev.start.getTime() + 30 * 60_000);
    out.push("BEGIN:VEVENT");
    out.push(line("UID", ev.uid));
    out.push(line("DTSTAMP", dtstamp));
    out.push(line("DTSTART", formatUtc(ev.start)));
    out.push(line("DTEND", formatUtc(end)));
    out.push(line("SUMMARY", escapeIcsText(ev.summary)));
    if (ev.description) out.push(line("DESCRIPTION", escapeIcsText(ev.description)));
    if (ev.url) out.push(line("URL", escapeIcsText(ev.url)));
    if (ev.categories && ev.categories.length > 0) out.push(line("CATEGORIES", ev.categories.map(escapeIcsText).join(",")));
    if (ev.rrule) out.push(line("RRULE", ev.rrule));
    out.push("END:VEVENT");
  }

  out.push("END:VCALENDAR");
  // RFC 5545 mandates CRLF line endings.
  return out.join("\r\n") + "\r\n";
}
