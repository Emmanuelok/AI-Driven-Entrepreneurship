import { describe, it, expect } from "vitest";
import { aiUsageHeaders } from "./ai-headers";

describe("aiUsageHeaders", () => {
  it("emits token counts from an Anthropic-shaped response", () => {
    const h = aiUsageHeaders({ usage: { input_tokens: 123, output_tokens: 456 } });
    expect(h["X-AI-Tokens-In"]).toBe("123");
    expect(h["X-AI-Tokens-Out"]).toBe("456");
    expect(h["X-AI-Model"]).toBe("claude-sonnet-4-6");
  });

  it("defaults to zero when usage is missing", () => {
    const h = aiUsageHeaders({});
    expect(h["X-AI-Tokens-In"]).toBe("0");
    expect(h["X-AI-Tokens-Out"]).toBe("0");
  });

  it("respects the model override", () => {
    const h = aiUsageHeaders({ usage: { input_tokens: 1, output_tokens: 2 } }, "claude-haiku-4-5-20251001");
    expect(h["X-AI-Model"]).toBe("claude-haiku-4-5-20251001");
  });

  it("handles partial usage objects", () => {
    const h = aiUsageHeaders({ usage: { input_tokens: 5 } });
    expect(h["X-AI-Tokens-In"]).toBe("5");
    expect(h["X-AI-Tokens-Out"]).toBe("0");
  });
});
