// Resolves the Anthropic API key to use for one request.
// Priority:
//   1. X-Anthropic-Key header (the student's BYOK)
//   2. ANTHROPIC_API_KEY env (the platform key)
//
// Returns null if neither is present (caller should fall back to demo mode).
//
// BYOK keys are NEVER logged, NEVER stored. The Anthropic client made
// with them is discarded after the request. The X-Anthropic-Key header
// is only valid on the same response cycle that received it.

const HEADER = "x-anthropic-key";

export function resolveAnthropicKey(req: Request): { key: string | null; source: "byok" | "platform" | "none" } {
  const byok = req.headers.get(HEADER)?.trim();
  if (byok && byok.startsWith("sk-ant-") && byok.length > 20) {
    return { key: byok, source: "byok" };
  }
  const platform = process.env.ANTHROPIC_API_KEY;
  if (platform) return { key: platform, source: "platform" };
  return { key: null, source: "none" };
}

// Standard response header so the client can tell which key the response
// used (lets the BYOK UI show "Live (your key)" vs "Live (platform key)").
export function keySourceHeader(source: "byok" | "platform" | "none"): Record<string, string> {
  return { "X-Key-Source": source };
}
