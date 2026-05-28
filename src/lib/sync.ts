"use client";

import { create } from "zustand";
import { supabaseBrowser, isSupabaseConfigured } from "@/lib/supabase";

// Sync state + helpers. Reads/writes the same localStorage keys the
// zustand stores already use; on top of that, pushes to Supabase when
// the user is signed in.

export type SyncState = "idle" | "syncing" | "synced" | "error" | "local-only" | "signed-out";

type State = {
  state: SyncState;
  lastSyncedAt: number | null;
  error: string | null;
  setState: (s: SyncState, error?: string | null) => void;
  setSyncedAt: (ts: number) => void;
};

export const useSync = create<State>((set) => ({
  state: "idle",
  lastSyncedAt: null,
  error: null,
  setState: (state, error = null) => set({ state, error }),
  setSyncedAt: (ts) => set({ lastSyncedAt: ts, state: "synced", error: null }),
}));

const STORE_KEYS = [
  "sankofa-v1",
  "sankofa-build-v1",
  "sankofa-sketch-v1",
  "sankofa-letters-v1",
  "sankofa-ext-v1",
  "sankofa-me-v1",
] as const;

function readAllStores(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of STORE_KEYS) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) out[key] = JSON.parse(raw);
    } catch { /* skip corrupt entries */ }
  }
  return out;
}

function writeAllStores(stores: Record<string, unknown>) {
  for (const [key, blob] of Object.entries(stores)) {
    if (!STORE_KEYS.includes(key as typeof STORE_KEYS[number])) continue;
    try { localStorage.setItem(key, JSON.stringify(blob)); } catch { /* quota */ }
  }
}

// Push current state up to Supabase. Returns true on success.
export async function pushNow(): Promise<boolean> {
  const sb = supabaseBrowser();
  if (!sb) { useSync.getState().setState("local-only"); return false; }
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { useSync.getState().setState("signed-out"); return false; }

  useSync.getState().setState("syncing");
  try {
    const res = await fetch("/api/sync/push", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ stores: readAllStores() }),
    });
    const data = await res.json();
    if (!data.ok) { useSync.getState().setState("error", data.error || "push failed"); return false; }
    useSync.getState().setSyncedAt(Date.now());
    return true;
  } catch (e) {
    useSync.getState().setState("error", (e as Error).message);
    return false;
  }
}

// Pull from Supabase + write into local stores. Called on sign-in /
// initial page load when authed. Returns true if any data was applied.
export async function pullAndMerge(): Promise<boolean> {
  const sb = supabaseBrowser();
  if (!sb) { useSync.getState().setState("local-only"); return false; }
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { useSync.getState().setState("signed-out"); return false; }

  useSync.getState().setState("syncing");
  try {
    const res = await fetch("/api/sync/pull", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const data = await res.json();
    if (!data.ok) { useSync.getState().setState("error", data.error || "pull failed"); return false; }
    writeAllStores(data.stores || {});
    useSync.getState().setSyncedAt(Date.now());
    // Notify zustand stores to rehydrate from localStorage.
    window.dispatchEvent(new Event("sankofa:sync-pulled"));
    return Object.keys(data.stores || {}).length > 0;
  } catch (e) {
    useSync.getState().setState("error", (e as Error).message);
    return false;
  }
}

// Debounced auto-push. Wire up via SyncProvider in studio layout.
let pushTimer: ReturnType<typeof setTimeout> | null = null;
export function schedulePush(debounceMs = 5_000) {
  if (!isSupabaseConfigured()) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => { void pushNow(); }, debounceMs);
}
