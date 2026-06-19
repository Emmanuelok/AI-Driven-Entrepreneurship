import { z } from "zod";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { bearerToken } from "@/lib/workspace-auth";
import { parseBody } from "@/lib/parse-body";
import { applicationFeePct } from "@/lib/stripe";
import { computeSessionPriceCents, isAllowedDuration } from "@/lib/mentor-session-state";
import { createNotification } from "@/lib/notifications-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST  — founder requests a session with a mentor.
//         Body: { mentorSlug, topic, durationMinutes, founderNotes? }
//         The mentor must (a) have account_type='mentor', (b) have
//         persona_data.hourlyRate set, and (c) have a Stripe Connect
//         account with charges_enabled=true. The price is locked in
//         at this moment from the mentor's hourly rate.
//
// GET   — list the caller's own sessions (mine: both as mentor and
//         as founder). Sorted by created_at desc.

const RequestBody = z.object({
  mentorSlug: z.string().regex(/^[a-z0-9-]{2,40}$/),
  topic: z.string().min(8).max(2000),
  durationMinutes: z.number().int().refine((n) => isAllowedDuration(n), {
    message: "Duration must be 15, 30, 45, 60, or 90 minutes.",
  }),
  founderNotes: z.string().max(2000).optional(),
});

async function resolveCaller(req: Request) {
  const token = bearerToken(req);
  if (!token) return { error: Response.json({ ok: false, error: "missing_token" }, { status: 401 }) };
  const sb = supabaseAdmin();
  if (!sb) return { error: Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 }) };
  const { data: u, error } = await sb.auth.getUser(token);
  if (error || !u?.user) return { error: Response.json({ ok: false, error: "auth_failed" }, { status: 401 }) };
  return { sb, user: u.user };
}

export async function GET(req: Request) {
  if (!isSupabaseConfigured()) return Response.json({ ok: true, mode: "local", results: [] });
  const r = await resolveCaller(req);
  if ("error" in r) return r.error;
  const { sb, user } = r;

  const { data } = await sb
    .from("mentor_sessions")
    .select("id, mentor_user_id, founder_user_id, status, duration_minutes, scheduled_at, topic, founder_notes, mentor_notes, price_cents, currency, application_fee_pct, paid_at, accepted_at, completed_at, cancelled_at, refunded_at, review_rating, review_body, reviewed_at, created_at, updated_at")
    .or(`mentor_user_id.eq.${user.id},founder_user_id.eq.${user.id}`)
    .order("created_at", { ascending: false })
    .limit(100);

  return Response.json({ ok: true, results: data ?? [] });
}

export async function POST(req: Request) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const r = await resolveCaller(req);
  if ("error" in r) return r.error;
  const { sb, user } = r;

  const parsed = await parseBody(req, RequestBody);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  // Resolve the mentor by slug — must be a mentor with a public
  // profile (otherwise booking would leak which profiles are mentors).
  const { data: mentorProfile } = await sb
    .from("user_profiles")
    .select("user_id, display_name, account_type, persona_data, is_public, contact_policy")
    .eq("slug", body.mentorSlug)
    .maybeSingle();
  const p = mentorProfile as {
    user_id: string;
    display_name: string;
    account_type: string;
    persona_data: Record<string, unknown>;
    is_public: boolean;
    contact_policy: string;
  } | null;
  if (!p || !p.is_public) return Response.json({ ok: false, error: "mentor_not_found" }, { status: 404 });
  if (p.account_type !== "mentor") return Response.json({ ok: false, error: "not_a_mentor" }, { status: 400 });
  if (p.contact_policy === "closed") return Response.json({ ok: false, error: "mentor_closed_to_contact" }, { status: 403 });
  if (p.user_id === user.id) return Response.json({ ok: false, error: "cannot_book_self" }, { status: 400 });

  // Mentor must have a Stripe Connect seller row with charges enabled.
  const { data: seller } = await sb
    .from("sellers")
    .select("stripe_account_id, charges_enabled")
    .eq("user_id", p.user_id)
    .maybeSingle();
  const s = seller as { stripe_account_id: string | null; charges_enabled: boolean } | null;
  if (!s || !s.charges_enabled) {
    return Response.json({ ok: false, error: "mentor_not_onboarded", message: "This mentor hasn't set up payments yet." }, { status: 400 });
  }

  // Price comes from persona_data.hourlyRate × duration. We lock it
  // into the row so the contract doesn't shift if the mentor edits
  // their rate later.
  const rate = (p.persona_data as { hourlyRate?: number }).hourlyRate;
  const priceCents = computeSessionPriceCents(rate, body.durationMinutes);
  if (priceCents == null) {
    return Response.json({ ok: false, error: "mentor_no_rate", message: "This mentor hasn't set an hourly rate yet." }, { status: 400 });
  }

  const { data: row, error } = await sb
    .from("mentor_sessions")
    .insert({
      mentor_user_id: p.user_id,
      founder_user_id: user.id,
      status: "requested",
      duration_minutes: body.durationMinutes,
      topic: body.topic,
      founder_notes: body.founderNotes ?? "",
      price_cents: priceCents,
      currency: "usd",
      application_fee_pct: applicationFeePct(),
    })
    .select("*")
    .single();
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  // Notify the mentor so they don't miss the request.
  void createNotification({
    userId: p.user_id,
    actorId: user.id,
    kind: "contact_request",
    targetKind: "contact",
    title: `New mentor session request`,
    body: body.topic.slice(0, 160),
    url: `/studio/mentor-sessions/${row.id}`,
  });

  return Response.json({ ok: true, session: row });
}
