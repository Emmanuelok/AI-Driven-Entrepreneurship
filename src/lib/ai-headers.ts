// Standard headers to attach to every AI route response so the client
// usage badge can track spending. Pair with lib/rate-limit.ts.

export function aiUsageHeaders(
  res: { usage?: { input_tokens?: number; output_tokens?: number } },
  model = "claude-sonnet-4-6",
): Record<string, string> {
  return {
    "X-AI-Tokens-In": String(res.usage?.input_tokens ?? 0),
    "X-AI-Tokens-Out": String(res.usage?.output_tokens ?? 0),
    "X-AI-Model": model,
  };
}
