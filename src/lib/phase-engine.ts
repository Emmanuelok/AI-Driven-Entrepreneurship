// ─────────────────────────────────────────────────────────────────────────
// The Phase Engine — venture-phase intelligence.
//
// Each venture phase (ideate → discover → mvp → launch → scale) has
// real exit criteria, the same ones a good studio partner would hold a
// founder to. This engine evaluates a venture against its current
// phase's criteria and reports:
//
//   - which criteria are met / unmet, with progress and a deep link
//   - a readiness score (0..100)
//   - whether the venture has earned advancement
//   - a one-line human verdict
//
// Pure and deterministic, like pulse-engine.ts: plain-data input, no
// stores, no network, fully unit-testable. The venture cockpit renders
// it; Akili's brief cites it; the user can still advance manually —
// the engine informs, it doesn't imprison.
// ─────────────────────────────────────────────────────────────────────────

import type { Venture } from "@/store";

export type VenturePhase = "ideate" | "discover" | "mvp" | "launch" | "scale";

// Plain projection of the Venture shape — only what the criteria read.
export type PhaseVentureInput = {
  id: string;
  phase: VenturePhase;
  tagline: string;
  problemId?: string;
  wedge?: { who: string; pain: string } | null;
  canvasFilledBlocks: number; // of 9 lean-canvas blocks with content
  interviews: { verdict: "validated" | "insight" | "rejected"; willingnessToPay?: number }[];
  interviewsTarget: number;
  mvpTasksTotal: number;
  mvpTasksDone: number;
  customers: number;
  mrr: number;
  hasPublicLaunch: boolean;
  hasPitchDeck: boolean;
  hasCurrentOkrs: boolean;
  lastMonthlyUpdateAt?: number; // ts of most recent investor update
  teamSize: number;
};

export type PhaseCriterion = {
  id: string;
  label: string;
  detail: string; // why this gate exists
  met: boolean;
  progress: number; // 0..1
  href: string; // where on the platform to close the gap
};

export type PhaseAssessment = {
  phase: VenturePhase;
  nextPhase: VenturePhase | null;
  criteria: PhaseCriterion[];
  readiness: number; // 0..100
  readyToAdvance: boolean;
  blocking: PhaseCriterion[];
  verdict: string;
};

const PHASE_ORDER: VenturePhase[] = ["ideate", "discover", "mvp", "launch", "scale"];

// Project the full store Venture into the engine's input. Type-only
// dependency on the store — no runtime coupling.
export function phaseInputFromVenture(v: Venture, now: number): PhaseVentureInput {
  const quarter = `${new Date(now).getFullYear()}-Q${Math.floor(new Date(now).getMonth() / 3) + 1}`;
  return {
    id: v.id,
    phase: v.phase,
    tagline: v.tagline ?? "",
    problemId: v.problemId,
    wedge: v.wedge ? { who: v.wedge.who, pain: v.wedge.pain } : null,
    canvasFilledBlocks: Object.values(v.canvas ?? {}).filter((x) => typeof x === "string" && x.trim().length > 0).length,
    interviews: v.interviews.map((i) => ({ verdict: i.verdict, willingnessToPay: i.willingnessToPay })),
    interviewsTarget: v.metrics.interviewsTarget,
    mvpTasksTotal: v.mvpTasks.length,
    mvpTasksDone: v.mvpTasks.filter((t) => t.done).length,
    customers: v.metrics.customers,
    mrr: v.metrics.mrr,
    hasPublicLaunch: !!v.publicLaunch?.headline,
    hasPitchDeck: !!v.pitchDeck && v.pitchDeck.slides.length > 0,
    hasCurrentOkrs: (v.okrs ?? []).some((o) => o.quarter === quarter),
    lastMonthlyUpdateAt: (v.updates ?? []).reduce<number | undefined>(
      (max, u) => (max === undefined || u.created > max ? u.created : max),
      undefined,
    ),
    teamSize: v.team.length,
  };
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

export function assessPhase(v: PhaseVentureInput, now: number): PhaseAssessment {
  const base = `/studio/venture/${v.id}`;
  const criteria: PhaseCriterion[] = [];

  const positiveSignals = v.interviews.filter(
    (i) => i.verdict === "validated" || (i.willingnessToPay ?? 0) > 0,
  ).length;

  switch (v.phase) {
    case "ideate": {
      criteria.push(
        {
          id: "wedge",
          label: "Wedge defined — a specific who with a specific pain",
          detail: "Ventures aimed at 'everyone' interview no one. The wedge makes discovery possible.",
          met: !!v.wedge?.who && !!v.wedge?.pain,
          progress: v.wedge?.who && v.wedge?.pain ? 1 : v.wedge?.who || v.wedge?.pain ? 0.5 : 0,
          href: `${base}/ideate`,
        },
        {
          id: "canvas",
          label: "Lean canvas: at least 5 of 9 blocks filled",
          detail: "Not for the canvas's sake — to expose which beliefs are still blank.",
          met: v.canvasFilledBlocks >= 5,
          progress: clamp01(v.canvasFilledBlocks / 5),
          href: `${base}/ideate`,
        },
        {
          id: "problem",
          label: "Anchored to a real problem brief",
          detail: "Linking a Problem Hub brief keeps the venture pointed at evidence, not vibes.",
          met: !!v.problemId,
          progress: v.problemId ? 1 : 0,
          href: "/studio/problems",
        },
        {
          id: "tagline",
          label: "One-sentence tagline that a stranger would understand",
          detail: "If you can't say it in a sentence, discovery interviews will wander.",
          met: v.tagline.trim().length >= 12,
          progress: clamp01(v.tagline.trim().length / 12),
          href: base,
        },
      );
      break;
    }
    case "discover": {
      criteria.push(
        {
          id: "interviews",
          label: `${v.interviews.length}/${v.interviewsTarget} customer interviews logged`,
          detail: "The target isn't bureaucracy — patterns only stabilize after enough conversations.",
          met: v.interviews.length >= v.interviewsTarget,
          progress: clamp01(v.interviews.length / Math.max(1, v.interviewsTarget)),
          href: `${base}/discover`,
        },
        {
          id: "signal",
          label: "At least 3 interviews with a validated verdict or willingness to pay",
          detail: "Volume without signal is theater. You need people leaning in, not nodding politely.",
          met: positiveSignals >= 3,
          progress: clamp01(positiveSignals / 3),
          href: `${base}/discover`,
        },
      );
      break;
    }
    case "mvp": {
      criteria.push(
        {
          id: "scoped",
          label: "MVP board scoped — at least 3 concrete tasks",
          detail: "An unscoped MVP grows until it dies. Write the tasks down.",
          met: v.mvpTasksTotal >= 3,
          progress: clamp01(v.mvpTasksTotal / 3),
          href: `${base}/mvp`,
        },
        {
          id: "shipped",
          label: `MVP tasks ${v.mvpTasksDone}/${v.mvpTasksTotal || 0} — 80% done`,
          detail: "Launch with the smallest thing that delivers the promise. 80% of a tight scope beats 40% of a grand one.",
          met: v.mvpTasksTotal > 0 && v.mvpTasksDone / v.mvpTasksTotal >= 0.8,
          progress: v.mvpTasksTotal > 0 ? clamp01(v.mvpTasksDone / v.mvpTasksTotal / 0.8) : 0,
          href: `${base}/mvp`,
        },
        {
          id: "evidence",
          label: "Discovery evidence still standing (some validated interviews)",
          detail: "If discovery didn't surface signal, building faster won't fix it.",
          met: positiveSignals >= 1,
          progress: clamp01(positiveSignals),
          href: `${base}/discover`,
        },
      );
      break;
    }
    case "launch": {
      criteria.push(
        {
          id: "public",
          label: "Public launch page live",
          detail: "A real URL strangers can visit — the line between project and product.",
          met: v.hasPublicLaunch,
          progress: v.hasPublicLaunch ? 1 : 0,
          href: `${base}/launch`,
        },
        {
          id: "first-customer",
          label: `First paying customer (${v.customers} so far)`,
          detail: "One person paying changes every conversation you'll have after.",
          met: v.customers >= 1,
          progress: clamp01(v.customers),
          href: `${base}/growth`,
        },
        {
          id: "revenue",
          label: `Revenue flowing — $${v.mrr} MRR`,
          detail: "Scale multiplies what exists. Zero times anything is zero.",
          met: v.mrr > 0,
          progress: v.mrr > 0 ? 1 : 0,
          href: `${base}/growth`,
        },
        {
          id: "pitch",
          label: "Pitch deck drafted",
          detail: "Even if you never raise — the deck forces the narrative to cohere.",
          met: v.hasPitchDeck,
          progress: v.hasPitchDeck ? 1 : 0,
          href: `${base}/pitch`,
        },
      );
      break;
    }
    case "scale": {
      const updatedRecently = !!v.lastMonthlyUpdateAt && now - v.lastMonthlyUpdateAt < 35 * 86_400_000;
      criteria.push(
        {
          id: "okrs",
          label: "This quarter's OKRs set",
          detail: "Scale without OKRs is motion without direction.",
          met: v.hasCurrentOkrs,
          progress: v.hasCurrentOkrs ? 1 : 0,
          href: `${base}/okrs`,
        },
        {
          id: "update",
          label: "Monthly update sent in the last 35 days",
          detail: "Investors fund founders who write. So do future hires.",
          met: updatedRecently,
          progress: updatedRecently ? 1 : 0,
          href: `${base}/launch`,
        },
        {
          id: "team",
          label: "Not building alone — team of 2+",
          detail: "Past launch, the bottleneck is always founder hours. Hire or burn out.",
          met: v.teamSize >= 2,
          progress: clamp01(v.teamSize / 2),
          href: `${base}/hire`,
        },
      );
      break;
    }
  }

  const readiness = Math.round(
    (criteria.reduce((s, c) => s + c.progress, 0) / Math.max(1, criteria.length)) * 100,
  );
  const blocking = criteria.filter((c) => !c.met);
  const phaseIdx = PHASE_ORDER.indexOf(v.phase);
  const nextPhase = phaseIdx < PHASE_ORDER.length - 1 ? PHASE_ORDER[phaseIdx + 1] : null;
  // Scale is a steady state — "ready to advance" only applies before it.
  const readyToAdvance = nextPhase !== null && blocking.length === 0;

  let verdict: string;
  if (nextPhase === null) {
    verdict =
      blocking.length === 0
        ? "Operating rhythm is healthy. Keep the cadence."
        : `Scale rhythm has ${blocking.length} gap${blocking.length === 1 ? "" : "s"}: ${blocking[0].label.toLowerCase()}.`;
  } else if (readyToAdvance) {
    verdict = `Every ${v.phase} gate is green. You've earned ${nextPhase} — advance when you're ready.`;
  } else if (readiness >= 60) {
    verdict = `Close. ${blocking.length} gate${blocking.length === 1 ? "" : "s"} left — start with: ${blocking[0].label.toLowerCase()}.`;
  } else {
    verdict = `Still early in ${v.phase}. The highest-leverage gap: ${blocking[0]?.label.toLowerCase() ?? "keep going"}.`;
  }

  return { phase: v.phase, nextPhase, criteria, readiness, readyToAdvance, blocking, verdict };
}
