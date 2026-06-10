import { describe, it, expect } from "vitest";
import { assessPhase, type PhaseVentureInput } from "./phase-engine";

const NOW = new Date("2026-06-10T10:00:00Z").getTime();
const DAY = 86_400_000;

function venture(over: Partial<PhaseVentureInput> = {}): PhaseVentureInput {
  return {
    id: "v1",
    phase: "ideate",
    tagline: "Solar cold-chain alerts for tomato farmers",
    problemId: undefined,
    wedge: null,
    canvasFilledBlocks: 0,
    interviews: [],
    interviewsTarget: 10,
    mvpTasksTotal: 0,
    mvpTasksDone: 0,
    customers: 0,
    mrr: 0,
    hasPublicLaunch: false,
    hasPitchDeck: false,
    hasCurrentOkrs: false,
    lastMonthlyUpdateAt: undefined,
    teamSize: 1,
    ...over,
  };
}

describe("assessPhase — ideate", () => {
  it("blocks advancement when the wedge is missing", () => {
    const a = assessPhase(venture({ canvasFilledBlocks: 9, problemId: "p1" }), NOW);
    expect(a.readyToAdvance).toBe(false);
    expect(a.blocking.some((c) => c.id === "wedge")).toBe(true);
  });

  it("is ready when all gates are green", () => {
    const a = assessPhase(
      venture({
        wedge: { who: "Yendi tomato farmers", pain: "40% post-harvest loss" },
        canvasFilledBlocks: 6,
        problemId: "post-harvest-loss",
      }),
      NOW,
    );
    expect(a.readyToAdvance).toBe(true);
    expect(a.readiness).toBe(100);
    expect(a.nextPhase).toBe("discover");
    expect(a.verdict).toContain("discover");
  });
});

describe("assessPhase — discover", () => {
  it("requires both volume and signal", () => {
    const volumeOnly = assessPhase(
      venture({
        phase: "discover",
        interviews: Array.from({ length: 10 }, () => ({ verdict: "rejected" as const })),
      }),
      NOW,
    );
    expect(volumeOnly.readyToAdvance).toBe(false);
    expect(volumeOnly.blocking.some((c) => c.id === "signal")).toBe(true);

    const both = assessPhase(
      venture({
        phase: "discover",
        interviews: [
          ...Array.from({ length: 7 }, () => ({ verdict: "insight" as const })),
          ...Array.from({ length: 3 }, () => ({ verdict: "validated" as const })),
        ],
      }),
      NOW,
    );
    expect(both.readyToAdvance).toBe(true);
  });

  it("counts willingness-to-pay as signal", () => {
    const a = assessPhase(
      venture({
        phase: "discover",
        interviews: Array.from({ length: 10 }, () => ({ verdict: "insight" as const, willingnessToPay: 5 })),
      }),
      NOW,
    );
    expect(a.criteria.find((c) => c.id === "signal")!.met).toBe(true);
  });
});

describe("assessPhase — mvp", () => {
  it("requires scope before completion can register", () => {
    const a = assessPhase(venture({ phase: "mvp" }), NOW);
    expect(a.blocking.map((c) => c.id)).toContain("scoped");
  });

  it("passes at 80% of a scoped board with discovery evidence", () => {
    const a = assessPhase(
      venture({
        phase: "mvp",
        mvpTasksTotal: 5,
        mvpTasksDone: 4,
        interviews: [{ verdict: "validated" }],
      }),
      NOW,
    );
    expect(a.readyToAdvance).toBe(true);
  });
});

describe("assessPhase — launch", () => {
  it("holds the gate until revenue is real", () => {
    const a = assessPhase(
      venture({ phase: "launch", hasPublicLaunch: true, hasPitchDeck: true, customers: 1, mrr: 0 }),
      NOW,
    );
    expect(a.readyToAdvance).toBe(false);
    expect(a.blocking.some((c) => c.id === "revenue")).toBe(true);
  });
});

describe("assessPhase — scale", () => {
  it("has no next phase and judges operating rhythm", () => {
    const healthy = assessPhase(
      venture({
        phase: "scale",
        hasCurrentOkrs: true,
        lastMonthlyUpdateAt: NOW - 10 * DAY,
        teamSize: 3,
      }),
      NOW,
    );
    expect(healthy.nextPhase).toBeNull();
    expect(healthy.readyToAdvance).toBe(false);
    expect(healthy.verdict).toContain("healthy");

    const stale = assessPhase(
      venture({ phase: "scale", hasCurrentOkrs: true, lastMonthlyUpdateAt: NOW - 60 * DAY, teamSize: 1 }),
      NOW,
    );
    expect(stale.blocking.length).toBeGreaterThan(0);
  });
});

describe("readiness math", () => {
  it("is monotone in progress and stays in 0..100", () => {
    const empty = assessPhase(venture({ tagline: "" }), NOW);
    const partial = assessPhase(venture({ canvasFilledBlocks: 3 }), NOW);
    const full = assessPhase(
      venture({ wedge: { who: "a", pain: "b" }, canvasFilledBlocks: 9, problemId: "p" }),
      NOW,
    );
    expect(empty.readiness).toBeGreaterThanOrEqual(0);
    expect(partial.readiness).toBeGreaterThan(empty.readiness);
    expect(full.readiness).toBe(100);
  });
});
