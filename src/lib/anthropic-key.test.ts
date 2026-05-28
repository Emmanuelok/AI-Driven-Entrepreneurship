import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolveAnthropicKey, keySourceHeader } from "./anthropic-key";

const VALID_BYOK = "sk-ant-api03-" + "a".repeat(40);
const VALID_PLATFORM = "sk-ant-platform-key";

let originalEnv: string | undefined;
beforeEach(() => { originalEnv = process.env.ANTHROPIC_API_KEY; });
afterEach(() => {
  if (originalEnv === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = originalEnv;
});

describe("resolveAnthropicKey", () => {
  it("prefers BYOK header over platform env", () => {
    process.env.ANTHROPIC_API_KEY = VALID_PLATFORM;
    const req = new Request("http://x", { headers: { "x-anthropic-key": VALID_BYOK } });
    const r = resolveAnthropicKey(req);
    expect(r.source).toBe("byok");
    expect(r.key).toBe(VALID_BYOK);
  });

  it("falls back to platform env when no BYOK header", () => {
    process.env.ANTHROPIC_API_KEY = VALID_PLATFORM;
    const req = new Request("http://x");
    const r = resolveAnthropicKey(req);
    expect(r.source).toBe("platform");
    expect(r.key).toBe(VALID_PLATFORM);
  });

  it("returns none when neither is available", () => {
    delete process.env.ANTHROPIC_API_KEY;
    const req = new Request("http://x");
    const r = resolveAnthropicKey(req);
    expect(r.source).toBe("none");
    expect(r.key).toBeNull();
  });

  it("ignores a header that doesn't look like an Anthropic key", () => {
    process.env.ANTHROPIC_API_KEY = VALID_PLATFORM;
    const req = new Request("http://x", { headers: { "x-anthropic-key": "garbage-not-a-key" } });
    const r = resolveAnthropicKey(req);
    // Should fall through to platform.
    expect(r.source).toBe("platform");
    expect(r.key).toBe(VALID_PLATFORM);
  });

  it("ignores an OpenAI key in the BYOK header", () => {
    process.env.ANTHROPIC_API_KEY = VALID_PLATFORM;
    const req = new Request("http://x", { headers: { "x-anthropic-key": "sk-openai-1234567890" } });
    const r = resolveAnthropicKey(req);
    expect(r.source).toBe("platform");
  });

  it("ignores a too-short BYOK header", () => {
    process.env.ANTHROPIC_API_KEY = VALID_PLATFORM;
    const req = new Request("http://x", { headers: { "x-anthropic-key": "sk-ant-" } });
    const r = resolveAnthropicKey(req);
    expect(r.source).toBe("platform");
  });

  it("trims whitespace from BYOK header values", () => {
    delete process.env.ANTHROPIC_API_KEY;
    const req = new Request("http://x", { headers: { "x-anthropic-key": `   ${VALID_BYOK}   ` } });
    const r = resolveAnthropicKey(req);
    expect(r.source).toBe("byok");
  });
});

describe("keySourceHeader", () => {
  it("emits X-Key-Source with the right value", () => {
    expect(keySourceHeader("byok")["X-Key-Source"]).toBe("byok");
    expect(keySourceHeader("platform")["X-Key-Source"]).toBe("platform");
    expect(keySourceHeader("none")["X-Key-Source"]).toBe("none");
  });
});
