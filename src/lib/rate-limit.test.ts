import { describe, it, expect, beforeEach } from "vitest";
import { rateLimit, recordUsage, rateLimited, approxTokens, clientIp } from "./rate-limit";

// The limiter is in-process memory keyed by `${scope}:${ipKey}` — every
// test gets a unique scope+ip pair so buckets don't bleed across tests.

let nonce = 0;
function uniqueKey(): { scope: string; ipKey: string } {
  nonce++;
  return { scope: `test-${nonce}`, ipKey: `ip-${nonce}` };
}

describe("rateLimit", () => {
  it("allows calls under the cap", () => {
    const k = uniqueKey();
    for (let i = 0; i < 5; i++) {
      const r = rateLimit({ ...k, maxCalls: 10 });
      expect(r.ok).toBe(true);
    }
  });

  it("blocks once the cap is hit", () => {
    const k = uniqueKey();
    for (let i = 0; i < 3; i++) rateLimit({ ...k, maxCalls: 3 });
    const over = rateLimit({ ...k, maxCalls: 3 });
    expect(over.ok).toBe(false);
    expect(over.reason).toBe("calls");
  });

  it("decrements `remaining` correctly", () => {
    const k = uniqueKey();
    const first = rateLimit({ ...k, maxCalls: 5 });
    expect(first.remaining).toBe(4);
    const second = rateLimit({ ...k, maxCalls: 5 });
    expect(second.remaining).toBe(3);
  });

  it("isolates buckets per scope", () => {
    const ipKey = `ip-iso-${++nonce}`;
    for (let i = 0; i < 5; i++) rateLimit({ scope: "scope-a", ipKey, maxCalls: 5 });
    // scope-a is full but scope-b should still pass
    const r = rateLimit({ scope: "scope-b", ipKey, maxCalls: 5 });
    expect(r.ok).toBe(true);
  });

  it("isolates buckets per ip", () => {
    const scope = `scope-iso-${++nonce}`;
    for (let i = 0; i < 5; i++) rateLimit({ scope, ipKey: "ip-x", maxCalls: 5 });
    const r = rateLimit({ scope, ipKey: "ip-y", maxCalls: 5 });
    expect(r.ok).toBe(true);
  });

  it("enforces input-token cap once recorded", () => {
    const k = uniqueKey();
    rateLimit({ ...k, maxCalls: 100, maxTokensIn: 1000 });
    recordUsage(k, 1500, 0);
    const r = rateLimit({ ...k, maxCalls: 100, maxTokensIn: 1000 });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("input_tokens");
  });

  it("enforces output-token cap once recorded", () => {
    const k = uniqueKey();
    rateLimit({ ...k, maxCalls: 100, maxTokensOut: 500 });
    recordUsage(k, 0, 600);
    const r = rateLimit({ ...k, maxCalls: 100, maxTokensOut: 500 });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("output_tokens");
  });

  it("resets after the window expires", async () => {
    const k = uniqueKey();
    rateLimit({ ...k, maxCalls: 1, windowMs: 30 });
    expect(rateLimit({ ...k, maxCalls: 1, windowMs: 30 }).ok).toBe(false);
    await new Promise((r) => setTimeout(r, 45));
    expect(rateLimit({ ...k, maxCalls: 1, windowMs: 30 }).ok).toBe(true);
  });
});

describe("rateLimited response", () => {
  it("returns a 429 with the documented headers", () => {
    const res = rateLimited({ ok: false, remaining: 0, resetIn: 12345, reason: "calls" });
    expect(res.status).toBe(429);
    expect(res.headers.get("X-RateLimit-Reset")).toBe("13");
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");
    expect(res.headers.get("Content-Type")).toContain("application/json");
  });
});

describe("approxTokens", () => {
  it("approximates English text at roughly 4 chars per token", () => {
    expect(approxTokens("")).toBe(0);
    // 100 chars → 25 tokens
    expect(approxTokens("a".repeat(100))).toBe(25);
    // 101 chars → 26 (ceil)
    expect(approxTokens("a".repeat(101))).toBe(26);
  });
});

describe("clientIp", () => {
  it("prefers x-forwarded-for", () => {
    const req = new Request("http://x", { headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" } });
    expect(clientIp(req)).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip", () => {
    const req = new Request("http://x", { headers: { "x-real-ip": "9.9.9.9" } });
    expect(clientIp(req)).toBe("9.9.9.9");
  });

  it("returns 'anon' when no headers present", () => {
    const req = new Request("http://x");
    expect(clientIp(req)).toBe("anon");
  });
});
