import { describe, it, expect } from "vitest";
import {
  composeDigest, renderDigestBodyHtml, renderDigestText, type DigestInput,
} from "./digest";

const BASE: DigestInput = {
  displayName: "Ada Okafor",
  baseUrl: "https://sankofa.studio",
  windowDays: 7,
};

describe("composeDigest", () => {
  it("is empty when there's no mentor or founder activity", () => {
    const d = composeDigest(BASE);
    expect(d.isEmpty).toBe(true);
    expect(d.sections).toEqual([]);
    expect(d.subject).toBe("Your Sankofa week");
    expect(d.heading).toContain("Ada"); // first name
  });

  it("omits the mentor section when all mentor figures are zero", () => {
    const d = composeDigest({
      ...BASE,
      mentor: { netCentsThisMonth: 0, netCentsLastMonth: 0, upcomingCount: 0, upcomingNetCents: 0, newReviews: 0, averageRating: null },
    });
    expect(d.isEmpty).toBe(true);
    expect(d.sections.find((s) => s.key === "mentor")).toBeUndefined();
  });

  it("builds a mentor section with earnings + delta + upcoming + reviews", () => {
    const d = composeDigest({
      ...BASE,
      mentor: { netCentsThisMonth: 45000, netCentsLastMonth: 30000, upcomingCount: 2, upcomingNetCents: 18000, newReviews: 1, averageRating: 4.8 },
    });
    const m = d.sections.find((s) => s.key === "mentor");
    expect(m).toBeDefined();
    expect(m!.lines[0]).toContain("$450.00");
    expect(m!.lines[0]).toContain("up 50%");
    expect(m!.lines.some((l) => l.includes("2 paid sessions"))).toBe(true);
    expect(m!.lines.some((l) => l.includes("4.8"))).toBe(true);
  });

  it("reports a down-delta when this month is lower", () => {
    const d = composeDigest({
      ...BASE,
      mentor: { netCentsThisMonth: 15000, netCentsLastMonth: 30000, upcomingCount: 0, upcomingNetCents: 0, newReviews: 0, averageRating: null },
    });
    const m = d.sections.find((s) => s.key === "mentor")!;
    expect(m.lines[0]).toContain("down 50%");
  });

  it("omits the delta when last month was zero", () => {
    const d = composeDigest({
      ...BASE,
      mentor: { netCentsThisMonth: 15000, netCentsLastMonth: 0, upcomingCount: 0, upcomingNetCents: 0, newReviews: 0, averageRating: null },
    });
    const m = d.sections.find((s) => s.key === "mentor")!;
    expect(m.lines[0]).not.toContain("%");
  });

  it("builds a founder section + leads the subject with hot investors", () => {
    const d = composeDigest({
      ...BASE,
      mentor: { netCentsThisMonth: 5000, netCentsLastMonth: 0, upcomingCount: 0, upcomingNetCents: 0, newReviews: 0, averageRating: null },
      founder: { hotInvestors: 3, coldInvestors: 1, newViews: 9, topVenture: { title: "Zuri Health", slug: "zuri-health", engagementScore: 72 } },
    });
    const f = d.sections.find((s) => s.key === "founder");
    expect(f).toBeDefined();
    // Hot investors carry the highest weight → headline leads with it.
    expect(d.subject).toContain("3 investors reviewing your raise");
    expect(f!.lines.some((l) => l.includes("Zuri Health"))).toBe(true);
    expect(f!.lines.some((l) => l.includes("9 dataroom views"))).toBe(true);
    expect(f!.lines.some((l) => l.includes("haven't opened") || l.includes("hasn't opened"))).toBe(true);
  });

  it("points the CTA at fundraising when investor activity exists", () => {
    const d = composeDigest({
      ...BASE,
      founder: { hotInvestors: 1, coldInvestors: 0, newViews: 0, topVenture: null },
    });
    expect(d.cta.href).toContain("/studio/fundraising");
  });

  it("points the CTA at the mentor dashboard for mentor-only activity", () => {
    const d = composeDigest({
      ...BASE,
      mentor: { netCentsThisMonth: 5000, netCentsLastMonth: 0, upcomingCount: 0, upcomingNetCents: 0, newReviews: 0, averageRating: null },
    });
    expect(d.cta.href).toContain("/studio/mentor-dashboard");
  });
});

describe("renderers", () => {
  const d = composeDigest({
    ...BASE,
    founder: { hotInvestors: 2, coldInvestors: 0, newViews: 5, topVenture: null },
  });

  it("HTML body escapes content + lists section lines", () => {
    const html = renderDigestBodyHtml(d);
    expect(html).toContain("<ul");
    expect(html).toContain("Your fundraise");
    expect(html).not.toContain("<script>");
  });

  it("text rendering includes heading, sections, and the CTA url", () => {
    const text = renderDigestText(d);
    expect(text).toContain("YOUR FUNDRAISE");
    expect(text).toContain("https://sankofa.studio/studio/fundraising");
    expect(text).toMatch(/•/);
  });

  it("escapes HTML-significant characters in dynamic content", () => {
    const dirty = composeDigest({
      ...BASE,
      founder: { hotInvestors: 0, coldInvestors: 0, newViews: 1, topVenture: { title: "<b>Pwn</b> & Co", slug: "x", engagementScore: 10 } },
    });
    const html = renderDigestBodyHtml(dirty);
    expect(html).toContain("&lt;b&gt;Pwn&lt;/b&gt; &amp; Co");
    expect(html).not.toContain("<b>Pwn</b>");
  });
});
