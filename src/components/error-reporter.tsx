"use client";

import { useEffect } from "react";

// Mounts global handlers for uncaught errors and unhandled promise
// rejections, ships them to /api/events. Dedupes recent identical
// errors so a render loop doesn't fan-out to thousands of inserts.

const recent = new Map<string, number>();
const DEDUPE_WINDOW_MS = 60_000;

function dedupedSend(payload: { message: string; scope?: string; ctx?: Record<string, unknown> }) {
  const key = `${payload.scope ?? ""}:${payload.message}`;
  const last = recent.get(key);
  const now = Date.now();
  if (last && now - last < DEDUPE_WINDOW_MS) return;
  recent.set(key, now);
  // Prune old entries occasionally.
  if (recent.size > 100) {
    for (const [k, t] of recent) {
      if (now - t > DEDUPE_WINDOW_MS) recent.delete(k);
    }
  }
  // Fire-and-forget; keepalive lets the request survive page unload.
  try {
    fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "error", level: "error", ...payload }),
      keepalive: true,
    }).catch(() => undefined);
  } catch { /* swallow */ }
}

export function ErrorReporter() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    function onError(ev: ErrorEvent) {
      dedupedSend({
        message: ev.message?.slice(0, 1000) || "Unknown error",
        scope: "window.onerror",
        ctx: {
          filename: ev.filename,
          line: ev.lineno,
          col: ev.colno,
          stack: ev.error instanceof Error ? ev.error.stack?.slice(0, 2000) : undefined,
        },
      });
    }

    function onRejection(ev: PromiseRejectionEvent) {
      const reason = ev.reason;
      const message = reason instanceof Error ? reason.message : String(reason);
      dedupedSend({
        message: message.slice(0, 1000),
        scope: "unhandledrejection",
        ctx: { stack: reason instanceof Error ? reason.stack?.slice(0, 2000) : undefined },
      });
    }

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
