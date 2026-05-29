"use client";

import { supabaseBrowser } from "@/lib/supabase";

// Client-side helper to fire a UX event. Fire-and-forget; never
// awaits, never throws. Use sparingly — only for events that actually
// inform a product decision (threshold tuning, fan-out, conversion).

export function logUxEvent(kind: string, meta?: Record<string, unknown>) {
  // Best-effort: if Supabase isn't configured or there's no network,
  // we silently drop the event rather than degrade the UX.
  void (async () => {
    try {
      const sb = supabaseBrowser();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (sb) {
        const { data: { session } } = await sb.auth.getSession();
        if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
      }
      await fetch("/api/v2/ux-events", {
        method: "POST",
        headers,
        body: JSON.stringify({ kind, meta }),
      });
    } catch { /* silent */ }
  })();
}
