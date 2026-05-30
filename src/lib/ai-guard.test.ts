import { describe, it, expect, beforeEach, vi } from "vitest";
import { aiGuard } from "./ai-guard";

// We re-import the module under different scope keys each test so the
// per-process rate-limit buckets in rate-limit.ts don't bleed state.
function req(headers: Record<string, string> = {}): Request {
  return new Request("http://test/route", { method: "POST", headers });
}

describe("aiGuard", () => {
  beforeEach(() => {
    // Each test uses a unique scope so the in-memory bucket starts fresh.
    vi.unstubAllEnvs();
  });

  it("returns ok with no apiKey when no key is configured (demo mode)", async () => {
    const g = await aiGuard({ req: req(), scope: `t-${Date.now()}-noKey` });
    expect(g.ok).toBe(true);
    if (g.ok) {
      expect(g.apiKey).toBeNull();
      expect(g.keySource).toBe("none");
    }
  });

  it("surfaces the BYOK header as keySource: byok", async () => {
    const byok = "sk-ant-fake-key-for-testing-only-1234567890";
    const g = await aiGuard({ req: req({ "x-anthropic-key": byok }), scope: `t-${Date.now()}-byok` });
    expect(g.ok).toBe(true);
    if (g.ok) {
      expect(g.apiKey).toBe(byok);
      expect(g.keySource).toBe("byok");
    }
  });

  it("falls back to the platform key when no BYOK header is supplied", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-platform-fake-key-only");
    const g = await aiGuard({ req: req(), scope: `t-${Date.now()}-platform` });
    expect(g.ok).toBe(true);
    if (g.ok) {
      expect(g.apiKey).toBe("sk-ant-platform-fake-key-only");
      expect(g.keySource).toBe("platform");
    }
  });

  it("rate-limits after maxCalls in the same window", async () => {
    const scope = `t-${Date.now()}-rl`;
    // The same IP key is used implicitly (clientIp falls through to
    // "anon" when no proxy headers present), so 3 sequential calls
    // with maxCalls: 2 should give 2 ok + 1 blocked.
    const a = await aiGuard({ req: req(), scope, maxCalls: 2 });
    const b = await aiGuard({ req: req(), scope, maxCalls: 2 });
    const c = await aiGuard({ req: req(), scope, maxCalls: 2 });
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    expect(c.ok).toBe(false);
    if (!c.ok) {
      expect(c.response.status).toBe(429);
    }
  });

  it("returns a real Response with 429 status when rate-limited", async () => {
    const scope = `t-${Date.now()}-resp`;
    await aiGuard({ req: req(), scope, maxCalls: 1 });
    const blocked = await aiGuard({ req: req(), scope, maxCalls: 1 });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.response).toBeInstanceOf(Response);
      const body = await blocked.response.json();
      expect(body.error).toBe("rate_limited");
    }
  });
});
