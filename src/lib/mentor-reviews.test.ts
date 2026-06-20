import { describe, it, expect } from "vitest";
import {
  aggregateMentorReviews, reputationSummary, shouldShowReputation,
  REPUTATION_MIN_COUNT, type MentorReview,
} from "./mentor-reviews";

function review(over: Partial<MentorReview> = {}): MentorReview {
  return {
    source: "session",
    rating: 5,
    body: "Great session.",
    reviewed_at: "2026-06-01T00:00:00Z",
    reviewer: { display_name: "Reviewer", slug: null, avatar_url: null },
    context: "",
    ...over,
  };
}

describe("aggregateMentorReviews", () => {
  it("returns zero counts on empty input", () => {
    const r = aggregateMentorReviews([]);
    expect(r.totalCount).toBe(0);
    expect(r.averageRating).toBeNull();
    expect(Object.values(r.distribution).every((v) => v === 0)).toBe(true);
    expect(r.recent).toEqual([]);
  });

  it("computes average to one decimal", () => {
    const r = aggregateMentorReviews([
      review({ rating: 5 }), review({ rating: 4 }), review({ rating: 5 }),
    ]);
    expect(r.totalCount).toBe(3);
    expect(r.averageRating).toBe(4.7);
  });

  it("builds distribution + filters out-of-bounds ratings silently", () => {
    const r = aggregateMentorReviews([
      review({ rating: 5 }), review({ rating: 3 }), review({ rating: 0 }),
      review({ rating: 6 }), review({ rating: 2 }),
    ]);
    expect(r.totalCount).toBe(3);
    expect(r.distribution).toEqual({ 1: 0, 2: 1, 3: 1, 4: 0, 5: 1 });
  });

  it("surfaces only reviews with non-empty bodies in `recent`, sorted desc", () => {
    const r = aggregateMentorReviews([
      review({ body: "", reviewed_at: "2026-06-05T00:00:00Z" }),
      review({ body: "Solid.", reviewed_at: "2026-06-02T00:00:00Z" }),
      review({ body: "Excellent advice.", reviewed_at: "2026-06-10T00:00:00Z" }),
    ]);
    expect(r.recent.length).toBe(2);
    expect(r.recent[0].body).toBe("Excellent advice.");
    expect(r.recent[1].body).toBe("Solid.");
  });

  it("caps recent reviews by limit", () => {
    const r = aggregateMentorReviews(
      Array.from({ length: 20 }, (_, i) => review({ body: `r${i}`, reviewed_at: `2026-06-${(i + 1).toString().padStart(2, "0")}T00:00:00Z` })),
      4,
    );
    expect(r.recent.length).toBe(4);
  });
});

describe("reputationSummary", () => {
  it("returns null when no reviews", () => {
    expect(reputationSummary(aggregateMentorReviews([]))).toBeNull();
  });

  it("formats average with one decimal + pluralizes 'review'", () => {
    expect(reputationSummary(aggregateMentorReviews([review({ rating: 5 })]))).toBe("5.0 · 1 review");
    expect(reputationSummary(aggregateMentorReviews([review({ rating: 5 }), review({ rating: 3 })]))).toBe("4.0 · 2 reviews");
  });
});

describe("shouldShowReputation", () => {
  it("requires at least REPUTATION_MIN_COUNT reviews", () => {
    expect(REPUTATION_MIN_COUNT).toBeGreaterThanOrEqual(2);
    expect(shouldShowReputation(aggregateMentorReviews([]))).toBe(false);
    const justUnder = aggregateMentorReviews(
      Array.from({ length: REPUTATION_MIN_COUNT - 1 }, () => review()),
    );
    expect(shouldShowReputation(justUnder)).toBe(false);
    const atMin = aggregateMentorReviews(
      Array.from({ length: REPUTATION_MIN_COUNT }, () => review()),
    );
    expect(shouldShowReputation(atMin)).toBe(true);
  });
});
