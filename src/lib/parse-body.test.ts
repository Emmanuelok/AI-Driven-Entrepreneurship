import { describe, it, expect } from "vitest";
import { z } from "zod";
import { parseBody } from "./parse-body";

function jsonReq(payload: unknown): Request {
  return new Request("http://test/x", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof payload === "string" ? payload : JSON.stringify(payload),
  });
}

const Schema = z.object({
  name: z.string().min(2).max(60),
  count: z.number().int().min(0).max(100).optional(),
});

describe("parseBody", () => {
  it("returns ok with typed data when the body matches", async () => {
    const out = await parseBody(jsonReq({ name: "Ama" }), Schema);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.data.name).toBe("Ama");
  });

  it("returns a 400 with invalid_json when the body isn't JSON", async () => {
    const out = await parseBody(jsonReq("not-json"), Schema);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.response.status).toBe(400);
      const body = await out.response.json();
      expect(body.error).toBe("invalid_json");
    }
  });

  it("returns a 400 with invalid_body + per-path issues when fields fail", async () => {
    const out = await parseBody(jsonReq({ name: "x" }), Schema);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.response.status).toBe(400);
      const body = await out.response.json();
      expect(body.error).toBe("invalid_body");
      expect(Array.isArray(body.issues)).toBe(true);
      expect(body.issues[0].path).toBe("name");
    }
  });

  it("rejects extra-large strings", async () => {
    const out = await parseBody(jsonReq({ name: "x".repeat(100) }), Schema);
    expect(out.ok).toBe(false);
  });

  it("rejects non-integer counts", async () => {
    const out = await parseBody(jsonReq({ name: "Ama", count: 1.5 }), Schema);
    expect(out.ok).toBe(false);
  });

  it("never throws on missing body", async () => {
    const out = await parseBody(new Request("http://test/x", { method: "POST" }), Schema);
    expect(out.ok).toBe(false);
  });
});
