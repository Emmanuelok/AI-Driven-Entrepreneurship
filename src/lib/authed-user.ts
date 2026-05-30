// Best-effort resolution of the authed user from a request, used to
// key per-user rate-limit buckets (and any other "who is this caller"
// throttle). NEVER throws; missing/invalid tokens just return null so
// the caller falls back to IP-based limits.
//
// Doesn't replace lib/build-auth or lib/cohort-auth — those check
// authorization (is this user allowed to touch THIS resource). This
// only does authentication (who are they at all).

import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

// Per-request cache so a route that calls aiGuard + another resource
// auth check doesn't hit getUser twice.
const cache = new WeakMap<Request, string | null>();

export async function resolveAuthedUserId(req: Request): Promise<string | null> {
  if (cache.has(req)) return cache.get(req) ?? null;
  let resolved: string | null = null;
  try {
    const header = req.headers.get("authorization") || "";
    const token = header.replace(/^Bearer\s+/i, "").trim();
    if (token && isSupabaseConfigured()) {
      const sb = supabaseAdmin();
      if (sb) {
        const { data, error } = await sb.auth.getUser(token);
        if (!error && data?.user?.id) resolved = data.user.id;
      }
    }
  } catch { /* anonymous on any failure */ }
  cache.set(req, resolved);
  return resolved;
}
