import { describe, it, expect } from "vitest";
import {
  computePulse,
  computeMomentum,
  computeMomentumTrend,
  computeVentureHealth,
  computeActions,
  computeNarrative,
  daypartOf,
  type PulseInput,
} from "./pulse-engine";
import { DEFAULT_GENOME, type Genome } from "./genome";

const DAY = 86_400_000;
const NOW = new Date("2026-06-10T10:00:00Z").getTime();

function baseInput(over: Partial<PulseInput> = {}): PulseInput {
  return {
    now: NOW,
    name: "Ama",
    field: "Agricultural Engineering",
    streak: 0,
    xp: 0,
    dueCardCount: 0,
    ventures: [],
    goals: [],
    activity: [],
    genome: DEFAULT_GENOME,
    focusSessions: [],
    artifactsCount: 0,
    shipSessionStage: null,
    topProblem: null,
    suggestedVentureSeed: null,
    ...over,
  };
}

describe("computeMomentum", () => {
  it("is 0 with no activity and no streak", () => {
    expect(computeMomentum([], NOW, 0)).toBe(0);
  });

  it("rises with recent activity and saturates below 100", () => {
    const sparse = computeMomentum([{ ts: NOW - DAY }], NOW, 0);
    const dense = computeMomentum(
      Array.from({ length: 12 }, (_, i) => ({ ts: NOW - i * (DAY / 2) })),
      NOW,
      0,
    );
    expect(sparse).toBeGreaterThan(0);
    expect(dense).toBeGreaterThan(sparse);
    expect(dense).toBeLessThanOrEqual(100);
  });

  it("ignores activity older than 14 days", () => {
    expect(computeMomentum([{ ts: NOW - 20 * DAY }], NOW, 0)).toBe(0);
  });

  it("credits the streak even on a quiet day", () => {
    expect(computeMomentum([], NOW, 7)).toBeGreaterThan(0);
  });
});

describe("computeMomentumTrend", () => {
  it("reports rising when recent days outpace the prior week", () => {
    const activity = [
      { ts: NOW - 0.5 * DAY },
      { ts: NOW - DAY },
      { ts: NOW - 1.5 * DAY },
      { ts: NOW - 2 * DAY },
    ];
    expect(computeMomentumTrend(activity, NOW)).toBe("rising");
  });

  it("reports cooling when the prior week was busier", () => {
    const activity = Array.from({ length: 10 }, (_, i) => ({ ts: NOW - (4 + i * 0.5) * DAY }));
    expect(computeMomentumTrend(activity, NOW)).toBe("cooling");
  });
});

describe("computeVentureHealth", () => {
  const venture = {
    id: "v1",
    name: "KubaCold",
    phase: "discover",
    interviews: 5,
    interviewsTarget: 10,
    mvpDone: 2,
    mvpTotal: 8,
    mrr: 0,
    lastTouchedAt: NOW - DAY,
  };

  it("scores progress and stays in 0..100", () => {
    const h = computeVentureHealth(venture, NOW);
    expect(h.score).toBeGreaterThan(40);
    expect(h.score).toBeLessThanOrEqual(100);
    expect(h.drivers.join(" ")).toContain("Interviews 5/10");
  });

  it("penalizes staleness", () => {
    const fresh = computeVentureHealth(venture, NOW).score;
    const stale = computeVentureHealth({ ...venture, lastTouchedAt: NOW - 10 * DAY }, NOW).score;
    expect(stale).toBeLessThan(fresh);
  });

  it("credits real revenue", () => {
    const noRev = computeVentureHealth(venture, NOW).score;
    const rev = computeVentureHealth({ ...venture, mrr: 120 }, NOW).score;
    expect(rev).toBeGreaterThan(noRev);
  });
});

describe("computeActions", () => {
  it("surfaces SRS debt as a review action", () => {
    const actions = computeActions(baseInput({ dueCardCount: 9 }));
    expect(actions.some((a) => a.kind === "review")).toBe(true);
  });

  it("puts an in-flight Ship Hour at the top", () => {
    const actions = computeActions(baseInput({ shipSessionStage: "interview", dueCardCount: 30 }));
    expect(actions[0].id).toBe("resume-ship");
  });

  it("nudges stale ventures with a phase-appropriate move", () => {
    const actions = computeActions(
      baseInput({
        ventures: [{
          id: "v1", name: "KubaCold", phase: "discover",
          interviews: 2, interviewsTarget: 10, mvpDone: 0, mvpTotal: 0, mrr: 0,
          lastTouchedAt: NOW - 6 * DAY,
        }],
      }),
    );
    const touch = actions.find((a) => a.id === "touch-v1");
    expect(touch).toBeDefined();
    expect(touch!.title).toContain("interview");
  });

  it("seeds first venture from the discipline when there are none", () => {
    const actions = computeActions(baseInput({ suggestedVentureSeed: "Solar cold-chain alerts for tomato farmers." }));
    const first = actions.find((a) => a.id === "first-venture");
    expect(first).toBeDefined();
    expect(first!.reason).toContain("Solar cold-chain");
  });

  it("returns at most 4, ranked by score", () => {
    const actions = computeActions(
      baseInput({
        dueCardCount: 12,
        shipSessionStage: "slice",
        topProblem: { id: "p1", title: "Post-harvest loss" },
        goals: [{ id: "g1", text: "Talk to 5 farmers", status: "active", lastCheckinAt: NOW - 10 * DAY }],
        ventures: [{
          id: "v1", name: "KubaCold", phase: "mvp",
          interviews: 10, interviewsTarget: 10, mvpDone: 1, mvpTotal: 6, mrr: 0,
          lastTouchedAt: NOW - 8 * DAY,
        }],
      }),
    );
    expect(actions.length).toBe(4);
    for (let i = 1; i < actions.length; i++) {
      expect(actions[i - 1].score).toBeGreaterThanOrEqual(actions[i].score);
    }
  });

  it("tilts ranking by genome traits", () => {
    const kinesthetic: Genome = { ...DEFAULT_GENOME, traits: { ...DEFAULT_GENOME.traits, kinesthetic: 1 } };
    const a = computeActions(baseInput({ genome: kinesthetic, dueCardCount: 3 }));
    const b = computeActions(baseInput({ dueCardCount: 3 }));
    const shipA = a.find((x) => x.id === "first-venture")!.score;
    const shipB = b.find((x) => x.id === "first-venture")!.score;
    expect(shipA).toBeGreaterThan(shipB);
  });
});

describe("narrative", () => {
  it("leads with the streak when it's alive", () => {
    const { headline } = computeNarrative(baseInput({ streak: 5 }));
    expect(headline).toContain("Day 5");
  });

  it("varies by motivation when there's no streak", () => {
    const impact = computeNarrative(baseInput()).headline;
    const income = computeNarrative(baseInput({ genome: { ...DEFAULT_GENOME, motivation: "income" } })).headline;
    expect(impact).not.toBe(income);
  });

  it("speaks to the active venture and the user's fear", () => {
    const { subline } = computeNarrative(
      baseInput({
        ventures: [{ id: "v1", name: "KubaCold", phase: "discover", interviews: 0, interviewsTarget: 10, mvpDone: 0, mvpTotal: 0, mrr: 0 }],
      }),
    );
    expect(subline).toContain("KubaCold");
  });
});

describe("computePulse", () => {
  it("assembles a full pulse deterministically", () => {
    const input = baseInput({
      streak: 3,
      dueCardCount: 4,
      activity: [{ ts: NOW - DAY, kind: "lesson", title: "Did a lesson" }],
    });
    const a = computePulse(input);
    const b = computePulse(input);
    expect(a).toEqual(b);
    expect(a.momentum).toBeGreaterThan(0);
    expect(a.actions.length).toBeGreaterThan(0);
    expect(["morning", "afternoon", "evening", "night"]).toContain(a.daypart);
  });

  it("daypartOf maps hours correctly", () => {
    expect(daypartOf(new Date("2026-06-10T08:00:00").getTime())).toBe("morning");
    expect(daypartOf(new Date("2026-06-10T14:00:00").getTime())).toBe("afternoon");
    expect(daypartOf(new Date("2026-06-10T19:00:00").getTime())).toBe("evening");
    expect(daypartOf(new Date("2026-06-10T23:30:00").getTime())).toBe("night");
  });
});
