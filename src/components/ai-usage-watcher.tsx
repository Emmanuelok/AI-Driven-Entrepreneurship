"use client";

import { useEffect } from "react";
import { useAiUsage } from "@/store/ai-usage";

// Monkey-patches window.fetch ONCE to observe X-AI-Tokens-* headers
// from any AI route response and record them to the client usage store.
// This means every existing fetch() caller automatically benefits — no
// per-callsite wiring needed.

let installed = false;

export function AiUsageWatcher() {
  useEffect(() => {
    if (installed || typeof window === "undefined") return;
    installed = true;
    const original = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const res = await original(input, init);
      try {
        const tIn = Number(res.headers.get("X-AI-Tokens-In") || 0);
        const tOut = Number(res.headers.get("X-AI-Tokens-Out") || 0);
        if (tIn > 0 || tOut > 0) {
          const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
          // Pull a stable scope name from the URL path: /api/build/eval-run → "eval-run"
          const scope = url.split("?")[0].split("/").filter(Boolean).slice(-2).join("/") || "ai";
          const model = res.headers.get("X-AI-Model") || "claude-sonnet-4-6";
          useAiUsage.getState().recordCall({ scope, model, tokensIn: tIn, tokensOut: tOut });
        }
      } catch { /* noop — never let usage tracking break the response */ }
      return res;
    };
  }, []);
  return null;
}
