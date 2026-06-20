// Pure aggregation for mentor reviews (Phase 69).
//
// Reviews come from two tables:
//   - mentor_sessions.review_rating / review_body (1:1 paid sessions)
//   - mentor_office_hours_seats.review_rating / review_body (group office hours)
//
// Both attach a rating (1-5) and an optional body. The pure code below
// handles aggregation + display rules so the API + UI agree.

export type MentorReview = {
  source: "session" | "office_hours";
  rating: number;
  body: string;
  reviewed_at: string;
  // Who reviewed. Display only; nulls when the reviewer's profile
  // isn't public anymore.
  reviewer: { display_name: string | null; slug: string | null; avatar_url: string | null } | null;
  // Context for the UI ("re. fundraising Q&A · Apr 2026")
  context: string;
};

export type MentorReputation = {
  totalCount: number;
  averageRating: number | null;
  // Distribution map: 1..5 → count.
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
  // Reviews with non-empty bodies. Most-recent first. Capped (caller
  // decides how many to surface).
  recent: MentorReview[];
};

// Filters out invalid + builds aggregate. Rejects ratings outside 1-5
// silently (defensive — the DB constraint already enforces this, but
// types-from-DB drift is real).
export function aggregateMentorReviews(reviews: MentorReview[], recentLimit = 6): MentorReputation {
  const valid = reviews.filter((r) =>
    Number.isInteger(r.rating)
    && r.rating >= 1
    && r.rating <= 5,
  );
  const totalCount = valid.length;
  const sum = valid.reduce((acc, r) => acc + r.rating, 0);
  const averageRating = totalCount > 0
    ? Math.round((sum / totalCount) * 10) / 10  // one decimal
    : null;

  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<1 | 2 | 3 | 4 | 5, number>;
  for (const r of valid) distribution[r.rating as 1 | 2 | 3 | 4 | 5]++;

  const recent = valid
    .filter((r) => r.body.trim().length > 0)
    .sort((a, b) => new Date(b.reviewed_at).getTime() - new Date(a.reviewed_at).getTime())
    .slice(0, recentLimit);

  return { totalCount, averageRating, distribution, recent };
}

// One-line summary for chips ("4.8 · 12 reviews").
export function reputationSummary(rep: MentorReputation): string | null {
  if (rep.totalCount === 0 || rep.averageRating == null) return null;
  return `${rep.averageRating.toFixed(1)} · ${rep.totalCount} review${rep.totalCount === 1 ? "" : "s"}`;
}

// Whether the mentor has enough reviews to show the badge. Single
// reviews are noisy — wait for 3 before publishing the aggregate.
export const REPUTATION_MIN_COUNT = 3;

export function shouldShowReputation(rep: MentorReputation): boolean {
  return rep.totalCount >= REPUTATION_MIN_COUNT;
}
