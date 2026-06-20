import { z } from "zod";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { bearerToken } from "@/lib/workspace-auth";
import { parseBody } from "@/lib/parse-body";
import { applicationFeePct } from "@/lib/stripe";
import { isValidCapacity, isValidSeatPriceCents } from "@/lib/office-hours-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET   — list mentor office hours. Public. Defaults to upcoming +
//         status='open'. Filters: ?mentorSlug, ?upcoming=0/1, ?q,
//         ?mine=1 (caller's own offerings, including non-open).
//
// POST  — create an office-hours offering. Mentor-only. Mentor must
//         (a) have account_type='mentor' and (b) have a Stripe Connect
//         seller row with charges_enabled=true.

const CreateBody = z.object({
  title: z.string().min(4).max(200),
  description: z.string().max(4000).optional(),
  scheduledAt: z.string().datetime(),
  durationMinutes: z.number().int().refine((n) => [15, 30, 45, 60, 90, 120].includes(n), {
    message: "Duration must be 15, 30, 45, 60, 90, or 120 minutes.",
  }),
  capacity: z.number().int().refine(isValidCapacity, {
    message: "Capacity must be between 2 and 50.",
  }),
  pricePerSeatCents: z.number().int().refine(isValidSeatPriceCents, {
    message: "Price per seat must be 0..$5000.",
  }),
  locationUrl: z.string().url().optional().or(z.literal("")),
});

async function resolveCaller(req: Request) {
  const token = bearerToken(req);
  if (!token) return { error: Response.json({ ok: false, error: "missing_token" }, { status: 401 }) };
  const sb = supabaseAdmin();
  if (!sb) return { error: Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 }) };
  const { data: u } = await sb.auth.getUser(token);
  if (!u?.user) return { error: Response.json({ ok: false, error: "auth_failed" }, { status: 401 }) };
  return { sb, user: u.user };
}

export async function GET(req: Request) {
  if (!isSupabaseConfigured()) return Response.json({ ok: true, mode: "local", results: [] });
  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const url = new URL(req.url);
  const mentorSlug = url.searchParams.get("mentorSlug");
  const upcoming = url.searchParams.get("upcoming") !== "0";
  const q = url.searchParams.get("q") ?? "";
  const mine = url.searchParams.get("mine") === "1";
  const limit = Math.min(50, Number(url.searchParams.get("limit") ?? 30));

  // If filtering by mentor slug, resolve to user_id first.
  let mentorUserId: string | null = null;
  if (mentorSlug) {
    const { data: p } = await sb.from("user_profiles").select("user_id").eq("slug", mentorSlug).maybeSingle();
    mentorUserId = (p as { user_id?: string } | null)?.user_id ?? null;
    if (!mentorUserId) return Response.json({ ok: true, results: [] });
  }

  if (mine) {
    const token = bearerToken(req);
    if (!token) return Response.json({ ok: false, error: "missing_token" }, { status: 401 });
    const { data: u } = await sb.auth.getUser(token);
    if (!u?.user) return Response.json({ ok: false, error: "auth_failed" }, { status: 401 });
    mentorUserId = u.user.id;
  }

  let query = sb
    .from("mentor_office_hours")
    .select("id, mentor_user_id, title, description, scheduled_at, duration_minutes, capacity, price_per_seat_cents, currency, application_fee_pct, status, created_at, updated_at")
    .order("scheduled_at", { ascending: true })
    .limit(limit);

  if (!mine) query = query.eq("status", "open");
  if (mentorUserId) query = query.eq("mentor_user_id", mentorUserId);
  if (upcoming) query = query.gte("scheduled_at", new Date().toISOString());
  if (q) query = query.ilike("title", `%${q}%`);

  const { data, error } = await query;
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  const rows = (data ?? []) as Array<{ id: string; mentor_user_id: string; capacity: number }>;
  // Hydrate filled_count + mentor display in one parallel pair.
  const mentorIds = Array.from(new Set(rows.map((r) => r.mentor_user_id)));
  const offeringIds = rows.map((r) => r.id);
  const [seatCounts, mentors] = await Promise.all([
    offeringIds.length === 0
      ? Promise.resolve({ data: [] })
      : sb.from("mentor_office_hours_seats")
          .select("office_hours_id, status")
          .in("office_hours_id", offeringIds)
          .in("status", ["pending", "paid", "attended"]),
    mentorIds.length === 0
      ? Promise.resolve({ data: [] })
      : sb.from("user_profiles")
          .select("user_id, display_name, slug, avatar_url")
          .in("user_id", mentorIds),
  ]);

  const counts = new Map<string, number>();
  for (const s of (seatCounts.data ?? []) as Array<{ office_hours_id: string }>) {
    counts.set(s.office_hours_id, (counts.get(s.office_hours_id) ?? 0) + 1);
  }
  const mentorById = new Map<string, { display_name: string; slug: string | null; avatar_url: string | null }>();
  for (const m of (mentors.data ?? []) as Array<{ user_id: string; display_name: string; slug: string | null; avatar_url: string | null }>) {
    mentorById.set(m.user_id, { display_name: m.display_name, slug: m.slug, avatar_url: m.avatar_url });
  }

  const hydrated = rows.map((r) => ({
    ...r,
    filled_count: counts.get(r.id) ?? 0,
    mentor: mentorById.get(r.mentor_user_id) ?? null,
  }));

  return Response.json({ ok: true, results: hydrated });
}

export async function POST(req: Request) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const r = await resolveCaller(req);
  if ("error" in r) return r.error;
  const { sb, user } = r;

  const parsed = await parseBody(req, CreateBody);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  // Caller must be a mentor with charges enabled.
  const { data: profile } = await sb
    .from("user_profiles")
    .select("account_type, is_public")
    .eq("user_id", user.id)
    .maybeSingle();
  const p = profile as { account_type: string; is_public: boolean } | null;
  if (!p || p.account_type !== "mentor") {
    return Response.json({ ok: false, error: "not_a_mentor" }, { status: 403 });
  }

  const { data: seller } = await sb
    .from("sellers")
    .select("charges_enabled")
    .eq("user_id", user.id)
    .maybeSingle();
  const s = seller as { charges_enabled: boolean } | null;
  // Mentors with $0 price (free office hours) can publish without
  // Stripe being live; otherwise charges must be enabled.
  if (body.pricePerSeatCents > 0 && (!s || !s.charges_enabled)) {
    return Response.json({ ok: false, error: "stripe_not_onboarded" }, { status: 400 });
  }

  // Scheduled_at must be in the future (5-min skew tolerance).
  const scheduledAt = new Date(body.scheduledAt);
  if (scheduledAt.getTime() < Date.now() - 5 * 60_000) {
    return Response.json({ ok: false, error: "scheduled_in_past" }, { status: 400 });
  }

  const { data: row, error } = await sb
    .from("mentor_office_hours")
    .insert({
      mentor_user_id: user.id,
      title: body.title,
      description: body.description ?? "",
      scheduled_at: scheduledAt.toISOString(),
      duration_minutes: body.durationMinutes,
      capacity: body.capacity,
      price_per_seat_cents: body.pricePerSeatCents,
      currency: "usd",
      application_fee_pct: applicationFeePct(),
      location_url: body.locationUrl ?? "",
      status: "open",
    })
    .select("*")
    .single();
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  return Response.json({ ok: true, offering: row });
}
