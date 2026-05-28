import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

// Append-only event log. Used for:
//   - Error tracking (uncaught exceptions, API failures)
//   - AI call audit (model, tokens, cost, scope)
//   - Safety blocks (moderation hits, with reason)
//   - Auth events (sign-in, sign-out)
//   - Publish events (venture / build went public)
//
// Writes go to public.events via service-role so clients can't forge
// origin or user_id. Falls back to console.log when Supabase is unset
// — never throws into caller code.

export type EventKind = "error" | "ai_call" | "safety_block" | "sign_in" | "publish" | "sync" | "fork" | "info";
export type EventLevel = "debug" | "info" | "warn" | "error" | "fatal";

export type EventInput = {
  kind: EventKind;
  level?: EventLevel;
  scope?: string;
  message?: string;
  ctx?: Record<string, unknown>;
  userId?: string;
  ip?: string;
  ua?: string;
};

// Best-effort log. Never throws. Returns true on success.
export async function logEvent(e: EventInput): Promise<boolean> {
  const payload = {
    user_id: e.userId ?? null,
    kind: e.kind,
    level: e.level ?? "info",
    scope: e.scope ?? null,
    message: e.message ?? null,
    ctx: e.ctx ?? {},
    ip_hash: e.ip ? await hashIp(e.ip) : null,
    ua: e.ua ?? null,
  };

  if (!isSupabaseConfigured()) {
    if (process.env.NODE_ENV !== "production") {
      console.log("[event]", e.kind, e.level ?? "info", e.scope, e.message, e.ctx);
    }
    return false;
  }
  try {
    const sb = supabaseAdmin();
    if (!sb) return false;
    const { error } = await sb.from("events").insert(payload);
    return !error;
  } catch {
    return false;
  }
}

// SHA-256 of (ip + daily salt). Lets us correlate abuse without storing
// raw IPs that could doxx students.
async function hashIp(ip: string): Promise<string> {
  const salt = new Date().toISOString().slice(0, 10);
  const data = new TextEncoder().encode(`${salt}:${ip}`);
  const buf = await crypto.subtle.digest("SHA-256", data);
  const arr = Array.from(new Uint8Array(buf));
  return arr.map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 24);
}
