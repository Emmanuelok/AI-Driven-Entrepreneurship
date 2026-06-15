import { describe, it, expect } from "vitest";
import { hasWorkspaceRole, requireWorkspaceRole, bearerToken } from "./workspace-auth";
import type { WorkspaceRole } from "./workspace-auth";

// Pure parts of the workspace auth layer — the role rank comparison
// (used by every API route to gate writes) and the bearer-token
// extractor (every route reads this). Unit tests instead of full
// integration tests because the Supabase RPC dependency makes the
// async path require live infrastructure; the pure logic here is the
// thing that decides whether a viewer can post a message etc., so
// covering it is what actually protects us.

describe("hasWorkspaceRole — rank comparison", () => {
  const ROLES: WorkspaceRole[] = ["viewer", "editor", "admin", "owner"];

  it("a role always satisfies itself as the minimum", () => {
    for (const r of ROLES) expect(hasWorkspaceRole(r, r)).toBe(true);
  });

  it("higher ranks satisfy lower-or-equal minimums", () => {
    for (let i = 0; i < ROLES.length; i++) {
      for (let j = 0; j <= i; j++) {
        expect(hasWorkspaceRole(ROLES[i], ROLES[j])).toBe(true);
      }
    }
  });

  it("lower ranks NEVER satisfy higher minimums", () => {
    for (let i = 0; i < ROLES.length; i++) {
      for (let j = i + 1; j < ROLES.length; j++) {
        expect(hasWorkspaceRole(ROLES[i], ROLES[j])).toBe(false);
      }
    }
  });

  it("guards the specific invariants the routes rely on", () => {
    // A viewer can never write.
    expect(hasWorkspaceRole("viewer", "editor")).toBe(false);
    // An editor can NOT promote/kick members.
    expect(hasWorkspaceRole("editor", "admin")).toBe(false);
    // An admin can NOT delete the workspace.
    expect(hasWorkspaceRole("admin", "owner")).toBe(false);
    // The owner can do everything.
    expect(hasWorkspaceRole("owner", "viewer")).toBe(true);
    expect(hasWorkspaceRole("owner", "owner")).toBe(true);
  });
});

describe("requireWorkspaceRole — HTTP response", () => {
  it("returns null when the member meets the minimum (caller proceeds)", () => {
    expect(requireWorkspaceRole({ role: "owner" }, "editor")).toBeNull();
    expect(requireWorkspaceRole({ role: "editor" }, "editor")).toBeNull();
    expect(requireWorkspaceRole({ role: "viewer" }, "viewer")).toBeNull();
  });

  it("returns a 403 'not_a_member' when the member is null", async () => {
    const res = requireWorkspaceRole(null, "viewer");
    expect(res).not.toBeNull();
    expect(res!.status).toBe(403);
    const body = await res!.json();
    expect(body.error).toBe("not_a_member");
  });

  it("returns a 403 'forbidden' with diagnostic fields when the rank falls short", async () => {
    const res = requireWorkspaceRole({ role: "editor" }, "admin");
    expect(res).not.toBeNull();
    expect(res!.status).toBe(403);
    const body = await res!.json();
    expect(body.error).toBe("forbidden");
    expect(body.required).toBe("admin");
    expect(body.have).toBe("editor");
  });

  it("responds with JSON Content-Type", () => {
    const res = requireWorkspaceRole(null, "viewer");
    expect(res!.headers.get("Content-Type")).toBe("application/json");
  });
});

describe("bearerToken — extraction", () => {
  it("pulls the token from an Authorization: Bearer header", () => {
    const req = new Request("http://x/", { headers: { Authorization: "Bearer abc.def.ghi" } });
    expect(bearerToken(req)).toBe("abc.def.ghi");
  });

  it("is case-insensitive on the header name", () => {
    const req = new Request("http://x/", { headers: { authorization: "Bearer hello" } });
    expect(bearerToken(req)).toBe("hello");
  });

  it("returns undefined when the header is missing", () => {
    const req = new Request("http://x/");
    expect(bearerToken(req)).toBeUndefined();
  });

  it("returns undefined for an empty token after 'Bearer '", () => {
    const req = new Request("http://x/", { headers: { Authorization: "Bearer " } });
    expect(bearerToken(req)).toBeUndefined();
  });

  it("trims whitespace between Bearer and the token", () => {
    const req = new Request("http://x/", { headers: { Authorization: "Bearer    spaced" } });
    expect(bearerToken(req)).toBe("spaced");
  });
});
