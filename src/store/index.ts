"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { nanoid } from "nanoid";

// ---------- types ----------
export type User = {
  id: string;
  name: string;
  email: string;
  institution: string;
  program: string;
  year: 1 | 2 | 3 | 4 | 5;
  country: string;
  primaryLanguage: string;
  field: string;
  joinedAt: number;
};

export type LessonProgress = {
  lessonId: string;
  trackId: string;
  status: "not-started" | "in-progress" | "completed";
  scorePct?: number;
  completedAt?: number;
  attempts: number;
};

export type Card = {
  id: string;
  deckId: string;
  front: string;
  back: string;
  // SM-2 state
  ease: number; // 1.3..2.5+
  interval: number; // days
  reps: number;
  due: number; // unix ms
};

export type Deck = { id: string; name: string; description: string };

export type Interview = {
  id: string;
  name: string;
  role: string;
  date: string;
  notes: string;
  verdict: "validated" | "insight" | "rejected";
  willingnessToPay?: number;
};

export type Venture = {
  id: string;
  name: string;
  tagline: string;
  problemId?: string;
  phase: "ideate" | "discover" | "mvp" | "launch" | "scale";
  createdAt: number;
  startedDayCount?: number;
  region: string;
  interviews: Interview[];
  canvas: Record<string, string>;
  mvpTasks: { id: string; title: string; done: boolean; due?: string }[];
  metrics: {
    interviewsTarget: number;
    revenue: number;
    customers: number;
    mrr: number;
  };
  team: { name: string; role: string }[];
  pitchDeck?: { id: string; title: string; slides: { title: string; body: string }[] };
  fundingRaised: number;
  fundingTarget: number;
  achievements: string[];
};

export type Notification = {
  id: string;
  title: string;
  body: string;
  ts: number;
  read: boolean;
  href?: string;
};

export type Booking = {
  id: string;
  mentorId: string;
  mentorName: string;
  date: string;
  topic: string;
  status: "scheduled" | "completed" | "cancelled";
};

// ---------- main store ----------
type Store = {
  user: User | null;
  hydrated: boolean;
  xp: number;
  streak: number;
  lastActiveDay: string | null;
  progress: Record<string, LessonProgress>;
  decks: Deck[];
  cards: Card[];
  ventures: Venture[];
  bookings: Booking[];
  notifications: Notification[];
  unlockedBadges: string[];
  preferences: { theme: "dark"; language: string; reduceMotion: boolean };

  // user
  signIn: (u: Omit<User, "id" | "joinedAt"> & { id?: string }) => void;
  signOut: () => void;
  updateUser: (patch: Partial<User>) => void;

  // xp + streak
  addXp: (amount: number, reason?: string) => void;
  tickStreak: () => void;

  // lessons
  startLesson: (trackId: string, lessonId: string) => void;
  completeLesson: (trackId: string, lessonId: string, scorePct: number) => void;

  // srs
  addDeck: (d: Omit<Deck, "id">) => string;
  addCard: (c: Omit<Card, "id" | "ease" | "interval" | "reps" | "due">) => void;
  reviewCard: (id: string, quality: 0 | 1 | 2 | 3 | 4 | 5) => void;
  dueCards: () => Card[];

  // ventures
  createVenture: (v: Omit<Venture, "id" | "createdAt" | "interviews" | "canvas" | "mvpTasks" | "metrics" | "team" | "fundingRaised" | "fundingTarget" | "achievements"> & Partial<Venture>) => string;
  updateVenture: (id: string, patch: Partial<Venture>) => void;
  addInterview: (ventureId: string, iv: Omit<Interview, "id">) => void;
  toggleMvpTask: (ventureId: string, taskId: string) => void;
  addMvpTask: (ventureId: string, title: string, due?: string) => void;

  // bookings
  bookMentor: (mentorId: string, mentorName: string, date: string, topic: string) => void;

  // notifications
  notify: (n: Omit<Notification, "id" | "ts" | "read">) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;

  // badges
  unlockBadge: (id: string) => void;

  // hydration helper
  _hydrate: () => void;
};

const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      user: null,
      hydrated: false,
      xp: 0,
      streak: 0,
      lastActiveDay: null,
      progress: {},
      decks: [],
      cards: [],
      ventures: [],
      bookings: [],
      notifications: [],
      unlockedBadges: [],
      preferences: { theme: "dark", language: "English", reduceMotion: false },

      signIn: (u) =>
        set({
          user: {
            id: u.id ?? nanoid(8),
            name: u.name,
            email: u.email,
            institution: u.institution,
            program: u.program,
            year: u.year,
            country: u.country,
            primaryLanguage: u.primaryLanguage,
            field: u.field,
            joinedAt: Date.now(),
          },
        }),

      signOut: () => set({ user: null }),

      updateUser: (patch) => {
        const u = get().user;
        if (!u) return;
        set({ user: { ...u, ...patch } });
      },

      addXp: (amount, reason) => {
        const s = get();
        const newXp = s.xp + amount;
        set({ xp: newXp });
        if (reason) {
          get().notify({ title: `+${amount} XP`, body: reason });
        }
        // milestone badges
        const level = Math.floor(newXp / 800) + 1;
        if (Math.floor(s.xp / 800) + 1 < level) {
          get().notify({ title: `Level ${level}!`, body: `You reached level ${level}. New tools unlocked.` });
          get().unlockBadge(`level-${level}`);
        }
      },

      tickStreak: () => {
        const s = get();
        const today = dayKey();
        if (s.lastActiveDay === today) return;
        const yesterday = dayKey(new Date(Date.now() - 86_400_000));
        const newStreak = s.lastActiveDay === yesterday ? s.streak + 1 : 1;
        set({ streak: newStreak, lastActiveDay: today });
      },

      startLesson: (trackId, lessonId) => {
        const key = `${trackId}/${lessonId}`;
        const cur = get().progress[key];
        if (cur?.status === "completed") return;
        set({
          progress: {
            ...get().progress,
            [key]: { lessonId, trackId, status: "in-progress", attempts: (cur?.attempts ?? 0) + 1 },
          },
        });
      },

      completeLesson: (trackId, lessonId, scorePct) => {
        const key = `${trackId}/${lessonId}`;
        const cur = get().progress[key];
        set({
          progress: {
            ...get().progress,
            [key]: {
              lessonId,
              trackId,
              status: "completed",
              scorePct,
              completedAt: Date.now(),
              attempts: cur?.attempts ?? 1,
            },
          },
        });
        get().addXp(40 + Math.round(scorePct * 0.6), `Completed lesson · ${Math.round(scorePct)}%`);
        get().tickStreak();
      },

      addDeck: (d) => {
        const id = nanoid(8);
        set({ decks: [...get().decks, { id, ...d }] });
        return id;
      },

      addCard: (c) => {
        const card: Card = {
          id: nanoid(10),
          deckId: c.deckId,
          front: c.front,
          back: c.back,
          ease: 2.5,
          interval: 0,
          reps: 0,
          due: Date.now(),
        };
        set({ cards: [...get().cards, card] });
      },

      reviewCard: (id, quality) => {
        const cards = get().cards.slice();
        const idx = cards.findIndex((c) => c.id === id);
        if (idx === -1) return;
        const c = { ...cards[idx] };
        // SM-2
        if (quality < 3) {
          c.reps = 0;
          c.interval = 1;
        } else {
          c.reps += 1;
          if (c.reps === 1) c.interval = 1;
          else if (c.reps === 2) c.interval = 6;
          else c.interval = Math.round(c.interval * c.ease);
          c.ease = Math.max(1.3, c.ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));
        }
        c.due = Date.now() + c.interval * 86_400_000;
        cards[idx] = c;
        set({ cards });
        get().addXp(quality >= 3 ? 6 : 2);
        get().tickStreak();
      },

      dueCards: () => {
        const now = Date.now();
        return get().cards.filter((c) => c.due <= now);
      },

      createVenture: (v) => {
        const id = nanoid(8);
        const venture: Venture = {
          id,
          name: v.name,
          tagline: v.tagline ?? "",
          problemId: v.problemId,
          phase: v.phase ?? "ideate",
          createdAt: Date.now(),
          region: v.region ?? "",
          interviews: v.interviews ?? [],
          canvas: v.canvas ?? {},
          mvpTasks: v.mvpTasks ?? [],
          metrics: v.metrics ?? { interviewsTarget: 20, revenue: 0, customers: 0, mrr: 0 },
          team: v.team ?? [],
          pitchDeck: v.pitchDeck,
          fundingRaised: v.fundingRaised ?? 0,
          fundingTarget: v.fundingTarget ?? 50_000,
          achievements: v.achievements ?? [],
        };
        set({ ventures: [...get().ventures, venture] });
        get().addXp(80, `Launched venture: ${venture.name}`);
        return id;
      },

      updateVenture: (id, patch) => {
        set({
          ventures: get().ventures.map((v) => (v.id === id ? { ...v, ...patch } : v)),
        });
      },

      addInterview: (ventureId, iv) => {
        const venture = get().ventures.find((v) => v.id === ventureId);
        if (!venture) return;
        const next = { ...venture, interviews: [...venture.interviews, { id: nanoid(8), ...iv }] };
        get().updateVenture(ventureId, next);
        get().addXp(30, "Logged a customer interview");
      },

      toggleMvpTask: (ventureId, taskId) => {
        const v = get().ventures.find((x) => x.id === ventureId);
        if (!v) return;
        const updated = v.mvpTasks.map((t) => (t.id === taskId ? { ...t, done: !t.done } : t));
        get().updateVenture(ventureId, { mvpTasks: updated });
        if (updated.find((t) => t.id === taskId)?.done) {
          get().addXp(15, "Shipped MVP task");
        }
      },

      addMvpTask: (ventureId, title, due) => {
        const v = get().ventures.find((x) => x.id === ventureId);
        if (!v) return;
        get().updateVenture(ventureId, {
          mvpTasks: [...v.mvpTasks, { id: nanoid(6), title, done: false, due }],
        });
      },

      bookMentor: (mentorId, mentorName, date, topic) => {
        set({
          bookings: [
            ...get().bookings,
            { id: nanoid(8), mentorId, mentorName, date, topic, status: "scheduled" },
          ],
        });
        get().notify({ title: "Mentor session booked", body: `${mentorName} · ${date}` });
        get().addXp(20, "Booked a mentor session");
      },

      notify: (n) =>
        set({
          notifications: [
            { id: nanoid(8), ts: Date.now(), read: false, ...n },
            ...get().notifications,
          ].slice(0, 50),
        }),

      markRead: (id) =>
        set({ notifications: get().notifications.map((n) => (n.id === id ? { ...n, read: true } : n)) }),

      markAllRead: () =>
        set({ notifications: get().notifications.map((n) => ({ ...n, read: true })) }),

      unlockBadge: (id) => {
        if (get().unlockedBadges.includes(id)) return;
        set({ unlockedBadges: [...get().unlockedBadges, id] });
      },

      _hydrate: () => set({ hydrated: true }),
    }),
    {
      name: "sankofa-v1",
      storage: createJSONStorage(() => (typeof window === "undefined" ? dummyStorage : localStorage)),
      onRehydrateStorage: () => (state) => {
        state?._hydrate();
      },
    },
  ),
);

const dummyStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

// derived
export const level = (xp: number) => Math.floor(xp / 800) + 1;
export const xpInLevel = (xp: number) => xp % 800;
export const xpToNextLevel = () => 800;
