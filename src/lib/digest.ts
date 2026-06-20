// Pure composition for the personal Sankofa digest (Phase 73).
//
// Takes the already-aggregated mentor-earnings + fundraising-engagement
// + reputation numbers (computed server-side via the existing pure
// libs) and turns them into an emailable digest: a smart subject line
// that leads with whatever changed most, plus an HTML body + plain
// text rendering. Sections with no content are omitted entirely so a
// founder-only or mentor-only user never sees empty scaffolding.
//
// Pure → the API, the preview UI, and the unit tests all render the
// identical digest.

import { formatUsd } from "./mentor-earnings";

export type DigestInput = {
  displayName: string;
  baseUrl: string;
  // Mentor side (omit / zeroed when the user isn't a mentor).
  mentor?: {
    netCentsThisMonth: number;
    netCentsLastMonth: number;
    upcomingCount: number;
    upcomingNetCents: number;
    newReviews: number;          // reviews received in the window
    averageRating: number | null;
  };
  // Founder side (omit when the user has no published ventures).
  founder?: {
    hotInvestors: number;
    coldInvestors: number;       // granted, never opened
    newViews: number;            // views in the window
    topVenture: { title: string; slug: string; engagementScore: number } | null;
  };
  windowDays: number;
};

export type DigestSection = {
  key: "mentor" | "founder" | "nudge";
  title: string;
  lines: string[];       // plain lines; renderer escapes + wraps
  emphasis?: string;     // a single highlighted figure
};

export type Digest = {
  subject: string;
  heading: string;
  intro: string;
  sections: DigestSection[];
  cta: { href: string; label: string };
  // True when there's genuinely nothing worth emailing about.
  isEmpty: boolean;
};

function pctDelta(now: number, prev: number): number | null {
  if (prev === 0) return null;
  return Math.round(((now - prev) / prev) * 100);
}

export function composeDigest(input: DigestInput): Digest {
  const sections: DigestSection[] = [];
  const headlineCandidates: { weight: number; text: string }[] = [];

  // ── Mentor section ──────────────────────────────────────────────
  if (input.mentor) {
    const m = input.mentor;
    const lines: string[] = [];
    const delta = pctDelta(m.netCentsThisMonth, m.netCentsLastMonth);

    if (m.netCentsThisMonth > 0) {
      const deltaStr = delta == null ? "" : delta >= 0 ? ` (up ${delta}% on last month)` : ` (down ${Math.abs(delta)}% on last month)`;
      lines.push(`You've earned ${formatUsd(m.netCentsThisMonth)} this month${deltaStr}.`);
      headlineCandidates.push({ weight: 90, text: `${formatUsd(m.netCentsThisMonth)} earned this month` });
    }
    if (m.upcomingCount > 0) {
      lines.push(`${m.upcomingCount} paid session${m.upcomingCount === 1 ? "" : "s"} ahead, worth ${formatUsd(m.upcomingNetCents)} locked in.`);
      headlineCandidates.push({ weight: 60, text: `${m.upcomingCount} session${m.upcomingCount === 1 ? "" : "s"} booked` });
    }
    if (m.newReviews > 0) {
      const avg = m.averageRating != null ? ` Your rating is ${m.averageRating.toFixed(1)}.` : "";
      lines.push(`${m.newReviews} new review${m.newReviews === 1 ? "" : "s"} came in.${avg}`);
      headlineCandidates.push({ weight: 70, text: `${m.newReviews} new review${m.newReviews === 1 ? "" : "s"}` });
    }

    if (lines.length > 0) {
      sections.push({
        key: "mentor",
        title: "Your mentoring",
        lines,
        emphasis: m.netCentsThisMonth > 0 ? formatUsd(m.netCentsThisMonth) : undefined,
      });
    }
  }

  // ── Founder section ─────────────────────────────────────────────
  if (input.founder) {
    const f = input.founder;
    const lines: string[] = [];

    if (f.hotInvestors > 0) {
      lines.push(`${f.hotInvestors} investor${f.hotInvestors === 1 ? " is" : "s are"} actively reviewing your dataroom — follow up while you're top of mind.`);
      headlineCandidates.push({ weight: 95, text: `${f.hotInvestors} investor${f.hotInvestors === 1 ? "" : "s"} reviewing your raise` });
    }
    if (f.newViews > 0) {
      lines.push(`${f.newViews} dataroom view${f.newViews === 1 ? "" : "s"} in the last ${input.windowDays} days.`);
      headlineCandidates.push({ weight: 50, text: `${f.newViews} new dataroom view${f.newViews === 1 ? "" : "s"}` });
    }
    if (f.coldInvestors > 0) {
      lines.push(`${f.coldInvestors} granted investor${f.coldInvestors === 1 ? " hasn't" : "s haven't"} opened the room yet — a nudge might help.`);
    }
    if (f.topVenture && f.topVenture.engagementScore > 0) {
      lines.push(`${f.topVenture.title} is your warmest raise (engagement score ${f.topVenture.engagementScore}).`);
    }

    if (lines.length > 0) {
      sections.push({
        key: "founder",
        title: "Your fundraise",
        lines,
        emphasis: f.hotInvestors > 0 ? `${f.hotInvestors} hot` : undefined,
      });
    }
  }

  // Pick the heaviest-weighted headline; fall back to a generic one.
  headlineCandidates.sort((a, b) => b.weight - a.weight);
  const lead = headlineCandidates[0]?.text;
  const isEmpty = sections.length === 0;

  const subject = isEmpty
    ? `Your Sankofa week`
    : `${lead} · your Sankofa digest`;

  const heading = isEmpty
    ? `Quiet week, ${firstName(input.displayName)}`
    : `Here's your week, ${firstName(input.displayName)}`;

  const intro = isEmpty
    ? `Nothing major moved in the last ${input.windowDays} days. When investors open your dataroom or founders book your time, you'll hear it here.`
    : `A snapshot of what moved in the last ${input.windowDays} days.`;

  // CTA points at whichever dashboard is most relevant.
  const cta = input.founder && (input.founder.hotInvestors > 0 || input.founder.newViews > 0)
    ? { href: `${input.baseUrl}/studio/fundraising`, label: "Open fundraising signal" }
    : input.mentor
      ? { href: `${input.baseUrl}/studio/mentor-dashboard`, label: "Open mentor dashboard" }
      : { href: `${input.baseUrl}/studio`, label: "Open Sankofa" };

  return { subject, heading, intro, sections, cta, isEmpty };
}

function firstName(name: string): string {
  const n = name.trim().split(/\s+/)[0];
  return n || "there";
}

// ── Renderers ──────────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[c]!));
}

// HTML body to drop into emailShell (which provides heading + CTA).
export function renderDigestBodyHtml(digest: Digest): string {
  const parts: string[] = [`<p>${esc(digest.intro)}</p>`];
  for (const s of digest.sections) {
    parts.push(`<p style="margin-top:18px;"><strong style="color:#2cc295;">${esc(s.title)}</strong></p>`);
    parts.push(`<ul style="margin:6px 0 0; padding-left:18px; color:#cfe0d8;">`);
    for (const line of s.lines) {
      parts.push(`<li style="margin:4px 0; line-height:1.5;">${esc(line)}</li>`);
    }
    parts.push(`</ul>`);
  }
  return parts.join("\n");
}

// Plain-text rendering for previews + the text/* email fallback.
export function renderDigestText(digest: Digest): string {
  const lines: string[] = [digest.heading, "", digest.intro, ""];
  for (const s of digest.sections) {
    lines.push(s.title.toUpperCase());
    for (const line of s.lines) lines.push(`  • ${line}`);
    lines.push("");
  }
  lines.push(`${digest.cta.label}: ${digest.cta.href}`);
  return lines.join("\n");
}
