"use client";

import { useEffect } from "react";
import { useSync, pullAndMerge, pushNow, schedulePush } from "@/lib/sync";
import { supabaseBrowser, isSupabaseConfigured } from "@/lib/supabase";

// Boots the sync layer:
//   - On mount, pulls remote state and applies to localStorage (if signed in).
//   - Listens to localStorage changes and debounces push-to-Supabase.
//   - Subscribes to auth state changes so sign-in/sign-out flip sync on/off.

const WATCHED = [
  "sankofa-v1",
  "sankofa-build-v1",
  "sankofa-sketch-v1",
  "sankofa-letters-v1",
  "sankofa-ext-v1",
  "sankofa-me-v1",
];

export function SyncProvider() {
  useEffect(() => {
    if (!isSupabaseConfigured()) {
      useSync.getState().setState("local-only");
      return;
    }
    const sb = supabaseBrowser();
    if (!sb) return;

    // Initial pull. Done once per session.
    (async () => {
      const { data: { session } } = await sb.auth.getSession();
      if (session) await pullAndMerge();
      else useSync.getState().setState("signed-out");
    })();

    // Auth changes flip the sync state.
    const { data: subscription } = sb.auth.onAuthStateChange(async (event) => {
      if (event === "SIGNED_IN") await pullAndMerge();
      else if (event === "SIGNED_OUT") useSync.getState().setState("signed-out");
    });

    // Patch setItem so we know when any watched store changes locally.
    // Then debounce a push. zustand's persist middleware calls setItem on
    // every state change, so this catches everything without per-store wiring.
    const originalSet = localStorage.setItem.bind(localStorage);
    localStorage.setItem = function (key: string, value: string) {
      originalSet(key, value);
      if (WATCHED.includes(key)) schedulePush();
    };

    // Also push on page hide so unsaved deltas don't sit in the debounce buffer.
    function onHide() { if (document.visibilityState === "hidden") void pushNow(); }
    document.addEventListener("visibilitychange", onHide);

    return () => {
      subscription.subscription.unsubscribe();
      document.removeEventListener("visibilitychange", onHide);
      localStorage.setItem = originalSet;
    };
  }, []);

  return null;
}
