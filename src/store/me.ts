"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { nanoid } from "nanoid";
import { Genome, DEFAULT_GENOME } from "@/lib/genome";

// ============================================================
// The "Me" store — everything that makes the platform feel personal.
// Memory facts, goals, activity timeline, knowledge graph nodes,
// daily brief, usage analytics, focus sessions, voice notes.
// ============================================================

export type Memory = {
  id: string;
  fact: string;
  kind: "preference" | "context" | "challenge" | "achievement" | "goal" | "venture" | "person";
  source: "explicit" | "inferred" | "chat" | "system";
  importance: 1 | 2 | 3 | 4 | 5;
  createdAt: number;
  lastSeenAt: number;
};

export type Goal = {
  id: string;
  text: string;
  category: "learning" | "venture" | "personal" | "career";
  deadline?: string;
  status: "active" | "done" | "abandoned";
  checkins: { at: number; note: string; progress: number /* 0-1 */ }[];
  createdAt: number;
};

export type Activity = {
  id: string;
  ts: number;
  kind: "lesson" | "venture" | "agent" | "coach" | "review" | "interview" | "sketch" | "mentor" | "goal" | "system";
  title: string;
  href?: string;
  meta?: Record<string, string | number>;
};

export type Concept = {
  id: string;
  name: string;
  category: string;
  mastery: number; // 0-1
  touchedAt: number;
  reps: number;
  linkedTo: string[]; // concept ids
};

export type FocusSession = {
  id: string;
  ts: number;
  durationMin: number;
  task: string;
  completed: boolean;
};

export type VoiceNote = {
  id: string;
  ts: number;
  transcript: string;
  duration: number;
  tags: string[];
};

export type DailyBrief = {
  date: string; // YYYY-MM-DD
  morning: string;
  priorities: { id: string; text: string; estMin: number; done: boolean }[];
  generatedAt: number;
};

export type Insight = {
  id: string;
  ts: number;
  text: string;
  category: "pattern" | "celebration" | "nudge" | "warning";
};

export type ShippedArtifact = {
  id: string;
  ts: number;
  kind: "problem-brief" | "interview-script" | "loi" | "pricing-page" | "outreach-script" | "pitch-summary" | "landing-copy";
  title: string;
  body: string; // markdown or html
  ventureName?: string;
  ventureId?: string;
};

export type ShipSession = {
  id: string;
  startedAt: number;
  completedAt?: number;
  stage: "begin" | "wedge" | "persona" | "interview" | "slice" | "build" | "ship" | "reflect" | "done";
  wedge?: { problemId: string; problemTitle: string; whyMe: string };
  persona?: { name: string; role: string; location: string; pain: string };
  sliceText?: string;
  ventureName?: string;
  artifactsCreated: string[]; // ids
};

export type AppPref = {
  companionOpen: boolean;
  companionPosition: { x: number; y: number };
  recentRoutes: string[];
  routeFrequency: Record<string, number>;
  themeAccent: "emerald" | "amber" | "indigo" | "rust";
  focusModeActive: boolean;
};

type State = {
  memories: Memory[];
  goals: Goal[];
  activity: Activity[];
  concepts: Concept[];
  focusSessions: FocusSession[];
  voiceNotes: VoiceNote[];
  dailyBriefs: Record<string, DailyBrief>;
  insights: Insight[];
  prefs: AppPref;
  genome: Genome;
  artifacts: ShippedArtifact[];
  shipSession: ShipSession | null;
  hydrated: boolean;

  setGenome: (g: Genome) => void;
  shipArtifact: (a: Omit<ShippedArtifact, "id" | "ts">) => string;
  removeArtifact: (id: string) => void;
  startShipSession: () => string;
  updateShipSession: (patch: Partial<ShipSession>) => void;
  endShipSession: () => void;

  // memory
  remember: (m: Omit<Memory, "id" | "createdAt" | "lastSeenAt">) => string;
  forget: (id: string) => void;
  recall: (kinds?: Memory["kind"][]) => Memory[];

  // goals
  setGoal: (g: Omit<Goal, "id" | "checkins" | "createdAt" | "status">) => string;
  checkinGoal: (id: string, note: string, progress: number) => void;
  completeGoal: (id: string) => void;

  // activity
  logActivity: (a: Omit<Activity, "id" | "ts">) => void;
  recentActivity: (limit?: number) => Activity[];

  // concepts
  touchConcept: (name: string, category: string, masteryDelta?: number, linkedTo?: string[]) => void;

  // focus
  startFocus: (task: string, durationMin: number) => string;
  endFocus: (id: string, completed: boolean) => void;

  // voice
  addVoiceNote: (transcript: string, duration: number, tags?: string[]) => void;

  // brief
  setBrief: (b: DailyBrief) => void;
  todaysBrief: () => DailyBrief | undefined;
  markPriorityDone: (id: string) => void;

  // insights
  pushInsight: (i: Omit<Insight, "id" | "ts">) => void;

  // prefs
  toggleCompanion: () => void;
  setCompanionPos: (x: number, y: number) => void;
  trackRoute: (path: string) => void;
  setAccent: (a: AppPref["themeAccent"]) => void;
  setFocusMode: (active: boolean) => void;

  _hydrate: () => void;
};

const today = () => new Date().toISOString().slice(0, 10);

export const useMe = create<State>()(
  persist(
    (set, get) => ({
      memories: [],
      goals: [],
      activity: [],
      concepts: [],
      focusSessions: [],
      voiceNotes: [],
      dailyBriefs: {},
      insights: [],
      prefs: {
        companionOpen: false,
        companionPosition: { x: 0, y: 0 },
        recentRoutes: [],
        routeFrequency: {},
        themeAccent: "emerald",
        focusModeActive: false,
      },
      genome: DEFAULT_GENOME,
      artifacts: [],
      shipSession: null,
      hydrated: false,

      setGenome: (g) => set({ genome: g }),
      shipArtifact: (a) => {
        const id = nanoid(8);
        set({ artifacts: [{ id, ts: Date.now(), ...a }, ...get().artifacts] });
        get().logActivity({ kind: "venture", title: `Shipped: ${a.title}` });
        get().remember({ fact: `Shipped ${a.kind}: ${a.title}`, kind: "achievement", source: "system", importance: 4 });
        return id;
      },
      removeArtifact: (id) => set({ artifacts: get().artifacts.filter((a) => a.id !== id) }),
      startShipSession: () => {
        const id = nanoid(8);
        set({ shipSession: { id, startedAt: Date.now(), stage: "begin", artifactsCreated: [] } });
        get().logActivity({ kind: "venture", title: "Started Ship Hour" });
        return id;
      },
      updateShipSession: (patch) => {
        const s = get().shipSession;
        if (!s) return;
        set({ shipSession: { ...s, ...patch } });
      },
      endShipSession: () => {
        const s = get().shipSession;
        if (!s) return;
        set({ shipSession: { ...s, stage: "done", completedAt: Date.now() } });
        get().logActivity({ kind: "venture", title: "Completed Ship Hour" });
      },

      remember: (m) => {
        const existing = get().memories.find((x) => x.fact.toLowerCase() === m.fact.toLowerCase());
        if (existing) {
          set({ memories: get().memories.map((x) => x.id === existing.id ? { ...x, lastSeenAt: Date.now(), importance: Math.max(x.importance, m.importance) as 1 | 2 | 3 | 4 | 5 } : x) });
          return existing.id;
        }
        const id = nanoid(8);
        set({ memories: [{ id, createdAt: Date.now(), lastSeenAt: Date.now(), ...m }, ...get().memories].slice(0, 200) });
        return id;
      },
      forget: (id) => set({ memories: get().memories.filter((m) => m.id !== id) }),
      recall: (kinds) => {
        const all = get().memories.slice().sort((a, b) => b.importance - a.importance || b.lastSeenAt - a.lastSeenAt);
        return kinds ? all.filter((m) => kinds.includes(m.kind)) : all;
      },

      setGoal: (g) => {
        const id = nanoid(8);
        set({ goals: [{ id, status: "active", checkins: [], createdAt: Date.now(), ...g }, ...get().goals] });
        get().logActivity({ kind: "goal", title: `Set goal: ${g.text}` });
        return id;
      },
      checkinGoal: (id, note, progress) => {
        set({ goals: get().goals.map((g) => g.id === id ? { ...g, checkins: [...g.checkins, { at: Date.now(), note, progress }] } : g) });
        get().logActivity({ kind: "goal", title: `Goal check-in (${Math.round(progress * 100)}%)`, meta: { note } });
      },
      completeGoal: (id) => {
        set({ goals: get().goals.map((g) => g.id === id ? { ...g, status: "done" } : g) });
        get().logActivity({ kind: "goal", title: `Completed a goal` });
      },

      logActivity: (a) => {
        set({ activity: [{ id: nanoid(8), ts: Date.now(), ...a }, ...get().activity].slice(0, 500) });
      },
      recentActivity: (limit = 30) => get().activity.slice(0, limit),

      touchConcept: (name, category, masteryDelta = 0.1, linkedTo = []) => {
        const id = name.toLowerCase().replace(/\s+/g, "-");
        const existing = get().concepts.find((c) => c.id === id);
        if (existing) {
          const newMastery = Math.max(0, Math.min(1, existing.mastery + masteryDelta));
          const merged = Array.from(new Set([...existing.linkedTo, ...linkedTo]));
          set({ concepts: get().concepts.map((c) => c.id === id ? { ...c, mastery: newMastery, reps: c.reps + 1, touchedAt: Date.now(), linkedTo: merged } : c) });
        } else {
          set({ concepts: [{ id, name, category, mastery: masteryDelta, reps: 1, touchedAt: Date.now(), linkedTo }, ...get().concepts] });
        }
      },

      startFocus: (task, durationMin) => {
        const id = nanoid(8);
        set({ focusSessions: [{ id, ts: Date.now(), durationMin, task, completed: false }, ...get().focusSessions], prefs: { ...get().prefs, focusModeActive: true } });
        get().logActivity({ kind: "system", title: `Started focus session: ${task}` });
        return id;
      },
      endFocus: (id, completed) => {
        set({ focusSessions: get().focusSessions.map((f) => f.id === id ? { ...f, completed } : f), prefs: { ...get().prefs, focusModeActive: false } });
        get().logActivity({ kind: "system", title: `Focus session ${completed ? "completed" : "interrupted"}` });
      },

      addVoiceNote: (transcript, duration, tags = []) => {
        set({ voiceNotes: [{ id: nanoid(8), ts: Date.now(), transcript, duration, tags }, ...get().voiceNotes].slice(0, 50) });
        get().logActivity({ kind: "system", title: `Voice note (${duration}s)` });
      },

      setBrief: (b) => set({ dailyBriefs: { ...get().dailyBriefs, [b.date]: b } }),
      todaysBrief: () => get().dailyBriefs[today()],
      markPriorityDone: (id) => {
        const t = today();
        const brief = get().dailyBriefs[t];
        if (!brief) return;
        set({ dailyBriefs: { ...get().dailyBriefs, [t]: { ...brief, priorities: brief.priorities.map((p) => p.id === id ? { ...p, done: true } : p) } } });
      },

      pushInsight: (i) => set({ insights: [{ id: nanoid(8), ts: Date.now(), ...i }, ...get().insights].slice(0, 40) }),

      toggleCompanion: () => set({ prefs: { ...get().prefs, companionOpen: !get().prefs.companionOpen } }),
      setCompanionPos: (x, y) => set({ prefs: { ...get().prefs, companionPosition: { x, y } } }),
      trackRoute: (path) => {
        const recent = [path, ...get().prefs.recentRoutes.filter((r) => r !== path)].slice(0, 20);
        const freq = { ...get().prefs.routeFrequency, [path]: (get().prefs.routeFrequency[path] ?? 0) + 1 };
        set({ prefs: { ...get().prefs, recentRoutes: recent, routeFrequency: freq } });
      },
      setAccent: (a) => set({ prefs: { ...get().prefs, themeAccent: a } }),
      setFocusMode: (active) => set({ prefs: { ...get().prefs, focusModeActive: active } }),

      _hydrate: () => set({ hydrated: true }),
    }),
    {
      name: "sankofa-me-v1",
      storage: createJSONStorage(() => (typeof window === "undefined" ? dummy : localStorage)),
      onRehydrateStorage: () => (state) => state?._hydrate(),
    },
  ),
);

const dummy = { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };
