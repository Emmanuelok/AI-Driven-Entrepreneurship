import { z } from "zod";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { bearerToken } from "@/lib/workspace-auth";
import { parseBody } from "@/lib/parse-body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET   — detail. Anyone can read open + completed offerings; the
//         response shape depends on who's looking:
//           - mentor: full roster (all seats)
//           - founder with a seat: own seat + offering details (+ location_url)
//           - other authed users: offering details only, count of seats
//           - anonymous: offering details only, count
// PATCH — mentor edits title / description / location / capacity (only
//         if capacity >= current paid count). Time + price are locked
//         once any seat has paid (audit), but otherwise editable.

const PatchBody = z.object({
  title: z.string().min(4).max(200).optional(),
  description: z.string().max(4000).optional(),
  scheduledAt: z.string().datetime().optional(),
  durationMinutes: z.number().int().refine((n) => [15, 30, 45, 60, 90, 120].includes(n)).optional(),
  capacity: z.number().int().min(2).max(50).optional(),
  pricePerSeatCents: z.number().int().min(0).max(500_000).optional(),
  locationUrl: z.string().url().optional().or(z.literal("")),
});

async function resolveViewer(req: Request) {
  const sb = supabaseAdmin();
  if (!sb) return { sb: null, user: null };
  const token = bearerToken(req);
  if (!token) return { sb, user: null };
  const { data: u } = await sb.auth.getUser(token);
  return { sb, user: u?.user ?? null };
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await params;
  const { sb, user } = await resolveViewer(req);
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const { data: offering } = await sb
    .from("mentor_office_hours")
    .select("id, mentor_user_id, title, description, scheduled_at, duration_minutes, capacity, price_per_seat_cents, currency, application_fee_pct, location_url, status, cancelled_at, completed_at, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();
  if (!offering) return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  const o = offering as {
    id: string; mentor_user_id: string; title: string; description: string;
    scheduled_at: string; duration_minutes: number; capacity: number;
    price_per_seat_cents: number; currency: string; application_fee_pct: number;
    location_url: string; status: "open" | "cancelled" | "completed";
    cancelled_at: string | null; completed_at: string | null;
    created_at: string; updated_at: string;
  };

  const isMentor = user?.id === o.mentor_user_id;

  // Cancelled offerings are visible only to the mentor + booked
  // founders (they need to see the refund state).
  if (o.status === "cancelled" && !isMentor) {
    // Founders with seats can still see it; anyone else 404s.
    if (!user) return Response.json({ ok: false, error: "not_found" }, { status: 404 });
    const { data: mySeat } = await sb
      .from("mentor_office_hours_seats")
      .select("id")
      .eq("office_hours_id", id)
      .eq("founder_user_id", user.id)
      .maybeSingle();
    if (!mySeat) return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  // Pull mentor profile + seats in parallel.
  const [mentorRes, seatsRes] = await Promise.all([
    sb.from("user_profiles")
      .select("user_id, display_name, slug, avatar_url, headline, country, city")
      .eq("user_id", o.mentor_user_id)
      .maybeSingle(),
    sb.from("mentor_office_hours_seats")
      .select("id, founder_user_id, status, founder_question, paid_at, refunded_at, cancelled_at, attended, review_rating, review_body, reviewed_at, created_at, updated_at")
      .eq("office_hours_id", id),
  ]);

  const allSeats = (seatsRes.data ?? []) as Array<{
    id: string; founder_user_id: string; status: "pending" | "paid" | "cancelled" | "refunded" | "attended";
    founder_question: string; paid_at: string | null; refunded_at: string | null;
    cancelled_at: string | null; attended: boolean;
    review_rating: number | null; review_body: string | null; reviewed_at: string | null;
    created_at: string; updated_at: string;
  }>;

  const filledCount = allSeats.filter((s) => s.status === "pending" || s.status === "paid" || s.status === "attended").length;
  const mySeat = user ? allSeats.find((s) => s.founder_user_id === user.id) ?? null : null;

  // Roster — only the mentor sees full names. Hydrate display_name +
  // slug for the roster.
  let roster: Array<Record<string, unknown>> = [];
  if (isMentor) {
    const founderIds = Array.from(new Set(allSeats.map((s) => s.founder_user_id)));
    let founderById = new Map<string, { display_name: string; slug: string | null; avatar_url: string | null }>();
    if (founderIds.length > 0) {
      const { data: founders } = await sb
        .from("user_profiles")
        .select("user_id, display_name, slug, avatar_url")
        .in("user_id", founderIds);
      founderById = new Map(((founders ?? []) as Array<{ user_id: string; display_name: string; slug: string | null; avatar_url: string | null }>)
        .map((f) => [f.user_id, { display_name: f.display_name, slug: f.slug, avatar_url: f.avatar_url }]));
    }
    roster = allSeats.map((s) => ({
      ...s,
      founder: founderById.get(s.founder_user_id) ?? { display_name: "Founder", slug: null, avatar_url: null },
    }));
  }

  // Strip location_url unless the viewer is the mentor or a paid attendee.
  const seeLocation = isMentor || (mySeat && (mySeat.status === "paid" || mySeat.status === "attended"));

  return Response.json({
    ok: true,
    offering: {
      ...o,
      location_url: seeLocation ? o.location_url : "",
      filled_count: filledCount,
    },
    mentor: mentorRes.data ?? null,
    mySeat,
    roster: isMentor ? roster : [],
    viewer: isMentor ? "mentor" : mySeat ? "attendee" : user ? "authed" : "anonymous",
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await params;
  const { sb, user } = await resolveViewer(req);
  if (!sb || !user) return Response.json({ ok: false, error: "auth_required" }, { status: 401 });

  const parsed = await parseBody(req, PatchBody);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const { data: offering } = await sb
    .from("mentor_office_hours")
    .select("id, mentor_user_id, status, capacity, price_per_seat_cents, scheduled_at")
    .eq("id", id)
    .maybeSingle();
  if (!offering) return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  const o = offering as { mentor_user_id: string; status: string; capacity: number; price_per_seat_cents: number; scheduled_at: string };
  if (o.mentor_user_id !== user.id) return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (o.status !== "open") return Response.json({ ok: false, error: "wrong_status" }, { status: 400 });

  // If any seat has paid, lock down scheduled_at + price.
  const { data: paidSeats } = await sb
    .from("mentor_office_hours_seats")
    .select("id, status")
    .eq("office_hours_id", id)
    .in("status", ["paid", "attended"]);
  const paidCount = ((paidSeats ?? []) as Array<{ status: string }>).length;
  if (paidCount > 0) {
    if (body.scheduledAt) return Response.json({ ok: false, error: "scheduled_locked" }, { status: 400 });
    if (body.pricePerSeatCents !== undefined && body.pricePerSeatCents !== o.price_per_seat_cents) {
      return Response.json({ ok: false, error: "price_locked" }, { status: 400 });
    }
    if (body.capacity !== undefined && body.capacity < paidCount) {
      return Response.json({ ok: false, error: "capacity_below_paid" }, { status: 400 });
    }
  }

  const patch: Record<string, unknown> = {};
  if (body.title !== undefined) patch.title = body.title;
  if (body.description !== undefined) patch.description = body.description;
  if (body.scheduledAt !== undefined) patch.scheduled_at = body.scheduledAt;
  if (body.durationMinutes !== undefined) patch.duration_minutes = body.durationMinutes;
  if (body.capacity !== undefined) patch.capacity = body.capacity;
  if (body.pricePerSeatCents !== undefined) patch.price_per_seat_cents = body.pricePerSeatCents;
  if (body.locationUrl !== undefined) patch.location_url = body.locationUrl;
  if (Object.keys(patch).length === 0) return Response.json({ ok: true, noop: true });

  const { data, error } = await sb
    .from("mentor_office_hours")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true, offering: data });
}
