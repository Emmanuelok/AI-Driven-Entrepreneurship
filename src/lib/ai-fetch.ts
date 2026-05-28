"use client";

import { useAiUsage } from "@/store/ai-usage";

// Client-side fetch wrapper for AI routes. Records usage to the client
// store from response headers the server sends back. The server is the
// source of truth for billing; this is just the visible counterpart.

export async function aiFetch(scope: string, url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, init);
  const tokensIn = Number(res.headers.get("X-AI-Tokens-In") || 0);
  const tokensOut = Number(res.headers.get("X-AI-Tokens-Out") || 0);
  const model = res.headers.get("X-AI-Model") || "claude-sonnet-4-6";
  if (tokensIn > 0 || tokensOut > 0) {
    useAiUsage.getState().recordCall({ scope, model, tokensIn, tokensOut });
  }
  return res;
}
