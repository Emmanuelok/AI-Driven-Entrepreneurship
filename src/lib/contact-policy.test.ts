import { describe, it, expect } from "vitest";
import { canContact, contactBlockReason, institutionsMatch } from "./contact-policy";

describe("canContact", () => {
  const base = { isSelf: false, sameInstitution: false, recipientPublic: true } as const;

  it("blocks contacting yourself regardless of policy", () => {
    expect(canContact({ ...base, policy: "open", isSelf: true })).toEqual({ allowed: false, reason: "self" });
  });

  it("blocks when the recipient profile isn't public", () => {
    expect(canContact({ ...base, policy: "open", recipientPublic: false })).toEqual({ allowed: false, reason: "not_public" });
  });

  it("allows when policy is open", () => {
    expect(canContact({ ...base, policy: "open" })).toEqual({ allowed: true });
  });

  it("blocks when policy is closed", () => {
    expect(canContact({ ...base, policy: "closed" })).toEqual({ allowed: false, reason: "closed" });
  });

  it("allows institution policy only with an institution match", () => {
    expect(canContact({ ...base, policy: "institution", sameInstitution: true })).toEqual({ allowed: true });
    expect(canContact({ ...base, policy: "institution", sameInstitution: false })).toEqual({ allowed: false, reason: "institution_only" });
  });

  it("self-check takes precedence over a non-public profile", () => {
    // Both fail, but self is checked first — keeps the message specific.
    expect(canContact({ ...base, policy: "open", isSelf: true, recipientPublic: false })).toEqual({ allowed: false, reason: "self" });
  });

  it("fails closed on an unknown policy", () => {
    expect(canContact({ ...base, policy: "weird" as never })).toEqual({ allowed: false, reason: "closed" });
  });
});

describe("contactBlockReason", () => {
  it("returns a distinct human message per reason", () => {
    const msgs = (["self", "not_public", "closed", "institution_only"] as const).map(contactBlockReason);
    expect(new Set(msgs).size).toBe(4);
    for (const m of msgs) expect(m.length).toBeGreaterThan(10);
  });
});

describe("institutionsMatch", () => {
  it("matches identical strings case-insensitively", () => {
    expect(institutionsMatch("KNUST", "knust")).toBe(true);
    expect(institutionsMatch(" UCT ", "uct")).toBe(true);
  });

  it("matches when one contains the other", () => {
    expect(institutionsMatch("KNUST", "Kwame Nkrumah University (KNUST)")).toBe(true);
    expect(institutionsMatch("University of Lagos", "Lagos")).toBe(true);
  });

  it("does not match unrelated institutions", () => {
    expect(institutionsMatch("KNUST", "UNILAG")).toBe(false);
  });

  it("treats empty/unknown on either side as no match", () => {
    expect(institutionsMatch("", "KNUST")).toBe(false);
    expect(institutionsMatch("KNUST", "")).toBe(false);
    expect(institutionsMatch(null, undefined)).toBe(false);
  });
});
