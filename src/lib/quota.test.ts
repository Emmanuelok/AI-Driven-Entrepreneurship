import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { enforceQuotaForPlatform } from "./quota";

// We can't easily mock Supabase in unit tests without dragging in heavy
// scaffolding, so we cover the early-exit branches that don't touch DB.
// The check-quota integration paths get covered in API tests with a
// real (or mocked) Supabase client.

let savedUrl: string | undefined;
let savedKey: string | undefined;
beforeEach(() => {
  savedUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  savedKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
});
afterEach(() => {
  if (savedUrl) process.env.NEXT_PUBLIC_SUPABASE_URL = savedUrl;
  else delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (savedKey) process.env.SUPABASE_SERVICE_ROLE_KEY = savedKey;
  else delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

describe("enforceQuotaForPlatform — early exits", () => {
  it("never blocks BYOK callers (they spend their own money)", async () => {
    const req = new Request("http://x", { headers: { authorization: "Bearer doesntmatter" } });
    const r = await enforceQuotaForPlatform(req, "byok");
    expect(r).toBeNull();
  });

  it("never blocks anonymous callers (no spend attribution possible)", async () => {
    const req = new Request("http://x"); // no Authorization
    const r = await enforceQuotaForPlatform(req, "platform");
    expect(r).toBeNull();
  });

  it("never blocks when supabase isn't configured (local-first mode)", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const req = new Request("http://x", { headers: { authorization: "Bearer x" } });
    const r = await enforceQuotaForPlatform(req, "platform");
    expect(r).toBeNull();
  });

  it("never blocks when key source is 'none'", async () => {
    const req = new Request("http://x", { headers: { authorization: "Bearer x" } });
    const r = await enforceQuotaForPlatform(req, "none");
    expect(r).toBeNull();
  });
});
