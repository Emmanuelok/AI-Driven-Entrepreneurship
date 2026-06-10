import { describe, it, expect } from "vitest";
import { scoreMentorAgainstDepartment, scoreMentors } from "./recommendations";
import type { Mentor } from "./mentors";
import type { Department } from "./disciplines";

function mentor(name: string, expertise: string[], pricePerHour = 200): Mentor {
  return {
    id: name.toLowerCase().replace(/\s+/g, "-"),
    name,
    initials: name.split(" ").map((p) => p[0]).join(""),
    role: "Mentor",
    org: "Test",
    city: "Lagos",
    country: "NG",
    bio: "",
    expertise,
    languages: ["English"],
    yearsExperience: 10,
    availability: "high",
    badges: [],
    rating: 4.8,
    sessions: 0,
    responseHrs: 24,
    pricePerHour,
  };
}

function dept(relevantMentorExpertise: string[], relevantSectors: string[] = []): Department {
  return {
    id: "test",
    name: "Test Department",
    programs: [],
    relevantSectors,
    relevantTracks: [],
    relevantAgents: [],
    relevantMentorExpertise,
    aiOpportunities: [],
    localExamples: [],
    careerRoles: [],
    suggestedVentureSeed: "",
  };
}

describe("scoreMentorAgainstDepartment", () => {
  it("scores zero for no overlap", () => {
    const m = mentor("Alice", ["Music production"]);
    const d = dept(["Medical devices"]);
    expect(scoreMentorAgainstDepartment(m, d)).toBe(0);
  });

  it("scores 3 for an exact-tag match", () => {
    const m = mentor("Alice", ["Medical devices"]);
    const d = dept(["Medical devices"]);
    expect(scoreMentorAgainstDepartment(m, d)).toBe(3);
  });

  it("scores 2 for a substring overlap", () => {
    const m = mentor("Alice", ["Healthtech"]);
    const d = dept(["Health"]);
    // "healthtech" includes "health" — substring on one side; one
    // overlapping pair contributes 2.
    expect(scoreMentorAgainstDepartment(m, d)).toBe(2);
  });

  it("adds a +1 sector bridge when expertise hits a relevant sector but no expertise tag", () => {
    const m = mentor("Alice", ["Healthtech"]);
    const d = dept([], ["Health"]);
    // 2 for substring against expertise tags is skipped (no tags), but
    // sector bridge fires: +1.
    expect(scoreMentorAgainstDepartment(m, d)).toBe(1);
  });

  it("gives pro-bono mentors a +0.5 tiebreaker only when they already match", () => {
    const probono = mentor("Alice", ["Medical devices"], 0);
    const paid = mentor("Bob", ["Medical devices"], 200);
    const d = dept(["Medical devices"]);
    expect(scoreMentorAgainstDepartment(probono, d)).toBeGreaterThan(scoreMentorAgainstDepartment(paid, d));
  });

  it("doesn't reward pro-bono mentors with no overlap", () => {
    const m = mentor("Alice", ["Music"], 0);
    const d = dept(["Medical devices"]);
    expect(scoreMentorAgainstDepartment(m, d)).toBe(0);
  });
});

describe("scoreMentors", () => {
  it("ranks higher-scoring mentors first; ties break by name", () => {
    const a = mentor("Zara Adib", ["Medical devices"]);
    const b = mentor("Bola Akinwale", ["Medical devices"]);
    const c = mentor("Cleo Ndege", ["Music"]); // 0 — stays last
    const d = dept(["Medical devices"]);
    const out = scoreMentors([c, a, b], d);
    expect(out.map((m) => m.name)).toEqual(["Bola Akinwale", "Zara Adib", "Cleo Ndege"]);
  });
});
