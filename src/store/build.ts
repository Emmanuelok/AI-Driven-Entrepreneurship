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
