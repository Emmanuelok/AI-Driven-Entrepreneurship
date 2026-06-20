import { z } from "zod";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { bearerToken } from "@/lib/workspace-auth";
import { parseBody } from "@/lib/parse-body";
import { canTransitionSeat, type SeatStatus } from "@/lib/office-hours-state";
import { createNotification } from "@/lib/notifications-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PATCH — seat-level transitions:
//   - founder: cancel a pending seat, leave a post-session review
//   - mentor: mark attended, refund
//
// Body shape: { action: "cancel" | "attended" | "refund" | "review", ... }

const PatchBody = z.discriminatedUnion("action", [
  z.object({ action: z.literal("cancel") }),
  z.object({ action: z.literal("attended") }),
  z.object({ action: z.literal("refund") }),
  z.object({ action: z.literal("review"), rating: z.number().int().min(1).max(5), body: z.string().max(2000).optional() }),
]);

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string; seatId: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id, seatId } = await ctx.params;

  const token = bearerToken(req);
  if (!token) return Response.json({ ok: false, error: "auth_required" }, { status: 401 });
  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });
  const { data: u } = await sb.auth.getUser(token);
  if (!u?.user) return Response.json({ ok: false, error: "auth_failed" }, { status: 401 });

  const parsed = await parseBody(req, PatchBody);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const { data: seatRow } = await sb
    .from("mentor_office_hours_seats")
    .select("id, office_hours_id, founder_user_id, status, stripe_payment_intent_id")
    .eq("id", seatId)
    .eq("office_hours_id", id)
    .maybeSingle();
  if (!seatRow) return Response.json({ ok: false, error: "seat_not_found" }, { status: 404 });
  const seat = seatRow as { id: string; office_hours_id: string; founder_user_id: string; status: SeatStatus; stripe_payment_intent_id: string | null };

  const { data: off } = await sb
    .from("mentor_office_hours")
    .select("id, mentor_user_id, title")
    .eq("id", id)
    .maybeSingle();
  if (!off) return Response.json({ ok: false, error: "offering_not_found" }, { status: 404 });
  const offering = off as { id: string; mentor_user_id: string; title: string };

  const isMentor = offering.mentor_user_id === u.user.id;
  const isFounder = seat.founder_user_id === u.user.id;
  if (!isMentor && !isFounder) return Response.json({ ok: false, error: "forbidden" }, { status: 403 });

  if (body.action === "cancel") {
    // Pre-pay cancel by either party.
    if (!canTransitionSeat(seat.status, "cancelled", isFounder ? "founder" : "mentor")) {
      return Response.json({ ok: false, error: "wrong_status" }, { status: 400 });
    }
    const { error } = await sb
      .from("mentor_office_hours_seats")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("id", seatId);
    if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
    return Response.json({ ok: true });
  }

  if (body.action === "attended") {
    if (!isMentor) return Response.json({ ok: false, error: "mentor_only" }, { status: 403 });
    if (!canTransitionSeat(seat.status, "attended", "mentor")) {
      return Response.json({ ok: false, error: "wrong_status" }, { status: 400 });
    }
    const { error } = await sb
      .from("mentor_office_hours_seats")
      .update({ status: "attended", attended: true })
      .eq("id", seatId);
    if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
    return Response.json({ ok: true });
  }

  if (body.action === "refund") {
    if (!isMentor) return Response.json({ ok: false, error: "mentor_only" }, { status: 403 });
    if (!canTransitionSeat(seat.status, "refunded", "mentor")) {
      return Response.json({ ok: false, error: "wrong_status" }, { status: 400 });
    }
    // Mark refunded in our DB. Actual Stripe refund happens out-of-band
    // via the existing /refund-decide pipeline that runs on the
    // payment_intent. The webhook listens for charge.refunded and will
    // idempotently keep this in sync.
    const { error } = await sb
      .from("mentor_office_hours_seats")
      .update({ status: "refunded", refunded_at: new Date().toISOString() })
      .eq("id", seatId);
    if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

    void createNotification({
      userId: seat.founder_user_id,
      actorId: u.user.id,
      kind: "verification",
      targetKind: "contact",
      title: `Refunded: ${offering.title}`,
      body: `The mentor refunded your seat.`,
      url: `/studio/office-hours/${offering.id}`,
    });

    return Response.json({ ok: true });
  }

  if (body.action === "review") {
    if (!isFounder) return Response.json({ ok: false, error: "founder_only" }, { status: 403 });
    if (seat.status !== "attended" && seat.status !== "paid") {
      return Response.json({ ok: false, error: "wrong_status" }, { status: 400 });
    }
    const { error } = await sb
      .from("mentor_office_hours_seats")
      .update({
        review_rating: body.rating,
        review_body: body.body ?? "",
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", seatId);
    if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
    return Response.json({ ok: true });
  }

  return Response.json({ ok: false, error: "unknown_action" }, { status: 400 });
}
