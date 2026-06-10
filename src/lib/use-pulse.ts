"use client";

import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/store";
import { useMe } from "@/store/me";
import { getRecommendations } from "@/lib/recommendations";
import { computePulse, type Pulse, type PulseInput } from "@/lib/pulse-engine";

type StoreState = ReturnType<typeof useStore.getState>;
type MeState = ReturnType<typeof useMe.getState>;

// Project the two stores into the engine's input shape. Shared by the
// live hook below and the Site Brain snapshot builder, so the dashboard
// and every AI call read the exact same pulse.
export function pulseInputFromStores(s: StoreState, me: MeState, now: number): PulseInput | null {
  if (!s.user) return null;

  const rec = getRecommendations(s.user.field);

  // A venture's lastTouchedAt is the newest activity entry that names
  // it — the timeline is our only cross-feature touch record. Falls
  // back to createdAt so brand-new ventures don't read as abandoned.
  const ventures: PulseInput["ventures"] = s.ventures.map((v) => {
    const nameLower = v.name.toLowerCase();
    let lastTouchedAt = v.createdAt;
    for (const a of me.activity) {
      if (a.ts > lastTouchedAt && a.title.toLowerCase().includes(nameLower)) lastTouchedAt = a.ts;
    }
    return {
      id: v.id,
      name: v.name,
      phase: v.phase,
      interviews: v.interviews.length,
      interviewsTarget: v.metrics.interviewsTarget,
      mvpDone: v.mvpTasks.filter((t) => t.done).length,
      mvpTotal: v.mvpTasks.length,
      mrr: v.metrics.mrr,
      lastTouchedAt,
    };
  });

  return {
    now,
    name: s.user.name,
    field: s.user.field,
    streak: s.streak,
    xp: s.xp,
    dueCardCount: s.dueCards().length,
    ventures,
    goals: me.goals.map((g) => ({
      id: g.id,
      text: g.text,
      status: g.status,
      lastCheckinAt: g.checkins.at(-1)?.at,
      progress: g.checkins.at(-1)?.progress,
    })),
    activity: me.activity.map((a) => ({ ts: a.ts, kind: a.kind, title: a.title })),
    genome: me.genome,
    focusSessions: me.focusSessions.map((f) => ({ ts: f.ts, durationMin: f.durationMin, completed: f.completed })),
    artifactsCount: me.artifacts.length,
    shipSessionStage: me.shipSession?.stage ?? null,
    topProblem: rec.problems[0] ? { id: rec.problems[0].id, title: rec.problems[0].title } : null,
    suggestedVentureSeed: rec.department?.suggestedVentureSeed ?? null,
  };
}

// The live half of the Pulse Engine. Recomputes whenever any feeding
// store slice changes, plus a 60s heartbeat so time-derived numbers
// (staleness, momentum decay, daypart) stay honest during a long
// session without any user interaction.
export function usePulse(): Pulse | null {
  const store = useStore();
  const me = useMe();

  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now()); // client-only: avoids SSR/CSR time mismatch
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  return useMemo(() => {
    if (now === null) return null;
    const input = pulseInputFromStores(store, me, now);
    return input ? computePulse(input) : null;
  }, [store, me, now]);
}
