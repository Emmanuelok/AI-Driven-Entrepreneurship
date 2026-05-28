"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { nanoid } from "nanoid";

export type BuildVersion = {
  id: string;
  ts: number;
  code: string;
  note?: string; // what changed
  source: "human" | "ai" | "template";
};

export type BuildChatMessage = {
  id: string;
  ts: number;
  role: "user" | "assistant";
  content: string;
};

// ─── Eval harness ───────────────────────────────────────────────────────
export type EvalTest = {
  id: string;
  name?: string;
  input: string;          // user message sent to the agent
  rubric: string;         // what "passing" looks like, in natural language
  mustInclude?: string[]; // optional fast-pass: every substring must appear
};

export type EvalRun = {
  id: string;
  testId: string;
  ts: number;
  output: string;
  passed: boolean;
  score: number;          // 0..10
  reasoning: string;
  systemUsed: string;     // the system prompt at the time of run (for diffing)
};

export type EvalSuite = {
  systemPrompt: string;
  tests: EvalTest[];
  runs: EvalRun[];        // append-only history (latest first)
};

export type BuildProject = {
  id: string;
  name: string;
  description: string;
  templateId: string;
  code: string; // current code
  versions: BuildVersion[];
  chat: BuildChatMessage[];
  createdAt: number;
  updatedAt: number;
  deployedUrl?: string; // when a real deploy is wired
  eval?: EvalSuite;
};

type State = {
  projects: BuildProject[];
  hydrated: boolean;

  createProject: (name: string, description: string, templateId: string, code: string) => string;
  deleteProject: (id: string) => void;
  renameProject: (id: string, name: string) => void;
  updateCode: (id: string, code: string, note: string, source: BuildVersion["source"]) => void;
  revertTo: (id: string, versionId: string) => void;
  appendChat: (id: string, role: "user" | "assistant", content: string) => string;
  updateLastAssistant: (id: string, content: string) => void;
  setDeployedUrl: (id: string, url: string) => void;

  // eval harness
  setEvalSystem: (projectId: string, systemPrompt: string) => void;
  addEvalTest: (projectId: string, test: Omit<EvalTest, "id">) => string;
  updateEvalTest: (projectId: string, testId: string, patch: Partial<EvalTest>) => void;
  removeEvalTest: (projectId: string, testId: string) => void;
  appendEvalRun: (projectId: string, run: Omit<EvalRun, "id">) => void;

  _hydrate: () => void;
};

const MAX_VERSIONS = 30;

export const useBuild = create<State>()(
  persist(
    (set, get) => ({
      projects: [],
      hydrated: false,

      createProject: (name, description, templateId, code) => {
        const id = nanoid(8);
        const versionId = nanoid(6);
        const now = Date.now();
        set({
          projects: [
            {
              id, name, description, templateId, code,
              versions: [{ id: versionId, ts: now, code, source: "template", note: "Initial template" }],
              chat: [],
              createdAt: now, updatedAt: now,
            },
            ...get().projects,
          ],
        });
        return id;
      },

      deleteProject: (id) => set({ projects: get().projects.filter((p) => p.id !== id) }),
      renameProject: (id, name) => set({ projects: get().projects.map((p) => p.id === id ? { ...p, name, updatedAt: Date.now() } : p) }),

      updateCode: (id, code, note, source) => {
        const p = get().projects.find((x) => x.id === id);
        if (!p) return;
        const versionId = nanoid(6);
        const newVersions = [...p.versions, { id: versionId, ts: Date.now(), code, source, note }].slice(-MAX_VERSIONS);
        set({
          projects: get().projects.map((x) => x.id === id ? { ...x, code, versions: newVersions, updatedAt: Date.now() } : x),
        });
      },

      revertTo: (id, versionId) => {
        const p = get().projects.find((x) => x.id === id);
        const v = p?.versions.find((x) => x.id === versionId);
        if (!p || !v) return;
        get().updateCode(id, v.code, `Reverted to version ${versionId}`, "human");
      },

      appendChat: (id, role, content) => {
        const mid = nanoid(8);
        set({
          projects: get().projects.map((p) => p.id === id ? { ...p, chat: [...p.chat, { id: mid, ts: Date.now(), role, content }] } : p),
        });
        return mid;
      },

      updateLastAssistant: (id, content) => {
        set({
          projects: get().projects.map((p) => {
            if (p.id !== id) return p;
            const chat = p.chat.slice();
            for (let i = chat.length - 1; i >= 0; i--) {
              if (chat[i].role === "assistant") { chat[i] = { ...chat[i], content }; break; }
            }
            return { ...p, chat };
          }),
        });
      },

      setDeployedUrl: (id, url) => set({ projects: get().projects.map((p) => p.id === id ? { ...p, deployedUrl: url } : p) }),

      // ─── eval harness ───────────────────────────────────────────────
      setEvalSystem: (projectId, systemPrompt) => {
        set({
          projects: get().projects.map((p) => p.id === projectId ? {
            ...p,
            eval: { systemPrompt, tests: p.eval?.tests ?? [], runs: p.eval?.runs ?? [] },
            updatedAt: Date.now(),
          } : p),
        });
      },
      addEvalTest: (projectId, test) => {
        const tid = nanoid(6);
        set({
          projects: get().projects.map((p) => p.id === projectId ? {
            ...p,
            eval: {
              systemPrompt: p.eval?.systemPrompt ?? "",
              tests: [...(p.eval?.tests ?? []), { id: tid, ...test }],
              runs: p.eval?.runs ?? [],
            },
            updatedAt: Date.now(),
          } : p),
        });
        return tid;
      },
      updateEvalTest: (projectId, testId, patch) => {
        set({
          projects: get().projects.map((p) => p.id === projectId ? {
            ...p,
            eval: p.eval ? { ...p.eval, tests: p.eval.tests.map((t) => t.id === testId ? { ...t, ...patch } : t) } : p.eval,
            updatedAt: Date.now(),
          } : p),
        });
      },
      removeEvalTest: (projectId, testId) => {
        set({
          projects: get().projects.map((p) => p.id === projectId ? {
            ...p,
            eval: p.eval ? { ...p.eval, tests: p.eval.tests.filter((t) => t.id !== testId), runs: p.eval.runs.filter((r) => r.testId !== testId) } : p.eval,
            updatedAt: Date.now(),
          } : p),
        });
      },
      appendEvalRun: (projectId, run) => {
        const rid = nanoid(8);
        set({
          projects: get().projects.map((p) => p.id === projectId ? {
            ...p,
            eval: p.eval ? { ...p.eval, runs: [{ id: rid, ...run }, ...p.eval.runs].slice(0, 200) } : { systemPrompt: run.systemUsed, tests: [], runs: [{ id: rid, ...run }] },
            updatedAt: Date.now(),
          } : p),
        });
      },

      _hydrate: () => set({ hydrated: true }),
    }),
    {
      name: "sankofa-build-v1",
      storage: createJSONStorage(() => (typeof window === "undefined" ? dummy : localStorage)),
      onRehydrateStorage: () => (state) => state?._hydrate(),
    },
  ),
);

const dummy = { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };
