"use client";

import { supabaseBrowser } from "@/lib/supabase";
import type { Flow } from "@/store/flow";

// Cloud sync for Flow Studio (Phase 2).
//
// Pattern: opt-in per-flow. The local zustand store is the source of
// truth for the UI; this module pushes the latest local state to the
// cloud on a debounced timer and pulls remote state on app start so a
// user can resume on another device.
//
// Co-edit conflict resolution (last-write-wins for now) lives here so
// the store stays simple. Realtime hooks land in Phase 3.

export type CloudFlow = {
  id: string;
  name: string;
  description: string;
  nodeCount: number;
  edgeCount: number;
  createdAt: string;
  updatedAt: string;
};

async function withSession<T>(fn: (token: string) => Promise<T>): Promise<T | null> {
  try {
    const sb = supabaseBrowser();
    if (!sb) return null;
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return null;
    return await fn(session.access_token);
  } catch {
    return null;
  }
}

// List the caller's cloud flows — used by /studio/flows to merge with
// the local list. Trimmed payload (no graph), one round trip.
export async function fetchCloudFlowList(): Promise<CloudFlow[]> {
  const out = await withSession(async (token) => {
    const res = await fetch("/api/v2/flows", { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    const data = await res.json();
    return data.ok ? (data.results as CloudFlow[]) : null;
  });
  return out ?? [];
}

// Pull the full graph for one flow.
export async function fetchCloudFlow(id: string): Promise<Flow | null> {
  const out = await withSession(async (token) => {
    const res = await fetch(`/api/v2/flows/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.ok ? (data.flow as Flow) : null;
  });
  return out ?? null;
}

// Upsert a flow to the cloud. Returns true on success, false on any
// failure (caller doesn't block on this — autosave is best-effort).
export async function pushFlow(flow: Flow): Promise<boolean> {
  const ok = await withSession(async (token) => {
    const res = await fetch("/api/v2/flows", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        id: flow.id,
        name: flow.name,
        description: flow.description,
        nodes: flow.nodes,
        edges: flow.edges,
        createdAt: flow.createdAt,
      }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return !!data.ok;
  });
  return ok ?? false;
}

export async function deleteCloudFlow(id: string): Promise<boolean> {
  const ok = await withSession(async (token) => {
    const res = await fetch(`/api/v2/flows/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return false;
    const data = await res.json();
    return !!data.ok;
  });
  return ok ?? false;
}

// Debounced autosave: call schedulePush(flow) on every store mutation;
// it coalesces rapid changes so a 30-second flurry of edits hits the
// network once at the trailing edge.
const pending = new Map<string, ReturnType<typeof setTimeout>>();
const PUSH_DELAY_MS = 1500;

export function schedulePush(flow: Flow) {
  const existing = pending.get(flow.id);
  if (existing) clearTimeout(existing);
  pending.set(flow.id, setTimeout(() => {
    pending.delete(flow.id);
    void pushFlow(flow);
  }, PUSH_DELAY_MS));
}

export function cancelScheduledPush(id: string) {
  const existing = pending.get(id);
  if (existing) clearTimeout(existing);
  pending.delete(id);
}
