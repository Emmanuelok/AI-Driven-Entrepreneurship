import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { bearerToken } from "@/lib/workspace-auth";
import { aggregateEarnings, fillTrend, type EarningEvent, type MentorEarnings, type MonthBucket } from "@/lib/mentor-earnings";
import { aggregateMentorReviews, type MentorReview, type MentorReputation } from "@/lib/mentor-reviews";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — the mentor's own earnings + engagement dashboard. Aggregates
//       money from BOTH rails (1:1 sessions + office-hours seats),
//       upcoming locked-in sessions, reputation, and dataroom
//       engagement on the caller's published ventures (since a mentor
//       can also be a founder). Everything is the caller's own data,
//       so no cross-user leakage.
//
// Response:
//   earnings: MentorEarnings (with a 6-month filled trend)
//   reputation: MentorReputation
//   upcoming: next few scheduled sessions/office-hours (lightweight)
//   sellerReady: whether Stripe Connect charges are enabled

type SessionRow = {
  id: string; status: string; price_cents: number; application_fee_pct: number;
  paid_at: string | null; scheduled_at: string | null; topic: string;
  review_rating: number | null; review_body: string | null; reviewed_at: string | null;
  founder_user_id: string;
};

type SeatRow = {
  id: string; office_hours_id: string; status: string;
  paid_at: string | null; review_rating: number | null; review_body: string | null;
  reviewed_at: string | null; founder_user_id: string;
};

export async function GET(req: Request) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const token = bearerToken(req);
  if (!token) return Response.json({ ok: false, error: "missing_token" }, { status: 401 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const { data: u, error } = await sb.auth.getUser(token);
  if (error || !u?.user) return Response.json({ ok: false, error: "auth_failed" }, { status: 401 });
  const userId = u.user.id;
  const now = new Date();

  // ── Pull everything in parallel ───────────────────────────────────
  const [sessionsRes, offeringsRes, sellerRes] = await Promise.all([
    sb.from("mentor_sessions")
      .select("id, status, price_cents, application_fee_pct, paid_at, scheduled_at, topic, review_rating, review_body, reviewed_at, founder_user_id")
      .eq("mentor_user_id", userId),
    sb.from("mentor_office_hours")
      .select("id, title, scheduled_at, price_per_seat_cents, application_fee_pct, status")
      .eq("mentor_user_id", userId),
    sb.from("sellers").select("charges_enabled").eq("user_id", userId).maybeSingle(),
  ]);

  const sessions = (sessionsRes.data ?? []) as SessionRow[];
  const offerings = (offeringsRes.data ?? []) as Array<{ id: string; title: string; scheduled_at: string; price_per_seat_cents: number; application_fee_pct: number; status: string }>;
  const offeringById = new Map(offerings.map((o) => [o.id, o]));

  // Seats for the caller's offerings (one query scoped by the offering
  // id set).
  const offeringIds = offerings.map((o) => o.id);
  const seatsRes = offeringIds.length === 0
    ? { data: [] as SeatRow[] }
    : await sb.from("mentor_office_hours_seats")
        .select("id, office_hours_id, status, paid_at, review_rating, review_body, reviewed_at, founder_user_id")
        .in("office_hours_id", offeringIds);
  const seats = (seatsRes.data ?? []) as SeatRow[];

  // ── Build normalized earning events ───────────────────────────────
  const events: EarningEvent[] = [];

  for (const s of sessions) {
    const isFuture = s.scheduled_at ? new Date(s.scheduled_at).getTime() > now.getTime() : false;
    if (s.status === "refunded") {
      events.push({ source: "session", grossCents: s.price_cents, applicationFeePct: s.application_fee_pct, state: "refunded", at: s.paid_at ?? s.scheduled_at ?? now.toISOString() });
    } else if (s.status === "paid" && isFuture) {
      // Paid but session not yet held — count as upcoming locked-in.
      events.push({ source: "session", grossCents: s.price_cents, applicationFeePct: s.application_fee_pct, state: "upcoming", at: s.scheduled_at ?? now.toISOString() });
    } else if (s.status === "paid" || s.status === "completed" || s.status === "reviewed") {
      events.push({ source: "session", grossCents: s.price_cents, applicationFeePct: s.application_fee_pct, state: "earned", at: s.paid_at ?? now.toISOString() });
    }
    // requested / accepted / cancelled → no money moved, skip.
  }

  for (const seat of seats) {
    const o = offeringById.get(seat.office_hours_id);
    if (!o) continue;
    const isFuture = new Date(o.scheduled_at).getTime() > now.getTime();
    if (seat.status === "refunded") {
      events.push({ source: "office_hours", grossCents: o.price_per_seat_cents, applicationFeePct: o.application_fee_pct, state: "refunded", at: seat.paid_at ?? o.scheduled_at });
    } else if (seat.status === "paid" && isFuture) {
      events.push({ source: "office_hours", grossCents: o.price_per_seat_cents, applicationFeePct: o.application_fee_pct, state: "upcoming", at: o.scheduled_at });
    } else if (seat.status === "paid" || seat.status === "attended") {
      events.push({ source: "office_hours", grossCents: o.price_per_seat_cents, applicationFeePct: o.application_fee_pct, state: "earned", at: seat.paid_at ?? o.scheduled_at });
    }
    // pending / cancelled → skip.
  }

  const earningsRaw = aggregateEarnings(events);
  const trend: MonthBucket[] = fillTrend(earningsRaw.trend, now, 6);
  const earnings: MentorEarnings = { ...earningsRaw, trend };

  // ── Reputation (reuse Phase 69 aggregation) ──────────────────────
  const reviews: MentorReview[] = [
    ...sessions
      .filter((s) => s.review_rating != null && s.reviewed_at != null)
      .map((s) => ({
        source: "session" as const,
        rating: s.review_rating!,
        body: (s.review_body ?? "").trim(),
        reviewed_at: s.reviewed_at!,
        reviewer: null,
        context: s.topic.slice(0, 80),
      })),
    ...seats
      .filter((s) => s.review_rating != null && s.reviewed_at != null)
      .map((s) => ({
        source: "office_hours" as const,
        rating: s.review_rating!,
        body: (s.review_body ?? "").trim(),
        reviewed_at: s.reviewed_at!,
        reviewer: null,
        context: offeringById.get(s.office_hours_id)?.title ?? "Office hours",
      })),
  ];
  const reputation: MentorReputation = aggregateMentorReviews(reviews);

  // ── Upcoming: next scheduled sessions + offerings ────────────────
  const upcomingSessions = sessions
    .filter((s) => (s.status === "paid" || s.status === "accepted") && s.scheduled_at && new Date(s.scheduled_at).getTime() > now.getTime())
    .map((s) => ({ kind: "session" as const, id: s.id, title: s.topic.slice(0, 80), at: s.scheduled_at!, status: s.status }));
  const upcomingOfferings = offerings
    .filter((o) => o.status === "open" && new Date(o.scheduled_at).getTime() > now.getTime())
    .map((o) => {
      const filled = seats.filter((seat) => seat.office_hours_id === o.id && (seat.status === "paid" || seat.status === "attended" || seat.status === "pending")).length;
      return { kind: "office_hours" as const, id: o.id, title: o.title, at: o.scheduled_at, status: o.status, filled };
    });
  const upcoming = [...upcomingSessions, ...upcomingOfferings]
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
    .slice(0, 8);

  return Response.json({
    ok: true,
    earnings,
    reputation,
    upcoming,
    sellerReady: Boolean((sellerRes.data as { charges_enabled?: boolean } | null)?.charges_enabled),
    counts: {
      sessions: sessions.length,
      offerings: offerings.length,
      seats: seats.length,
    },
  });
}
