"use client";

import { useAiUsage } from "@/store/ai-usage";
import { buildSiteContextSnapshot } from "@/lib/site-brain-snapshot";

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

// Variant that injects the Sankofa site-brain snapshot into the JSON
// body before sending. Use this for any AI route that should ground
// its answer in the user's venture / cohort / recent work — i.e. all
// of them, except routes that already package their own custom payload
// (like the build proxy).
//
// Merges `siteContext` non-destructively: a caller-supplied siteContext
// wins (lets venture pages override "active venture" with the one in
// the URL, not the most-recently-touched one in the store).
export async function aiFetchWithBrain(
  scope: string,
  url: string,
  body: Record<string, unknown>,
  init?: Omit<RequestInit, "body" | "method"> & { method?: "POST" | "PATCH" | "PUT" },
): Promise<Response> {
  const snapshot = body.siteContext ?? buildSiteContextSnapshot(scope);
  const next = { ...body, siteContext: snapshot };
  return aiFetch(scope, url, {
    method: init?.method ?? "POST",
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    body: JSON.stringify(next),
  });
}
