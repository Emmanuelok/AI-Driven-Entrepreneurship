import { describe, it, expect } from "vitest";
import { ACCOUNT_TYPES, getAccountTypeDef, slugifyName } from "./account-types";

describe("ACCOUNT_TYPES catalog", () => {
  it("covers all eight account types", () => {
    const types = ACCOUNT_TYPES.map((d) => d.type).sort();
    expect(types).toEqual(
      ["funder", "general", "institution", "instructor", "investor", "journalist", "mentor", "student"].sort(),
    );
  });

  it("every entry has a non-empty label, pitch, and one-liner", () => {
    for (const d of ACCOUNT_TYPES) {
      expect(d.label.length).toBeGreaterThan(0);
      expect(d.pitch.length).toBeGreaterThan(20);
      expect(d.oneLiner.length).toBeGreaterThan(10);
    }
  });

  it("getAccountTypeDef returns the matching def", () => {
    expect(getAccountTypeDef("mentor").label).toBe("Mentor");
    expect(getAccountTypeDef("investor").type).toBe("investor");
  });

  it("getAccountTypeDef falls back to 'general' for unknown input", () => {
    // We don't expose the cast as a public API — this exercises the
    // safety net for legacy rows that might carry a removed type.
    expect(getAccountTypeDef("legacy" as never).type).toBe("general");
  });
});

describe("slugifyName", () => {
  it("normalizes whitespace and casing to lowercase dashes", () => {
    expect(slugifyName("Ada Lovelace")).toBe("ada-lovelace");
    expect(slugifyName("  EMMANUEL  ok  ")).toBe("emmanuel-ok");
  });

  it("strips combining diacritics", () => {
    expect(slugifyName("Bjørn")).toBe("bj-rn"); // ø is its own codepoint, not combining; that's expected
    expect(slugifyName("Adwoa Asante")).toBe("adwoa-asante");
    expect(slugifyName("Côte d'Ivoire")).toBe("cote-d-ivoire");
  });

  it("collapses non-alphanumeric runs to a single dash", () => {
    expect(slugifyName("Ama_._Mensah !!")).toBe("ama-mensah");
  });

  it("falls back to 'member' for empty / whitespace-only input", () => {
    expect(slugifyName("")).toBe("member");
    expect(slugifyName("   ")).toBe("member");
    expect(slugifyName("!!!")).toBe("member");
  });

  it("caps slug length at 40 chars", () => {
    const long = "X".repeat(80);
    expect(slugifyName(long).length).toBeLessThanOrEqual(40);
  });
});
