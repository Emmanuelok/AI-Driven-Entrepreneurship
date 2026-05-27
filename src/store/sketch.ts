"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { nanoid } from "nanoid";

export type Tool = "select" | "pan" | "pen" | "eraser" | "rect" | "ellipse" | "line" | "arrow" | "text" | "sticky" | "frame";

export type StickyEl = { id: string; kind: "sticky"; x: number; y: number; w: number; h: number; text: string; color: string; rotation?: number };
export type PenStrokeEl = { id: string; kind: "pen"; points: [number, number][]; color: string; width: number };
export type RectEl = { id: string; kind: "rect"; x: number; y: number; w: number; h: number; color: string; fillOpacity: number; strokeWidth: number };
export type EllipseEl = { id: string; kind: "ellipse"; x: number; y: number; w: number; h: number; color: string; fillOpacity: number; strokeWidth: number };
export type LineEl = { id: string; kind: "line"; x1: number; y1: number; x2: number; y2: number; color: string; width: number };
export type ArrowEl = { id: string; kind: "arrow"; x1: number; y1: number; x2: number; y2: number; color: string; width: number };
export type TextEl = { id: string; kind: "text"; x: number; y: number; text: string; color: string; size: number };
export type FrameEl = { id: string; kind: "frame"; x: number; y: number; w: number; h: number; label: string; color: string };

export type Element = StickyEl | PenStrokeEl | RectEl | EllipseEl | LineEl | ArrowEl | TextEl | FrameEl;

export type SketchBoard = {
  id: string;
  title: string;
  prompt: string;
  elements: Element[];
  history: Element[][];
  historyIdx: number;
  viewX: number;
  viewY: number;
  zoom: number;
  createdAt: number;
  updatedAt: number;
};

type State = {
  boards: SketchBoard[];
  hydrated: boolean;

  createBoard: (title: string, prompt: string) => string;
  deleteBoard: (id: string) => void;
  updateBoardMeta: (id: string, patch: Partial<SketchBoard>) => void;

  addElement: (boardId: string, el: { kind: Element["kind"] } & Record<string, unknown>) => string;
  updateElement: (boardId: string, elId: string, patch: Partial<Element>) => void;
  removeElement: (boardId: string, elId: string) => void;
  setElements: (boardId: string, els: Element[]) => void;

  pushHistory: (boardId: string) => void;
  undo: (boardId: string) => void;
  redo: (boardId: string) => void;

  setView: (boardId: string, viewX: number, viewY: number, zoom: number) => void;

  _hydrate: () => void;
};

export const useSketch = create<State>()(
  persist(
    (set, get) => ({
      boards: [],
      hydrated: false,

      createBoard: (title, prompt) => {
        const id = nanoid(8);
        const board: SketchBoard = {
          id, title, prompt, elements: [], history: [[]], historyIdx: 0,
          viewX: 0, viewY: 0, zoom: 1, createdAt: Date.now(), updatedAt: Date.now(),
        };
        set({ boards: [...get().boards, board] });
        return id;
      },

      deleteBoard: (id) => set({ boards: get().boards.filter((b) => b.id !== id) }),
      updateBoardMeta: (id, patch) => set({ boards: get().boards.map((b) => b.id === id ? { ...b, ...patch, updatedAt: Date.now() } : b) }),

      addElement: (boardId, el) => {
        const id = nanoid(8);
        const board = get().boards.find((b) => b.id === boardId);
        if (!board) return id;
        const newEl = { ...(el as object), id } as Element;
        const next = [...board.elements, newEl];
        set({ boards: get().boards.map((b) => b.id === boardId ? { ...b, elements: next, updatedAt: Date.now() } : b) });
        return id;
      },

      updateElement: (boardId, elId, patch) => {
        const board = get().boards.find((b) => b.id === boardId);
        if (!board) return;
        const next = board.elements.map((e) => e.id === elId ? { ...e, ...patch } as Element : e);
        set({ boards: get().boards.map((b) => b.id === boardId ? { ...b, elements: next, updatedAt: Date.now() } : b) });
      },

      removeElement: (boardId, elId) => {
        const board = get().boards.find((b) => b.id === boardId);
        if (!board) return;
        set({ boards: get().boards.map((b) => b.id === boardId ? { ...b, elements: board.elements.filter((e) => e.id !== elId), updatedAt: Date.now() } : b) });
      },

      setElements: (boardId, els) => {
        set({ boards: get().boards.map((b) => b.id === boardId ? { ...b, elements: els, updatedAt: Date.now() } : b) });
      },

      pushHistory: (boardId) => {
        const board = get().boards.find((b) => b.id === boardId);
        if (!board) return;
        const newHistory = board.history.slice(0, board.historyIdx + 1).concat([board.elements]);
        const trimmed = newHistory.slice(-50);
        set({ boards: get().boards.map((b) => b.id === boardId ? { ...b, history: trimmed, historyIdx: trimmed.length - 1 } : b) });
      },

      undo: (boardId) => {
        const board = get().boards.find((b) => b.id === boardId);
        if (!board || board.historyIdx <= 0) return;
        const newIdx = board.historyIdx - 1;
        set({ boards: get().boards.map((b) => b.id === boardId ? { ...b, elements: board.history[newIdx], historyIdx: newIdx } : b) });
      },

      redo: (boardId) => {
        const board = get().boards.find((b) => b.id === boardId);
        if (!board || board.historyIdx >= board.history.length - 1) return;
        const newIdx = board.historyIdx + 1;
        set({ boards: get().boards.map((b) => b.id === boardId ? { ...b, elements: board.history[newIdx], historyIdx: newIdx } : b) });
      },

      setView: (boardId, viewX, viewY, zoom) => {
        set({ boards: get().boards.map((b) => b.id === boardId ? { ...b, viewX, viewY, zoom } : b) });
      },

      _hydrate: () => set({ hydrated: true }),
    }),
    {
      name: "sankofa-sketch-v1",
      storage: createJSONStorage(() => (typeof window === "undefined" ? dummy : localStorage)),
      onRehydrateStorage: () => (state) => state?._hydrate(),
    },
  ),
);

const dummy = { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };
