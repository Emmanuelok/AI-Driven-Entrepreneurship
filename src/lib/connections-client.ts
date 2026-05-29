"use client";

import { supabaseBrowser } from "@/lib/supabase";
import type { ConnectionRow } from "@/lib/connections";

// Client-side fetch of the user's full connection graph, with a 60s
// in-memory cache so repeated AI calls in the same session don't slam
// /api/v2/connections. Returns [] for anonymous users or when cloud
// sync isn't configured.
//
// Used by the async site-brain snapshot builder — we attach the graph
// (trimmed) so AI sees relationships like "this sketch seeded that
// venture" without us having to thread them through every component.

let cache: { ts: number; rows: ConnectionRow[] } | null = null;
const TTL_MS = 60_000;

export async function fetchUserConnectionsCached(): Promise<ConnectionRow[]> {
  if (cache && Date.now() - cache.ts < TTL_MS) return cache.rows;
  const fresh = await fetchUserConnections();
  cache = { ts: Date.now(), rows: fresh };
  return fresh;
}

export function invalidateConnectionsCache() {
  cache = null;
}

async function fetchUserConnections(): Promise<ConnectionRow[]> {
  try {
    const sb = supabaseBrowser();
    if (!sb) return [];
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return [];
    const res = await fetch("/api/v2/connections?all=1", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.ok) return [];
    return (data.results ?? []) as ConnectionRow[];
  } catch {
    return [];
  }
}
