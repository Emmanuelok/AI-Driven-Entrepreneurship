import { describe, it, expect } from "vitest";
import { hasOrganizationRole, slugifyOrgName, requireOrganizationRole, type OrganizationRole } from "./organization-auth";

describe("hasOrganizationRole", () => {
  it("ranks roles strictly: observer < staff < instructor < admin < owner", () => {
    const order: OrganizationRole[] = ["observer", "staff", "instructor", "admin", "owner"];
    for (let i = 0; i < order.length; i++) {
      for (let j = 0; j < order.length; j++) {
        expect(hasOrganizationRole(order[i], order[j])).toBe(i >= j);
      }
    }
  });

  it("owner satisfies every minimum", () => {
    for (const min of ["observer", "staff", "instructor", "admin", "owner"] as const) {
      expect(hasOrganizationRole("owner", min)).toBe(true);
    }
  });

  it("observer satisfies only observer", () => {
    expect(hasOrganizationRole("observer", "observer")).toBe(true);
    expect(hasOrganizationRole("observer", "staff")).toBe(false);
    expect(hasOrganizationRole("observer", "instructor")).toBe(false);
    expect(hasOrganizationRole("observer", "admin")).toBe(false);
    expect(hasOrganizationRole("observer", "owner")).toBe(false);
  });
});

describe("requireOrganizationRole", () => {
  it("returns null (pass) when the role meets the minimum", () => {
    expect(requireOrganizationRole({ role: "admin" }, "instructor")).toBeNull();
    expect(requireOrganizationRole({ role: "owner" }, "owner")).toBeNull();
  });

  it("returns a 403 Response when below the minimum", async () => {
    const r = requireOrganizationRole({ role: "staff" }, "admin");
    expect(r).not.toBeNull();
    expect(r!.status).toBe(403);
    const body = await r!.json();
    expect(body).toEqual({ ok: false, error: "forbidden", required: "admin", have: "staff" });
  });

  it("returns a 403 Response when not a member at all", async () => {
    const r = requireOrganizationRole(null, "observer");
    expect(r).not.toBeNull();
    expect(r!.status).toBe(403);
    const body = await r!.json();
    expect(body).toEqual({ ok: false, error: "not_a_member" });
  });
});

describe("slugifyOrgName", () => {
  it("lowercases + dashes + trims", () => {
    expect(slugifyOrgName("Sankofa Studio")).toBe("sankofa-studio");
    expect(slugifyOrgName("  KNUST  ")).toBe("knust");
  });

  it("collapses runs of non-alphanum", () => {
    expect(slugifyOrgName("Acme!! @ Inc. ___")).toBe("acme-inc");
  });

  it("strips diacritics", () => {
    expect(slugifyOrgName("École Polytechnique")).toBe("ecole-polytechnique");
  });

  it("caps at 40 chars", () => {
    expect(slugifyOrgName("x".repeat(80)).length).toBeLessThanOrEqual(40);
  });

  it("falls back to 'org' for empty / whitespace / symbols-only", () => {
    expect(slugifyOrgName("")).toBe("org");
    expect(slugifyOrgName("   ")).toBe("org");
    expect(slugifyOrgName("!!!")).toBe("org");
  });

  it("keeps numeric suffixes when present", () => {
    expect(slugifyOrgName("W24 Cohort")).toBe("w24-cohort");
  });
});
