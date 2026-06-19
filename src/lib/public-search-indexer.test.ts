import { describe, it, expect } from "vitest";
import { composeProfileBody, composeVentureBody, type IndexableProfile, type IndexableVenture } from "./public-search-indexer";

const baseProfile: IndexableProfile = {
  user_id: "u1",
  slug: "ada",
  account_type: "mentor",
  display_name: "Ada Lovelace",
  headline: "Helping founders ship fintech",
  bio: "10 years across Paystack and Carbon. Distribution + ops.",
  country: "Nigeria",
  city: "Lagos",
  primary_language: "English",
  persona_data: {},
};

describe("composeProfileBody", () => {
  it("includes account type, display name, headline, bio, location, language", () => {
    const body = composeProfileBody(baseProfile);
    expect(body).toContain("mentor: Ada Lovelace");
    expect(body).toContain("Helping founders ship fintech");
    expect(body).toContain("10 years across Paystack");
    expect(body).toContain("Lagos, Nigeria");
    expect(body).toContain("language: English");
  });

  it("weaves persona expertise + sectors as tags", () => {
    const body = composeProfileBody({
      ...baseProfile,
      persona_data: { expertise: ["distribution", "B2B SaaS"], sectors: ["fintech", "healthtech"] },
    });
    expect(body).toContain("tags: distribution, B2B SaaS, fintech, healthtech");
  });

  it("surfaces institution + field for students", () => {
    const body = composeProfileBody({
      ...baseProfile,
      account_type: "student",
      persona_data: { institution: "KNUST", field: "Agricultural Engineering" },
    });
    expect(body).toContain("institution: KNUST");
    expect(body).toContain("field: Agricultural Engineering");
  });

  it("surfaces investor firm + funder program + journalist outlet", () => {
    expect(
      composeProfileBody({ ...baseProfile, persona_data: { firmName: "Ventures Platform" } }),
    ).toContain("firm: Ventures Platform");
    expect(
      composeProfileBody({ ...baseProfile, persona_data: { programName: "Tony Elumelu Fellowship" } }),
    ).toContain("program: Tony Elumelu Fellowship");
    expect(
      composeProfileBody({ ...baseProfile, persona_data: { outletName: "TechCabal" } }),
    ).toContain("outlet: TechCabal");
  });

  it("drops empty strings and undefined fields cleanly", () => {
    const body = composeProfileBody({
      ...baseProfile,
      headline: "",
      bio: "",
      country: "",
      city: "",
      primary_language: "",
    });
    // No double newlines / leading whitespace.
    expect(body.split("\n").every((line) => line.trim().length > 0)).toBe(true);
    expect(body).toContain("mentor: Ada Lovelace");
  });

  it("ignores non-string persona array entries", () => {
    const body = composeProfileBody({
      ...baseProfile,
      persona_data: { expertise: ["fintech", 42, null, "ops"] as unknown[] },
    });
    expect(body).toContain("tags: fintech, ops");
    expect(body).not.toContain("42");
    expect(body).not.toContain("null");
  });
});

describe("composeVentureBody", () => {
  const base: IndexableVenture = {
    slug: "kubacold",
    payload: { title: "KubaCold", tagline: "Solar microcold storage for tomato co-ops" },
    sectors: ["agritech", "logistics"],
    stage: "mvp",
    region: "Ghana",
  };

  it("includes title, tagline, region, stage, sectors", () => {
    const body = composeVentureBody(base);
    expect(body).toContain("venture: KubaCold");
    expect(body).toContain("Solar microcold storage");
    expect(body).toContain("region: Ghana");
    expect(body).toContain("stage: mvp");
    expect(body).toContain("sectors: agritech, logistics");
  });

  it("falls back to payload.name then slug for title", () => {
    expect(composeVentureBody({ ...base, payload: { name: "OnlyName" } })).toContain("venture: OnlyName");
    expect(composeVentureBody({ ...base, payload: {} })).toContain("venture: kubacold");
  });

  it("omits empty sectors line", () => {
    expect(composeVentureBody({ ...base, sectors: [] })).not.toContain("sectors:");
  });
});
