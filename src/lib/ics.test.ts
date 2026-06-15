import { describe, it, expect } from "vitest";
import { buildIcs, escapeIcsText, foldLine } from "./ics";

const NOW = new Date("2026-06-15T12:00:00Z");

describe("escapeIcsText", () => {
  it("escapes backslash, comma, semicolon, and newline", () => {
    expect(escapeIcsText("a,b;c\\d")).toBe("a\\,b\\;c\\\\d");
    expect(escapeIcsText("line1\nline2")).toBe("line1\\nline2");
    expect(escapeIcsText("crlf\r\nhere")).toBe("crlf\\nhere");
  });
  it("leaves plain text untouched", () => {
    expect(escapeIcsText("Submit revisions")).toBe("Submit revisions");
  });
});

describe("foldLine", () => {
  it("leaves short lines alone", () => {
    expect(foldLine("SUMMARY:hi")).toBe("SUMMARY:hi");
  });
  it("folds long lines with CRLF + leading space, ≤75 octets each", () => {
    const long = "DESCRIPTION:" + "x".repeat(200);
    const folded = foldLine(long);
    const physical = folded.split("\r\n");
    expect(physical.length).toBeGreaterThan(1);
    expect(physical[0].length).toBeLessThanOrEqual(75);
    for (let i = 1; i < physical.length; i++) {
      expect(physical[i].startsWith(" ")).toBe(true);
      expect(physical[i].length).toBeLessThanOrEqual(75);
    }
    // Unfolding reconstructs the original.
    const unfolded = physical.map((p, i) => (i === 0 ? p : p.slice(1))).join("");
    expect(unfolded).toBe(long);
  });
});

describe("buildIcs", () => {
  const cal = {
    name: "My Deadlines",
    events: [
      {
        uid: "deadline-1@sankofa",
        start: new Date("2026-06-20T17:00:00Z"),
        summary: "Submit revised manuscript",
        description: "Set by Journal.",
        url: "https://sankofa.studio/studio/workspaces/abc",
        categories: ["Journal"],
      },
    ],
  };

  it("wraps events in a VCALENDAR with required headers", () => {
    const ics = buildIcs(cal, NOW);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("VERSION:2.0");
    expect(ics).toContain("PRODID:-//Sankofa Studio//Workspaces//EN");
    expect(ics).toContain("END:VCALENDAR");
  });

  it("uses CRLF line endings throughout", () => {
    const ics = buildIcs(cal, NOW);
    // Every line break is a CRLF; there are no bare LFs.
    expect(ics.includes("\r\n")).toBe(true);
    expect(/[^\r]\n/.test(ics)).toBe(false);
  });

  it("emits a VEVENT with UTC DTSTART/DTEND and a default 30-min end", () => {
    const ics = buildIcs(cal, NOW);
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("UID:deadline-1@sankofa");
    expect(ics).toContain("DTSTART:20260620T170000Z");
    expect(ics).toContain("DTEND:20260620T173000Z");
    expect(ics).toContain("SUMMARY:Submit revised manuscript");
    expect(ics).toContain("CATEGORIES:Journal");
    expect(ics).toContain("END:VEVENT");
  });

  it("honors an explicit end time", () => {
    const ics = buildIcs({ name: "x", events: [{ uid: "u", start: new Date("2026-06-20T09:00:00Z"), end: new Date("2026-06-20T10:30:00Z"), summary: "s" }] }, NOW);
    expect(ics).toContain("DTSTART:20260620T090000Z");
    expect(ics).toContain("DTEND:20260620T103000Z");
  });

  it("escapes special characters in summaries and descriptions", () => {
    const ics = buildIcs({ name: "x", events: [{ uid: "u", start: new Date("2026-06-20T09:00:00Z"), summary: "Pay; now, please", description: "a\nb" }] }, NOW);
    expect(ics).toContain("SUMMARY:Pay\\; now\\, please");
    expect(ics).toContain("DESCRIPTION:a\\nb");
  });

  it("renders an empty calendar (no events) without crashing", () => {
    const ics = buildIcs({ name: "Empty", events: [] }, NOW);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("END:VCALENDAR");
    expect(ics).not.toContain("BEGIN:VEVENT");
  });

  it("includes the refresh interval hints", () => {
    const ics = buildIcs(cal, NOW);
    expect(ics).toContain("REFRESH-INTERVAL;VALUE=DURATION:PT1H");
    expect(ics).toContain("X-PUBLISHED-TTL:PT1H");
  });
});
