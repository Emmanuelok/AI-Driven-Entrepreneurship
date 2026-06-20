import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { aggregateMentorReviews, type MentorReview } from "@/lib/mentor-reviews";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — public mentor reputation: aggregated rating + recent reviews
//       drawn from BOTH mentor_sessions (1:1) and
//       mentor_office_hours_seats (group). Sessions / seats with no
//       review (rating null) are excluded. Reviewer profile hydration
//       is best-effort.

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: true, mode: "local", reputation: aggregateMentorReviews([]) });
  const { slug } = await params;
  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  // Resolve the mentor user_id from the slug.
  const { data: profile } = await sb
    .from("user_profiles")
    .select("user_id, account_type, is_public, display_name, slug")
    .eq("slug", slug)
    .maybeSingle();
  const p = profile as { user_id: string; account_type: string; is_public: boolean; display_name: string; slug: string | null } | null;
  if (!p || !p.is_public) return Response.json({ ok: false, error: "not_found" }, { status: 404 });

  // Only mentors expose this endpoint — non-mentors return an empty
  // reputation rather than 404 so the UI can degrade cleanly.
  if (p.account_type !== "mentor") {
    return Response.json({ ok: true, reputation: aggregateMentorReviews([]) });
  }

  // Pull reviews from both tables in parallel.
  const [sessionsRes, seatsRes] = await Promise.all([
    sb.from("mentor_sessions")
      .select("review_rating, review_body, reviewed_at, founder_user_id, topic")
      .eq("mentor_user_id", p.user_id)
      .not("review_rating", "is", null),
    sb.from("mentor_office_hours_seats")
      .select("review_rating, review_body, reviewed_at, founder_user_id, office_hours_id")
      .not("review_rating", "is", null)
      .in("office_hours_id",
        // sub-query: every office_hours owned by this mentor
        (await sb.from("mentor_office_hours").select("id").eq("mentor_user_id", p.user_id))
          .data?.map((r) => (r as { id: string }).id) ?? [],
      ),
  ]);

  const sessionRows = (sessionsRes.data ?? []) as Array<{
    review_rating: number | null; review_body: string | null;
    reviewed_at: string | null; founder_user_id: string; topic: string;
  }>;
  const seatRows = (seatsRes.data ?? []) as Array<{
    review_rating: number | null; review_body: string | null;
    reviewed_at: string | null; founder_user_id: string; office_hours_id: string;
  }>;

  // Hydrate reviewer + office-hours-title in parallel.
  const reviewerIds = Array.from(new Set([
    ...sessionRows.map((r) => r.founder_user_id),
    ...seatRows.map((r) => r.founder_user_id),
  ]));
  const offeringIds = Array.from(new Set(seatRows.map((r) => r.office_hours_id)));

  const [reviewersRes, offeringTitlesRes] = await Promise.all([
    reviewerIds.length === 0
      ? Promise.resolve({ data: [] })
      : sb.from("user_profiles")
          .select("user_id, display_name, slug, avatar_url, is_public")
          .in("user_id", reviewerIds),
    offeringIds.length === 0
      ? Promise.resolve({ data: [] })
      : sb.from("mentor_office_hours")
          .select("id, title")
          .in("id", offeringIds),
  ]);

  const reviewerById = new Map<string, { display_name: string; slug: string | null; avatar_url: string | null; is_public: boolean }>();
  for (const r of (reviewersRes.data ?? []) as Array<{ user_id: string; display_name: string; slug: string | null; avatar_url: string | null; is_public: boolean }>) {
    reviewerById.set(r.user_id, { display_name: r.display_name, slug: r.slug, avatar_url: r.avatar_url, is_public: r.is_public });
  }
  const offeringTitleById = new Map<string, string>();
  for (const o of (offeringTitlesRes.data ?? []) as Array<{ id: string; title: string }>) {
    offeringTitleById.set(o.id, o.title);
  }

  function hydrateReviewer(uid: string): MentorReview["reviewer"] {
    const r = reviewerById.get(uid);
    if (!r || !r.is_public) return null;
    return { display_name: r.display_name, slug: r.slug, avatar_url: r.avatar_url };
  }

  const reviews: MentorReview[] = [
    ...sessionRows
      .filter((r) => r.review_rating != null && r.reviewed_at != null)
      .map((r) => ({
        source: "session" as const,
        rating: r.review_rating!,
        body: (r.review_body ?? "").trim(),
        reviewed_at: r.reviewed_at!,
        reviewer: hydrateReviewer(r.founder_user_id),
        context: r.topic.slice(0, 80),
      })),
    ...seatRows
      .filter((r) => r.review_rating != null && r.reviewed_at != null)
      .map((r) => ({
        source: "office_hours" as const,
        rating: r.review_rating!,
        body: (r.review_body ?? "").trim(),
        reviewed_at: r.reviewed_at!,
        reviewer: hydrateReviewer(r.founder_user_id),
        context: offeringTitleById.get(r.office_hours_id) ?? "Office hours",
      })),
  ];

  const reputation = aggregateMentorReviews(reviews);

  return Response.json({ ok: true, reputation });
}
