import type { SupabaseClient } from "@supabase/supabase-js";
import { aggregateEarnings, fillTrend, type EarningEvent } from "@/lib/mentor-earnings";
import { aggregateMentorReviews, type MentorReview } from "@/lib/mentor-reviews";
import { aggregateVentureEngagement, type GrantSignal } from "@/lib/dataroom-engagement";
import { composeDigest, type DigestInput, type Digest } from "@/lib/digest";

// Server-side assembler for the personal digest (Phase 73). Pulls the
// minimal data needed for both the mentor + founder sides, runs it
// through the shared pure aggregators, and composes the Digest.
//
// Shared between the preview (GET) and send (POST) handlers so the two
// can never drift. Uses a service-role client; all queries are scoped
// to the single userId so there's no cross-user leakage.

const DAY = 86_400_000;

export async function buildDigestForUser(
  sb: SupabaseClient,
  userId: string,
  opts: { displayName: string; baseUrl: string; windowDays?: number; now?: Date },
): Promise<Digest> {
  const windowDays = opts.windowDays ?? 7;
  const now = opts.now ?? new Date();
  const sinceIso = new Date(now.getTime() - windowDays * DAY).toISOString();

  // ── Pull mentor + founder data in parallel ──────────────────────
  const [sessionsRes, offeringsRes, venturesRes] = await Promise.all([
    sb.from("mentor_sessions")
      .select("status, price_cents, application_fee_pct, paid_at, scheduled_at, topic, review_rating, review_body, reviewed_at")
      .eq("mentor_user_id", userId),
    sb.from("mentor_office_hours")
      .select("id, title, scheduled_at, price_per_seat_cents, application_fee_pct, status")
      .eq("mentor_user_id", userId),
    sb.from("public_ventures")
      .select("slug, payload")
      .eq("owner_id", userId),
  ]);

  const sessions = (sessionsRes.data ?? []) as Array<{ status: string; price_cents: number; application_fee_pct: number; paid_at: string | null; scheduled_at: string | null; topic: string; review_rating: number | null; review_body: string | null; reviewed_at: string | null }>;
  const offerings = (offeringsRes.data ?? []) as Array<{ id: string; title: string; scheduled_at: string; price_per_seat_cents: number; application_fee_pct: number; status: string }>;
  const offeringById = new Map(offerings.map((o) => [o.id, o]));
  const ventures = (venturesRes.data ?? []) as Array<{ slug: string; payload: Record<string, unknown> }>;

  const offeringIds = offerings.map((o) => o.id);
  const ventureSlugs = ventures.map((v) => v.slug);

  const [seatsRes, grantsRes] = await Promise.all([
    offeringIds.length === 0
      ? Promise.resolve({ data: [] })
      : sb.from("mentor_office_hours_seats")
          .select("office_hours_id, status, paid_at, review_rating, review_body, reviewed_at")
          .in("office_hours_id", offeringIds),
    ventureSlugs.length === 0
      ? Promise.resolve({ data: [] })
      : sb.from("venture_dataroom_grants")
          .select("venture_slug, granted_to_user_id, granted_at, expires_at, revoked_at, first_viewed_at, last_viewed_at, view_count")
          .in("venture_slug", ventureSlugs),
  ]);
  const seats = (seatsRes.data ?? []) as Array<{ office_hours_id: string; status: string; paid_at: string | null; review_rating: number | null; review_body: string | null; reviewed_at: string | null }>;
  const grants = (grantsRes.data ?? []) as Array<{ venture_slug: string; granted_to_user_id: string; granted_at: string; expires_at: string | null; revoked_at: string | null; first_viewed_at: string | null; last_viewed_at: string | null; view_count: number }>;

  // ── Mentor side ─────────────────────────────────────────────────
  let mentor: DigestInput["mentor"] | undefined;
  const hasMentorActivity = sessions.length > 0 || offerings.length > 0;
  if (hasMentorActivity) {
    const events: EarningEvent[] = [];
    for (const s of sessions) {
      const future = s.scheduled_at ? new Date(s.scheduled_at).getTime() > now.getTime() : false;
      if (s.status === "refunded") events.push({ source: "session", grossCents: s.price_cents, applicationFeePct: s.application_fee_pct, state: "refunded", at: s.paid_at ?? now.toISOString() });
      else if (s.status === "paid" && future) events.push({ source: "session", grossCents: s.price_cents, applicationFeePct: s.application_fee_pct, state: "upcoming", at: s.scheduled_at ?? now.toISOString() });
      else if (s.status === "paid" || s.status === "completed" || s.status === "reviewed") events.push({ source: "session", grossCents: s.price_cents, applicationFeePct: s.application_fee_pct, state: "earned", at: s.paid_at ?? now.toISOString() });
    }
    for (const seat of seats) {
      const o = offeringById.get(seat.office_hours_id);
      if (!o) continue;
      const future = new Date(o.scheduled_at).getTime() > now.getTime();
      if (seat.status === "refunded") events.push({ source: "office_hours", grossCents: o.price_per_seat_cents, applicationFeePct: o.application_fee_pct, state: "refunded", at: seat.paid_at ?? o.scheduled_at });
      else if (seat.status === "paid" && future) events.push({ source: "office_hours", grossCents: o.price_per_seat_cents, applicationFeePct: o.application_fee_pct, state: "upcoming", at: o.scheduled_at });
      else if (seat.status === "paid" || seat.status === "attended") events.push({ source: "office_hours", grossCents: o.price_per_seat_cents, applicationFeePct: o.application_fee_pct, state: "earned", at: seat.paid_at ?? o.scheduled_at });
    }
    const earnings = aggregateEarnings(events);
    const trend = fillTrend(earnings.trend, now, 2);
    const netThisMonth = trend[trend.length - 1]?.netCents ?? 0;
    const netLastMonth = trend[trend.length - 2]?.netCents ?? 0;

    // Reviews received within the window.
    const reviews: MentorReview[] = [
      ...sessions.filter((s) => s.review_rating != null && s.reviewed_at != null).map((s) => ({ source: "session" as const, rating: s.review_rating!, body: (s.review_body ?? "").trim(), reviewed_at: s.reviewed_at!, reviewer: null, context: s.topic.slice(0, 80) })),
      ...seats.filter((s) => s.review_rating != null && s.reviewed_at != null).map((s) => ({ source: "office_hours" as const, rating: s.review_rating!, body: (s.review_body ?? "").trim(), reviewed_at: s.reviewed_at!, reviewer: null, context: offeringById.get(s.office_hours_id)?.title ?? "Office hours" })),
    ];
    const reputation = aggregateMentorReviews(reviews);
    const newReviews = reviews.filter((r) => r.reviewed_at >= sinceIso).length;

    mentor = {
      netCentsThisMonth: netThisMonth,
      netCentsLastMonth: netLastMonth,
      upcomingCount: earnings.upcomingCount,
      upcomingNetCents: earnings.upcomingNetCents,
      newReviews,
      averageRating: reputation.averageRating,
    };
  }

  // ── Founder side ────────────────────────────────────────────────
  let founder: DigestInput["founder"] | undefined;
  if (ventures.length > 0) {
    const grantsBySlug = new Map<string, GrantSignal[]>();
    for (const g of grants) {
      const sig: GrantSignal = {
        granteeUserId: g.granted_to_user_id,
        grantedAt: g.granted_at,
        expiresAt: g.expires_at,
        revokedAt: g.revoked_at,
        firstViewedAt: g.first_viewed_at,
        lastViewedAt: g.last_viewed_at,
        viewCount: g.view_count,
      };
      const arr = grantsBySlug.get(g.venture_slug) ?? [];
      arr.push(sig);
      grantsBySlug.set(g.venture_slug, arr);
    }

    let hotInvestors = 0;
    let coldInvestors = 0;
    let topVenture: { title: string; slug: string; engagementScore: number } | null = null;
    for (const v of ventures) {
      const sigs = grantsBySlug.get(v.slug) ?? [];
      const e = aggregateVentureEngagement(sigs, now);
      hotInvestors += e.hotCount;
      coldInvestors += e.coldCount;
      const payload = v.payload as { title?: string; name?: string };
      const title = String(payload.title ?? payload.name ?? v.slug);
      if (!topVenture || e.engagementScore > topVenture.engagementScore) {
        topVenture = { title, slug: v.slug, engagementScore: e.engagementScore };
      }
    }

    // New views in the window: grants whose last_viewed_at is recent.
    // (We don't have per-view timestamps, but last_viewed_at within the
    // window is a good proxy for "viewed during this period".)
    const newViews = grants.filter((g) => g.last_viewed_at != null && g.last_viewed_at >= sinceIso).reduce((acc, g) => acc + Math.min(g.view_count, 1), 0);

    // Only build the founder section if there's any grant at all.
    if (grants.length > 0) {
      founder = { hotInvestors, coldInvestors, newViews, topVenture };
    }
  }

  return composeDigest({
    displayName: opts.displayName,
    baseUrl: opts.baseUrl,
    windowDays,
    mentor,
    founder,
  });
}
