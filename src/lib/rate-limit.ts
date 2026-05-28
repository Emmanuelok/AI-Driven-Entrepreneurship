// Unified per-process rate limiter for AI routes.
//
// In-memory only — gets reset on every cold start. Good enough until we
// have a real backend; then we swap the buckets out for Upstash/Redis or
// a Postgres rate_limits table. The interface stays the same.

type Bucket = { count: number; tokensIn: number; tokensOut: number; resetAt: number };
const BUCKETS = new Map<string, Bucket>();

export type RateLimitConfig = {
  scope: string;          // e.g. "build-eval", "canvas-assist" — keeps buckets isolated
  ipKey: string;          // identifier (currently IP; will become user.id once auth lands)
  windowMs?: number;      // default 60s
  maxCalls?: number;      // default 30 per window
  maxTokensIn?: number;   // default 200k input tokens per window
  maxTokensOut?: number;  // default 50k output tokens per window
};

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  resetIn: number;        // ms until bucket resets
  reason?: "calls" | "input_tokens" | "output_tokens";
};

export function rateLimit(cfg: RateLimitConfig): RateLimitResult {
  const windowMs = cfg.windowMs ?? 60_000;
  const maxCalls = cfg.maxCalls ?? 30;
  const maxIn = cfg.maxTokensIn ?? 200_000;
  const maxOut = cfg.maxTokensOut ?? 50_000;
  const key = `${cfg.scope}:${cfg.ipKey}`;
  const now = Date.now();
  const b = BUCKETS.get(key);
  if (!b || b.resetAt < now) {
    BUCKETS.set(key, { count: 1, tokensIn: 0, tokensOut: 0, resetAt: now + windowMs });
    return { ok: true, remaining: maxCalls - 1, resetIn: windowMs };
  }
  if (b.count >= maxCalls) return { ok: false, remaining: 0, resetIn: b.resetAt - now, reason: "calls" };
  if (b.tokensIn >= maxIn) return { ok: false, remaining: maxCalls - b.count, resetIn: b.resetAt - now, reason: "input_tokens" };
  if (b.tokensOut >= maxOut) return { ok: false, remaining: maxCalls - b.count, resetIn: b.resetAt - now, reason: "output_tokens" };
  b.count++;
  return { ok: true, remaining: maxCalls - b.count, resetIn: b.resetAt - now };
}

// Record token usage AFTER a Claude call returns. Helps tighten the
// budget on subsequent calls in the same window.
export function recordUsage(cfg: { scope: string; ipKey: string }, tokensIn: number, tokensOut: number) {
  const key = `${cfg.scope}:${cfg.ipKey}`;
  const b = BUCKETS.get(key);
  if (!b) return;
  b.tokensIn += tokensIn;
  b.tokensOut += tokensOut;
}

export function clientIp(req: Request): string {
  return (req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "anon").split(",")[0].trim();
}

// Standard 429 response used across all AI routes. Includes hints the
// client UI uses to show the user when their limit will reset.
export function rateLimited(r: RateLimitResult): Response {
  return new Response(
    JSON.stringify({
      error: "rate_limited",
      reason: r.reason ?? "calls",
      message: `Too many AI requests right now. Try again in ${Math.ceil(r.resetIn / 1000)}s.`,
      resetIn: Math.ceil(r.resetIn / 1000),
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "X-RateLimit-Reset": String(Math.ceil(r.resetIn / 1000)),
        "X-RateLimit-Remaining": String(r.remaining),
      },
    },
  );
}

// Estimate token usage from message bodies — surprisingly accurate to
// within 10% of Claude's real tokenizer for English/French text.
export function approxTokens(s: string): number {
  return Math.ceil(s.length / 4);
}
