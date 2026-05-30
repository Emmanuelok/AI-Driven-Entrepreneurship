// Single entry point for the rate-limit + key-resolution + quota
// dance every AI route needs to do before it can safely call Claude.
//
// Why: this trio used to be copy-pasted across ~12 route handlers.
// The /api/coach/[id] route shipped without it for a session and was
// an open budget-drain vector until the audit caught it. With one
// wrapper, the cost of forgetting becomes a TypeScript error: you
// can't get an apiKey out without going through the guard.
//
// Usage:
//
//   export async function POST(req: Request) {
//     const guard = await aiGuard({ req, scope: "coach", maxCalls: 30 });
//     if (!guard.ok) return guard.response;        // 429 or 402
//     if (!guard.apiKey) return demoFallback();    // no key configured
//     const client = new Anthropic({ apiKey: guard.apiKey });
//     // ...
//   }
//
// keySource lets the caller decide whether to short-circuit quota
// further (BYOK users are still subject to per-process rate limits
// because in-memory buckets don't yet distinguish users, but they
// bypass the platform daily quota).

import { rateLimit, rateLimited, clientIp, type RateLimitResult } from "@/lib/rate-limit";
import { resolveAnthropicKey } from "@/lib/anthropic-key";
import { enforceQuotaForPlatform } from "@/lib/quota";
import { resolveAuthedUserId } from "@/lib/authed-user";

export type AiGuardOptions = {
  req: Request;
  scope: string;
  maxCalls?: number;       // calls / window (default 30)
  windowMs?: number;       // bucket window (default 60s — match rate-limit default)
  maxTokensIn?: number;
  maxTokensOut?: number;
};

export type AiGuardResult =
  | { ok: false; response: Response }
  | {
      ok: true;
      apiKey: string | null;
      keySource: "byok" | "platform" | "none";
      userId: string | null;            // resolved if a valid Bearer token was supplied
      rateLimit: RateLimitResult;
    };

export async function aiGuard(opts: AiGuardOptions): Promise<AiGuardResult> {
  // Resolve the authed user FIRST so we can key the rate-limit bucket
  // by user instead of IP. Per-user keying prevents the "spin up 5
  // proxies to get 5× the limit" evasion that per-IP keying allows.
  // Anonymous callers fall back to IP — better than nothing.
  const userId = await resolveAuthedUserId(opts.req);
  const ipKey = userId ? `user:${userId}` : `ip:${clientIp(opts.req)}`;

  const rl = rateLimit({
    scope: opts.scope,
    ipKey,
    maxCalls: opts.maxCalls,
    windowMs: opts.windowMs,
    maxTokensIn: opts.maxTokensIn,
    maxTokensOut: opts.maxTokensOut,
  });
  if (!rl.ok) return { ok: false, response: rateLimited(rl) };

  const { key: apiKey, source: keySource } = resolveAnthropicKey(opts.req);

  // Platform daily-quota gate runs even when no key is configured —
  // an over-quota anonymous caller should see the friendly 402, not
  // a silent demo response that suggests the platform is working.
  const quotaBlocked = await enforceQuotaForPlatform(opts.req, keySource);
  if (quotaBlocked) return { ok: false, response: quotaBlocked };

  return { ok: true, apiKey, keySource, userId, rateLimit: rl };
}
