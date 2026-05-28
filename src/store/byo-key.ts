"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

// Bring-your-own Anthropic API key. Stored ONLY in the user's browser
// (localStorage) — never sent to our backend except as a forwarded
// header that the route uses for THAT one request, then discards.
//
// Students who burn through the platform's daily AI budget can drop in
// their own sk-ant-... and continue using every AI feature without
// limits.

type State = {
  key: string;
  enabled: boolean;
  hydrated: boolean;
  setKey: (k: string) => void;
  setEnabled: (v: boolean) => void;
  clear: () => void;
  _hydrate: () => void;
};

const dummy = { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };

export const useByoKey = create<State>()(
  persist(
    (set) => ({
      key: "",
      enabled: false,
      hydrated: false,
      setKey: (key) => set({ key, enabled: !!key }),
      setEnabled: (enabled) => set({ enabled }),
      clear: () => set({ key: "", enabled: false }),
      _hydrate: () => set({ hydrated: true }),
    }),
    {
      name: "sankofa-byok-v1",
      storage: createJSONStorage(() => (typeof window === "undefined" ? dummy : localStorage)),
      onRehydrateStorage: () => (state) => state?._hydrate(),
    },
  ),
);

// Helper: returns the headers a client AI call should include when BYOK
// is on. Use everywhere we call /api/tutor, /api/coach/*, build/generate,
// etc.
export function byoHeaders(): Record<string, string> {
  const s = useByoKey.getState();
  if (!s.enabled || !s.key) return {};
  return { "X-Anthropic-Key": s.key };
}
