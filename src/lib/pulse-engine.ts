// ─────────────────────────────────────────────────────────────────────────
// The Pulse Engine — Sankofa's live personal intelligence core.
//
// Everything the platform knows about a user (activity, ventures, goals,
// genome, focus history, spaced repetition debt) is distilled into one
// deterministic, client-side "pulse": momentum, venture health, learning
// velocity, and a ranked queue of next-best-actions, each with a personal
// "because…" reason.
//
// Design constraints:
//   - Pure functions. No store imports, no React, no network. The inputs
//     are plain data so this file is trivially unit-testable and the
//     same pulse can be computed on any surface (dashboard, companion,
//     Sage's system prompt).
//   - Deterministic for a fixed `now`. Live-ness comes from the caller
//     re-invoking on a timer / store change (see use-pulse.ts).
//   - Genome-modulated: the same facts produce different rankings and
//     different language for different people. That's the point.
// ─────────────────────────────────────────────────────────────────────────

import type { Genome } from "@/lib/genome";

const DAY = 86_400_000;

// ── Input shape ─────────────────────────────────────────────────────────
// Narrow projections of the stores — callers map their slices into this.
export type PulseVentureInput = {
  id: string;
  name: string;
  phase: string;
  interviews: number;
  interviewsTarget: number;
  mvpDone: number;
  mvpTotal: number;
  mrr: number;
  lastTouchedAt?: number; // most recent activity touching this venture
};

export type PulseGoalInput = {
  id: string;
  text: string;
  status: "active" | "done" | "abandoned";
  lastCheckinAt?: number;
  progress?: number; // 0..1, latest check-in
};

export type PulseInput = {
  now: number;
  name: string;
  field?: string;
  streak: number;
  xp: number;
  dueCardCount: number;
  ventures: PulseVentureInput[];
  goals: PulseGoalInput[];
  activity: { ts: number; kind: string; title: string }[];
  genome: Genome;
  focusSessions: { ts: number; durationMin: number; completed: boolean }[];
  artifactsCount: number;
  shipSessionStage?: string | null; // in-flight Ship Hour stage, if any
  topProblem?: { id: string; title: string } | null;
  suggestedVentureSeed?: string | null; // from the user's discipline
};

// ── Output shape ────────────────────────────────────────────────────────
export type PulseAction = {
  id: string;
  title: string;
  reason: string; // the personal "because…" — always references THEIR data
  href: string;
  estMin: number;
  kind: "review" | "venture" | "learn" | "goal" | "ship" | "focus" | "build" | "discipline";
  score: number;
};

export type VentureHealth = {
  ventureId: string;
  name: string;
  phase: string;
  score: number; // 0..100
  staleDays: number;
  drivers: string[]; // human-readable contributors, best-first
};

export type Pulse = {
  momentum: number; // 0..100
  momentumTrend: "rising" | "steady" | "cooling";
  learningVelocity: number; // 0..100
  focusMinutes7d: number;
  ventureHealth: VentureHealth[];
  actions: PulseAction[];
  headline: string;
  subline: string;
  daypart: "morning" | "afternoon" | "evening" | "night";
};

// ── Momentum ────────────────────────────────────────────────────────────
// Exponential-decay sum over the last 14 days of activity: an event today
// counts ~1.0, three days ago ~0.42, a week ago ~0.13. The raw sum is
// squashed to 0..100 so ~8 recent events ≈ 70 and it saturates gently.
export function computeMomentum(activity: { ts: number }[], now: number, streak: number): number {
  let raw = 0;
  for (const a of activity) {
    const ageDays = (now - a.ts) / DAY;
    if (ageDays < 0 || ageDays > 14) continue;
    raw += Math.exp(-ageDays / 3.5);
  }
  // Streak is sustained behaviour — worth more than any single burst.
  raw += Math.min(streak, 14) * 0.35;
  return Math.round(100 * (1 - Math.exp(-raw / 6)));
}

export function computeMomentumTrend(activity: { ts: number }[], now: number): Pulse["momentumTrend"] {
  const recent = activity.filter((a) => now - a.ts < 3 * DAY).length;
  // Per-day rate comparison so the windows are commensurate.
  const prior = activity.filter((a) => now - a.ts >= 3 * DAY && now - a.ts < 10 * DAY).length / (7 / 3);
  if (recent > prior * 1.25) return "rising";
  if (recent < prior * 0.6) return "cooling";
  return "steady";
}

// ── Venture health ──────────────────────────────────────────────────────
// 0..100 from phase-appropriate progress minus a staleness penalty.
// Honest by design: an untouched venture decays visibly.
export function computeVentureHealth(v: PulseVentureInput, now: number): VentureHealth {
  const staleDays = v.lastTouchedAt ? Math.max(0, Math.floor((now - v.lastTouchedAt) / DAY)) : 99;
  const drivers: string[] = [];

  let score = 40; // baseline: it exists, it's named, it's real
  if (v.interviewsTarget > 0) {
    const p = Math.min(1, v.interviews / v.interviewsTarget);
    score += p * 25;
    drivers.push(`Interviews ${v.interviews}/${v.interviewsTarget}`);
  }
  if (v.mvpTotal > 0) {
    const p = v.mvpDone / v.mvpTotal;
    score += p * 20;
    drivers.push(`MVP ${v.mvpDone}/${v.mvpTotal} tasks`);
  }
  if (v.mrr > 0) {
    score += 15;
    drivers.push(`$${v.mrr} MRR — real money`);
  }
  const penalty = Math.min(35, Math.max(0, staleDays - 2) * 4);
  if (penalty > 0) drivers.push(staleDays >= 99 ? "Never touched" : `Quiet for ${staleDays} day${staleDays === 1 ? "" : "s"}`);
  score = Math.round(Math.max(0, Math.min(100, score - penalty)));

  return { ventureId: v.id, name: v.name, phase: v.phase, score, staleDays, drivers };
}

// ── Learning velocity ───────────────────────────────────────────────────
// Lesson/review/sketch events in the last 7 days, squashed to 0..100.
export function computeLearningVelocity(activity: { ts: number; kind: string }[], now: number): number {
  const learnKinds = new Set(["lesson", "review", "sketch", "coach"]);
  const n = activity.filter((a) => learnKinds.has(a.kind) && now - a.ts < 7 * DAY).length;
  return Math.round(100 * (1 - Math.exp(-n / 4)));
}

// ── Next-best-actions ───────────────────────────────────────────────────
// Generate candidates from every live signal, score them, tilt scores by
// genome, and return the top few. Reasons always cite the user's own data.
export function computeActions(input: PulseInput): PulseAction[] {
  const { now, genome, streak } = input;
  const t = genome.traits;
  const out: PulseAction[] = [];

  // Resume an in-flight Ship Hour — almost always the highest-leverage move.
  if (input.shipSessionStage && input.shipSessionStage !== "done") {
    out.push({
      id: "resume-ship",
      title: `Resume Ship Hour — you're at "${input.shipSessionStage}"`,
      reason: "You already started. Finishing beats restarting, every time.",
      href: "/studio/ship",
      estMin: 25,
      kind: "ship",
      score: 95 + t.kinesthetic * 10,
    });
  }

  // SRS debt.
  if (input.dueCardCount > 0) {
    const fearLine =
      genome.primaryFear === "wasting-time"
        ? `${input.dueCardCount} cards, ~${Math.max(2, Math.ceil(input.dueCardCount / 3))} minutes — the cheapest win on this page.`
        : streak > 0
          ? `Clearing them keeps your ${streak}-day streak honest.`
          : "Reviews due today stick; reviews due yesterday don't.";
    out.push({
      id: "clear-cards",
      title: `Clear ${input.dueCardCount} review card${input.dueCardCount === 1 ? "" : "s"}`,
      reason: fearLine,
      href: "/studio/srs",
      estMin: Math.max(2, Math.ceil(input.dueCardCount / 3)),
      kind: "review",
      score: 55 + Math.min(20, input.dueCardCount) + t.depth * 10,
    });
  }

  // Stale ventures — phase-aware nudge.
  for (const v of input.ventures) {
    const h = computeVentureHealth(v, now);
    if (h.staleDays >= 4 && h.staleDays < 99) {
      const move =
        v.phase === "ideate" || v.phase === "discover"
          ? v.interviews < v.interviewsTarget
            ? `book one interview (${v.interviews}/${v.interviewsTarget} done)`
            : "distill what your interviews told you"
          : v.mvpTotal > 0 && v.mvpDone < v.mvpTotal
            ? `close one MVP task (${v.mvpDone}/${v.mvpTotal})`
            : "write this week's update";
      out.push({
        id: `touch-${v.id}`,
        title: `Touch ${v.name}: ${move}`,
        reason: `${h.staleDays} days quiet. ${v.phase} ventures die silently, not loudly.`,
        href: `/studio/venture/${v.id}`,
        estMin: 20,
        kind: "venture",
        score: 60 + Math.min(20, h.staleDays * 2) + t.boldness * 8,
      });
    }
  }

  // Goals without recent check-ins.
  for (const g of input.goals) {
    if (g.status !== "active") continue;
    const sinceCheckin = g.lastCheckinAt ? (now - g.lastCheckinAt) / DAY : 99;
    if (sinceCheckin >= 7) {
      out.push({
        id: `goal-${g.id}`,
        title: `Check in on "${truncate(g.text, 44)}"`,
        reason:
          g.progress !== undefined
            ? `Last time you were at ${Math.round((g.progress ?? 0) * 100)}%. A 2-minute check-in keeps it from drifting.`
            : "You set this for a reason. Thirty honest seconds is enough.",
        href: "/studio/me",
        estMin: 2,
        kind: "goal",
        score: 40 + t.structure * 20,
      });
    }
  }

  // No ventures at all → the discipline-seeded first step.
  if (input.ventures.length === 0) {
    out.push({
      id: "first-venture",
      title: "Begin Ship Hour — your first real artifact",
      reason: input.suggestedVentureSeed
        ? `For ${input.field ?? "your field"}: ${truncate(input.suggestedVentureSeed, 90)}`
        : "Sixty minutes from now you'll have shipped something a real person can say yes to.",
      href: "/studio/ship",
      estMin: 60,
      kind: "ship",
      score: 70 + t.kinesthetic * 15 + t.boldness * 5,
    });
  }

  // Discipline problem pull.
  if (input.topProblem) {
    out.push({
      id: "top-problem",
      title: `Go deeper on "${truncate(input.topProblem.title, 48)}"`,
      reason: "Your discipline keeps pointing back to this problem. That gravity is data.",
      href: `/studio/problems/${input.topProblem.id}`,
      estMin: 10,
      kind: "discipline",
      score: 45 + t.depth * 15,
    });
  }

  // Learning lull → one lesson.
  const lv = computeLearningVelocity(input.activity, now);
  if (lv < 25 && input.dueCardCount === 0) {
    out.push({
      id: "one-lesson",
      title: "Do one lesson — any lesson",
      reason:
        genome.motivation === "mastery"
          ? "Quiet learning week. Mastery compounds only while you feed it."
          : "Nothing due, nothing pressing — the perfect window to learn ahead.",
      href: "/studio/learn",
      estMin: 15,
      kind: "learn",
      score: 35 + t.depth * 15 + t.abstract * 5,
    });
  }

  // Focus session for builders with momentum but no recent deep work.
  const focus7d = input.focusSessions.filter((f) => now - f.ts < 7 * DAY);
  if (focus7d.length === 0 && input.ventures.length > 0) {
    out.push({
      id: "focus-block",
      title: "Run one 25-minute focus block",
      reason: "No deep-work sessions this week. One block beats five tabs.",
      href: "/studio/focus",
      estMin: 25,
      kind: "focus",
      score: 30 + t.depth * 10 + (1 - t.social) * 10,
    });
  }

  return out.sort((a, b) => b.score - a.score).slice(0, 4);
}

// ── Narrative ───────────────────────────────────────────────────────────
// One headline + subline that reads like it was written for this person,
// because it was: keyed off daypart, streak, motivation, and fear.
export function daypartOf(now: number): Pulse["daypart"] {
  const h = new Date(now).getHours();
  if (h < 5) return "night";
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  if (h < 22) return "evening";
  return "night";
}

const HEADLINES: Record<Genome["motivation"], Record<Pulse["daypart"], string>> = {
  impact: {
    morning: "The people you're building for are already awake.",
    afternoon: "Somewhere, the problem you chose is costing someone their afternoon.",
    evening: "End the day one inch closer to the people you serve.",
    night: "The quiet hours are where unreasonable things get built.",
  },
  income: {
    morning: "Revenue is a morning habit.",
    afternoon: "Every block of work this afternoon is runway.",
    evening: "Close the day like you close a sale — deliberately.",
    night: "Night work is fine. Burnout isn't. One sharp move, then rest.",
  },
  mastery: {
    morning: "Craft compounds before noon.",
    afternoon: "Depth over noise — the afternoon belongs to the work.",
    evening: "One deliberate rep tonight is worth three rushed ones tomorrow.",
    night: "The masters all kept odd hours. Make this one count.",
  },
  exit: {
    morning: "Build the thing someone will want to buy.",
    afternoon: "Optionality is earned one shipped piece at a time.",
    evening: "Acquirers buy traction, not intentions. Stack a little more.",
    night: "Late hours, long game. One move, then sleep.",
  },
  team: {
    morning: "Your future team is watching what you do today.",
    afternoon: "Build like someone's about to join you.",
    evening: "Leaders log off last — but they do log off.",
    night: "Even Sundiata rested. One last move, then tomorrow.",
  },
};

export function computeNarrative(input: PulseInput): { headline: string; subline: string } {
  const daypart = daypartOf(input.now);
  const { streak, genome } = input;

  // Streak takes the headline when it's alive — it's the most personal
  // number on the page.
  const headline =
    streak >= 3
      ? `Day ${streak}. The chain is the strategy.`
      : HEADLINES[genome.motivation][daypart];

  let subline: string;
  if (input.ventures.length > 0) {
    const v = input.ventures[0];
    subline = `${v.name} is in ${v.phase}. ${
      genome.primaryFear === "wrong-problem"
        ? "Every interview either confirms the problem or saves you years — both are wins."
        : genome.primaryFear === "running-out-of-money"
          ? "Today's moves below cost nothing but minutes."
          : "The next move is small on purpose."
    }`;
  } else if (input.field) {
    subline = `Nobody else in ${input.field} has your exact vantage point. That's the unfair advantage.`;
  } else {
    subline = "Small moves, made daily, in public. That's the whole method.";
  }

  return { headline, subline };
}

// ── The full pulse ──────────────────────────────────────────────────────
export function computePulse(input: PulseInput): Pulse {
  const { now } = input;
  const momentum = computeMomentum(input.activity, now, input.streak);
  const momentumTrend = computeMomentumTrend(input.activity, now);
  const learningVelocity = computeLearningVelocity(input.activity, now);
  const ventureHealth = input.ventures.map((v) => computeVentureHealth(v, now)).sort((a, b) => b.score - a.score);
  const actions = computeActions(input);
  const { headline, subline } = computeNarrative(input);
  const focusMinutes7d = input.focusSessions
    .filter((f) => now - f.ts < 7 * DAY && f.completed)
    .reduce((s, f) => s + f.durationMin, 0);

  return {
    momentum,
    momentumTrend,
    learningVelocity,
    focusMinutes7d,
    ventureHealth,
    actions,
    headline,
    subline,
    daypart: daypartOf(now),
  };
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
