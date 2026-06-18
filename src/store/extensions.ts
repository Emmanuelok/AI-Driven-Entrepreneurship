"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { nanoid } from "nanoid";

// Brainstorm
export type Sticky = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  color: "emerald" | "amber" | "rust" | "indigo" | "muted";
  category?: string;
};

export type Brainstorm = {
  id: string;
  title: string;
  prompt: string;
  stickies: Sticky[];
  createdAt: number;
  updatedAt: number;
};

// OKR
export type KeyResult = { id: string; text: string; target: number; current: number; unit: string };
export type Objective = { id: string; text: string; krs: KeyResult[]; quarter: string };

// Notebook
export type Note = { id: string; title: string; body: string; tags: string[]; pinned: boolean; createdAt: number; updatedAt: number };

// Pitches
export type Pitch = {
  id: string;
  title: string;
  ventureName: string;
  founderName: string;
  pitchText: string;
  videoUrl?: string;
  judgeScore?: { problem: number; solution: number; market: number; team: number; ask: number; overall: number; feedback: string };
  votes: number;
  submittedAt: number;
};

// Agent runs
export type AgentRun = {
  id: string;
  agentId: string;
  inputs: Record<string, string>;
  output: string;
  durationMs: number;
  createdAt: number;
};

// Cohorts (institutional)
export type CohortMember = { id: string; name: string; venture?: string; xp: number; level: number };
export type Cohort = {
  id: string;
  name: string;
  institution: string;
  startDate: string;
  endDate: string;
  members: CohortMember[];
  milestones: { id: string; title: string; due: string; status: "upcoming" | "in-progress" | "done" }[];
};

type State = {
  brainstorms: Brainstorm[];
  objectives: Objective[];
  notes: Note[];
  pitches: Pitch[];
  agentRuns: AgentRun[];
  cohorts: Cohort[];
  hydrated: boolean;

  createBrainstorm: (title: string, prompt: string) => string;
  updateBrainstorm: (id: string, patch: Partial<Brainstorm>) => void;
  addSticky: (brainstormId: string, sticky: Omit<Sticky, "id">) => void;
  updateSticky: (brainstormId: string, stickyId: string, patch: Partial<Sticky>) => void;
  removeSticky: (brainstormId: string, stickyId: string) => void;

  addObjective: (text: string, quarter: string) => string;
  updateObjective: (id: string, patch: Partial<Objective>) => void;
  removeObjective: (id: string) => void;
  addKR: (objId: string, kr: Omit<KeyResult, "id">) => void;
  updateKR: (objId: string, krId: string, patch: Partial<KeyResult>) => void;

  addNote: (title: string, body: string, tags?: string[]) => string;
  updateNote: (id: string, patch: Partial<Note>) => void;
  removeNote: (id: string) => void;

  submitPitch: (p: Omit<Pitch, "id" | "votes" | "submittedAt">) => string;
  votePitch: (id: string) => void;
  judgePitch: (id: string, judgeScore: Pitch["judgeScore"]) => void;

  logAgentRun: (agentId: string, inputs: Record<string, string>, output: string, durationMs: number) => void;

  seedCohort: () => void;
  _hydrate: () => void;
};

export const useExt = create<State>()(
  persist(
    (set, get) => ({
      brainstorms: [],
      objectives: [],
      notes: [],
      pitches: [],
      agentRuns: [],
      cohorts: [],
      hydrated: false,

      createBrainstorm: (title, prompt) => {
        const id = nanoid(8);
        set({ brainstorms: [...get().brainstorms, { id, title, prompt, stickies: [], createdAt: Date.now(), updatedAt: Date.now() }] });
        return id;
      },
      updateBrainstorm: (id, patch) => set({ brainstorms: get().brainstorms.map((b) => (b.id === id ? { ...b, ...patch, updatedAt: Date.now() } : b)) }),
      addSticky: (brainstormId, sticky) => {
        const b = get().brainstorms.find((x) => x.id === brainstormId);
        if (!b) return;
        get().updateBrainstorm(brainstormId, { stickies: [...b.stickies, { id: nanoid(6), ...sticky }] });
      },
      updateSticky: (brainstormId, stickyId, patch) => {
        const b = get().brainstorms.find((x) => x.id === brainstormId);
        if (!b) return;
        get().updateBrainstorm(brainstormId, { stickies: b.stickies.map((s) => (s.id === stickyId ? { ...s, ...patch } : s)) });
      },
      removeSticky: (brainstormId, stickyId) => {
        const b = get().brainstorms.find((x) => x.id === brainstormId);
        if (!b) return;
        get().updateBrainstorm(brainstormId, { stickies: b.stickies.filter((s) => s.id !== stickyId) });
      },

      addObjective: (text, quarter) => {
        const id = nanoid(8);
        set({ objectives: [...get().objectives, { id, text, quarter, krs: [] }] });
        return id;
      },
      updateObjective: (id, patch) => set({ objectives: get().objectives.map((o) => (o.id === id ? { ...o, ...patch } : o)) }),
      removeObjective: (id) => set({ objectives: get().objectives.filter((o) => o.id !== id) }),
      addKR: (objId, kr) => {
        const o = get().objectives.find((x) => x.id === objId);
        if (!o) return;
        get().updateObjective(objId, { krs: [...o.krs, { id: nanoid(6), ...kr }] });
      },
      updateKR: (objId, krId, patch) => {
        const o = get().objectives.find((x) => x.id === objId);
        if (!o) return;
        get().updateObjective(objId, { krs: o.krs.map((k) => (k.id === krId ? { ...k, ...patch } : k)) });
      },

      addNote: (title, body, tags = []) => {
        const id = nanoid(8);
        set({ notes: [{ id, title, body, tags, pinned: false, createdAt: Date.now(), updatedAt: Date.now() }, ...get().notes] });
        return id;
      },
      updateNote: (id, patch) => set({ notes: get().notes.map((n) => (n.id === id ? { ...n, ...patch, updatedAt: Date.now() } : n)) }),
      removeNote: (id) => set({ notes: get().notes.filter((n) => n.id !== id) }),

      submitPitch: (p) => {
        const id = nanoid(8);
        set({ pitches: [{ id, votes: 0, submittedAt: Date.now(), ...p }, ...get().pitches] });
        return id;
      },
      votePitch: (id) => set({ pitches: get().pitches.map((p) => (p.id === id ? { ...p, votes: p.votes + 1 } : p)) }),
      judgePitch: (id, judgeScore) => set({ pitches: get().pitches.map((p) => (p.id === id ? { ...p, judgeScore } : p)) }),

      logAgentRun: (agentId, inputs, output, durationMs) => {
        set({
          agentRuns: [{ id: nanoid(8), agentId, inputs, output, durationMs, createdAt: Date.now() }, ...get().agentRuns].slice(0, 100),
        });
      },

      seedCohort: () => {
        // Production: cohorts come from a real instructor account
        // creating one and inviting students by email. Removed the
        // demo "KNUST W24" seed so this surface is empty until a real
        // cohort is created.
      },

      _hydrate: () => set({ hydrated: true }),
    }),
    {
      name: "sankofa-ext-v1",
      storage: createJSONStorage(() => (typeof window === "undefined" ? dummyStorage : localStorage)),
      onRehydrateStorage: () => (state) => {
        state?._hydrate();
        state?.seedCohort();
      },
    },
  ),
);

const dummyStorage = { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };
