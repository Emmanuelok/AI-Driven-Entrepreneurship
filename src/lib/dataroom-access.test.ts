import { describe, it, expect } from "vitest";
import {
  resolveViewerAccess, canViewItem, accessSummary, computeExpiresAt,
  type DataroomGrant,
} from "./dataroom-access";

const NOW = new Date("2026-06-15T12:00:00Z");

function grant(over: Partial<DataroomGrant> = {}): DataroomGrant {
  return {
    granted_to_user_id: "v1",
    granted_at: "2026-06-01T00:00:00Z",
    expires_at: "2026-12-01T00:00:00Z",
    revoked_at: null,
    ...over,
  };
}

describe("resolveViewerAccess", () => {
  it("returns 'anonymous' for unauthenticated viewers", () => {
    const a = resolveViewerAccess({ viewerUserId: null, ownerUserId: "o1", grants: [], now: NOW });
    expect(a.state).toBe("anonymous");
  });

  it("returns 'owner' when the viewer matches owner_user_id", () => {
    const a = resolveViewerAccess({ viewerUserId: "o1", ownerUserId: "o1", grants: [], now: NOW });
    expect(a.state).toBe("owner");
  });

  it("returns 'no_grant' when the viewer has no grant on the venture", () => {
    const a = resolveViewerAccess({ viewerUserId: "v2", ownerUserId: "o1", grants: [grant()], now: NOW });
    expect(a.state).toBe("no_grant");
  });

  it("returns 'granted' with days_left when the grant is active", () => {
    const a = resolveViewerAccess({ viewerUserId: "v1", ownerUserId: "o1", grants: [grant()], now: NOW });
    expect(a.state).toBe("granted");
    if (a.state === "granted") {
      // Dec 1 - Jun 15 = ~169 days
      expect(a.daysLeft).toBeGreaterThanOrEqual(168);
      expect(a.daysLeft).toBeLessThanOrEqual(170);
    }
  });

  it("returns 'granted' with daysLeft=null for open-ended grants", () => {
    const a = resolveViewerAccess({ viewerUserId: "v1", ownerUserId: "o1", grants: [grant({ expires_at: null })], now: NOW });
    expect(a.state).toBe("granted");
    if (a.state === "granted") expect(a.daysLeft).toBeNull();
  });

  it("returns 'expired' when the grant's expiry is past", () => {
    const a = resolveViewerAccess({
      viewerUserId: "v1", ownerUserId: "o1",
      grants: [grant({ expires_at: "2026-06-01T00:00:00Z" })], // expired by NOW
      now: NOW,
    });
    expect(a.state).toBe("expired");
  });

  it("returns 'revoked' when revoked_at is set, regardless of expiry", () => {
    const a = resolveViewerAccess({
      viewerUserId: "v1", ownerUserId: "o1",
      grants: [grant({ revoked_at: "2026-06-10T00:00:00Z" })],
      now: NOW,
    });
    expect(a.state).toBe("revoked");
  });

  it("owner check beats grant check when viewer is somehow both", () => {
    // Pathological: someone granted the owner. Owner state wins.
    const a = resolveViewerAccess({
      viewerUserId: "o1", ownerUserId: "o1",
      grants: [grant({ granted_to_user_id: "o1" })],
      now: NOW,
    });
    expect(a.state).toBe("owner");
  });
});

describe("canViewItem", () => {
  it("public items always render", () => {
    expect(canViewItem({ state: "anonymous" }, "public")).toBe(true);
    expect(canViewItem({ state: "no_grant" }, "public")).toBe(true);
    expect(canViewItem({ state: "revoked" }, "public")).toBe(true);
  });

  it("gated items render for owner + granted only", () => {
    expect(canViewItem({ state: "owner" }, "gated")).toBe(true);
    expect(canViewItem({ state: "granted", grant: grant(), daysLeft: 30 }, "gated")).toBe(true);
    expect(canViewItem({ state: "anonymous" }, "gated")).toBe(false);
    expect(canViewItem({ state: "no_grant" }, "gated")).toBe(false);
    expect(canViewItem({ state: "revoked" }, "gated")).toBe(false);
    expect(canViewItem({ state: "expired", grantExpiresAt: "2025-01-01T00:00:00Z" }, "gated")).toBe(false);
  });
});

describe("accessSummary", () => {
  it("returns distinct human messages per state", () => {
    const messages = [
      accessSummary({ state: "owner" }),
      accessSummary({ state: "granted", grant: grant(), daysLeft: 5 }),
      accessSummary({ state: "granted", grant: grant({ expires_at: null }), daysLeft: null }),
      accessSummary({ state: "expired", grantExpiresAt: "2025-01-01T00:00:00Z" }),
      accessSummary({ state: "revoked" }),
      accessSummary({ state: "no_grant" }),
      accessSummary({ state: "anonymous" }),
    ];
    expect(new Set(messages).size).toBe(7);
  });

  it("handles same-day expiry distinctly from 1-day-left", () => {
    expect(accessSummary({ state: "granted", grant: grant(), daysLeft: 0 })).toContain("today");
    expect(accessSummary({ state: "granted", grant: grant(), daysLeft: 1 })).toContain("1 day");
  });
});

describe("computeExpiresAt", () => {
  const NOW2 = new Date("2026-01-01T00:00:00Z");

  it("returns null for null days (open-ended)", () => {
    expect(computeExpiresAt(NOW2, null)).toBeNull();
  });

  it("returns null for invalid input", () => {
    expect(computeExpiresAt(NOW2, 0)).toBeNull();
    expect(computeExpiresAt(NOW2, -5)).toBeNull();
    expect(computeExpiresAt(NOW2, NaN)).toBeNull();
  });

  it("computes a date N days out for valid input", () => {
    expect(computeExpiresAt(NOW2, 30)!.toISOString()).toBe("2026-01-31T00:00:00.000Z");
    expect(computeExpiresAt(NOW2, 90)!.toISOString()).toBe("2026-04-01T00:00:00.000Z");
  });

  it("clamps to a maximum of 730 days (~2 years)", () => {
    const r = computeExpiresAt(NOW2, 5000)!;
    const diffDays = (r.getTime() - NOW2.getTime()) / 86_400_000;
    expect(diffDays).toBe(730);
  });

  it("clamps fractional / small positive values to a minimum of 1 day", () => {
    // 0.4 days is positive — passes the > 0 gate — but the floor
    // clamp pushes it up to 1.
    const r = computeExpiresAt(NOW2, 0.4)!;
    const diffDays = (r.getTime() - NOW2.getTime()) / 86_400_000;
    expect(diffDays).toBe(1);
  });
});
