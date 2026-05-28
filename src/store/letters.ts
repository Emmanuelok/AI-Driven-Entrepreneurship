"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { nanoid } from "nanoid";

// Letters Sage writes you at milestones, after sessions, or as periodic reflections.
// These are NOT chat messages — they're written, considered, kept.

export type Letter = {
  id: string;
  ts: number;
  read: boolean;
  archived: boolean;
  reason: string; // why Sage wrote — "milestone", "session-end", "weekly", "pattern-notice"
  title: string;
  body: string; // markdown
  triggeredBy?: string; // event reference
  cta?: { label: string; href: string };
};

export type SageSession = {
  id: string;
  startedAt: number;
  endedAt?: number;
  topic?: string;
  messages: { role: "user" | "assistant"; content: string; ts: number }[];
  letterId?: string;
};

type State = {
  letters: Letter[];
  sessions: SageSession[];
  hydrated: boolean;

  writeLetter: (l: Omit<Letter, "id" | "ts" | "read" | "archived">) => string;
  markLetterRead: (id: string) => void;
  archiveLetter: (id: string) => void;
  startSession: (topic?: string) => string;
  appendMessage: (sessionId: string, role: "user" | "assistant", content: string) => void;
  endSession: (id: string, letterId?: string) => void;
  unreadLetterCount: () => number;

  _hydrate: () => void;
};

export const useLetters = create<State>()(
  persist(
    (set, get) => ({
      letters: [],
      sessions: [],
      hydrated: false,

      writeLetter: (l) => {
        const id = nanoid(8);
        set({ letters: [{ id, ts: Date.now(), read: false, archived: false, ...l }, ...get().letters].slice(0, 100) });
        return id;
      },
      markLetterRead: (id) => set({ letters: get().letters.map((l) => l.id === id ? { ...l, read: true } : l) }),
      archiveLetter: (id) => set({ letters: get().letters.map((l) => l.id === id ? { ...l, archived: true } : l) }),

      startSession: (topic) => {
        const id = nanoid(8);
        set({ sessions: [{ id, startedAt: Date.now(), topic, messages: [] }, ...get().sessions].slice(0, 40) });
        return id;
      },
      appendMessage: (sessionId, role, content) => {
        set({
          sessions: get().sessions.map((s) =>
            s.id === sessionId
              ? { ...s, messages: [...s.messages, { role, content, ts: Date.now() }] }
              : s
          ),
        });
      },
      endSession: (id, letterId) => {
        set({
          sessions: get().sessions.map((s) =>
            s.id === id ? { ...s, endedAt: Date.now(), letterId } : s
          ),
        });
      },

      unreadLetterCount: () => get().letters.filter((l) => !l.read && !l.archived).length,

      _hydrate: () => set({ hydrated: true }),
    }),
    {
      name: "sankofa-letters-v1",
      storage: createJSONStorage(() => (typeof window === "undefined" ? dummy : localStorage)),
      onRehydrateStorage: () => (state) => state?._hydrate(),
    },
  ),
);

const dummy = { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };
