"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

// Client-side AI usage tracker. Records every AI call surfaced by the UI
// so the student can see what their session has cost. Server-side has the
// real rate limiter (lib/rate-limit.ts); this is the visible counterpart.

export type AiCall = {
  ts: number;
  scope: string;          // canvas-assist, eval-judge, etc.
  model: string;          // claude-sonnet-4-6 etc.
  tokensIn: number;
  tokensOut: number;
  estCostUsd: number;     // rough — based on Sonnet 4.6 list price
};

type State = {
  calls: AiCall[];
  hydrated: boolean;
  budgetDailyUsd: number;
  recordCall: (call: Omit<AiCall, "estCostUsd" | "ts"> & { ts?: number }) => void;
  setBudget: (usd: number) => void;
  totalToday: () => { calls: number; tokensIn: number; tokensOut: number; usd: number };
  reset: () => void;
  _hydrate: () => void;
};

// Sonnet 4.6 indicative prices: $3/MTok in, $15/MTok out.
const PRICE_IN = 3 / 1_000_000;
const PRICE_OUT = 15 / 1_000_000;

const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };

const dummy = { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };

export const useAiUsage = create<State>()(
  persist(
    (set, get) => ({
      calls: [],
      hydrated: false,
      budgetDailyUsd: 2,

      recordCall: (c) => {
        const tokensIn = c.tokensIn || 0;
        const tokensOut = c.tokensOut || 0;
        const est = tokensIn * PRICE_IN + tokensOut * PRICE_OUT;
        const call: AiCall = { ts: c.ts ?? Date.now(), scope: c.scope, model: c.model, tokensIn, tokensOut, estCostUsd: est };
        // Cap at 500 calls in localStorage — older ones drop off.
        set({ calls: [call, ...get().calls].slice(0, 500) });
      },

      setBudget: (usd) => set({ budgetDailyUsd: Math.max(0, usd) }),

      totalToday: () => {
        const since = startOfToday();
        const today = get().calls.filter((c) => c.ts >= since);
        return {
          calls: today.length,
          tokensIn: today.reduce((s, c) => s + c.tokensIn, 0),
          tokensOut: today.reduce((s, c) => s + c.tokensOut, 0),
          usd: today.reduce((s, c) => s + c.estCostUsd, 0),
        };
      },

      reset: () => set({ calls: [] }),

      _hydrate: () => set({ hydrated: true }),
    }),
    {
      name: "sankofa-ai-usage-v1",
      storage: createJSONStorage(() => (typeof window === "undefined" ? dummy : localStorage)),
      onRehydrateStorage: () => (state) => state?._hydrate(),
    },
  ),
);
