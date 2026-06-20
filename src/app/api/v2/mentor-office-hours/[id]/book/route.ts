import { z } from "zod";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { bearerToken } from "@/lib/workspace-auth";
import { parseBody } from "@/lib/parse-body";
import { canBookSeat } from "@/lib/office-hours-state";
import { createNotification } from "@/lib/notifications-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST — founder books a seat. Creates a 'pending' row. Capacity is
// checked against the live count (pending + paid + attended). The
// founder then hits /seats/[seatId]/checkout to pay. Free offerings
// (price=0) skip Stripe — the seat is flipped straight to 'paid'.

const Body = z.object({
  question: z.string().max(1000).optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await params;

  const token = bearerToken(req);
  if (!token) return Response.json({ ok: false, error: "auth_required" }, { status: 401 });
  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });
  const { data: u } = await sb.auth.getUser(token);
  if (!u?.user) return Response.json({ ok: false, error: "auth_failed" }, { status: 401 });

  const parsed = await parseBody(req, Body);
  if (!parsed.ok) return parsed.response;

  // Pull offering + all live seats.
  const [offRes, seatsRes] = await Promise.all([
    sb.from("mentor_office_hours")
      .select("id, mentor_user_id, status, scheduled_at, capacity, price_per_seat_cents, title")
      .eq("id", id)
      .maybeSingle(),
    sb.from("mentor_office_hours_seats")
      .select("status, founder_user_id")
      .eq("office_hours_id", id),
  ]);
  const offering = offRes.data as {
    id: string; mentor_user_id: string; status: "open" | "cancelled" | "completed";
    scheduled_at: string; capacity: number; price_per_seat_cents: number; title: string;
  } | null;
  if (!offering) return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  if (offering.mentor_user_id === u.user.id) {
    return Response.json({ ok: false, error: "cannot_book_own" }, { status: 400 });
  }
  const seats = (seatsRes.data ?? []) as Array<{ status: "pending" | "paid" | "cancelled" | "refunded" | "attended"; founder_user_id: string }>;

  const check = canBookSeat({
    offering: { status: offering.status, scheduled_at: offering.scheduled_at, capacity: offering.capacity },
    seats,
    founderUserId: u.user.id,
  });
  if (!check.ok) {
    return Response.json({ ok: false, error: check.reason }, { status: 400 });
  }

  // Free? Skip the pending step.
  const free = offering.price_per_seat_cents === 0;
  const { data: seat, error } = await sb
    .from("mentor_office_hours_seats")
    .insert({
      office_hours_id: id,
      founder_user_id: u.user.id,
      status: free ? "paid" : "pending",
      paid_at: free ? new Date().toISOString() : null,
      founder_question: parsed.data.question ?? "",
    })
    .select("*")
    .single();
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  // Notify the mentor.
  void createNotification({
    userId: offering.mentor_user_id,
    actorId: u.user.id,
    kind: "contact_request",
    targetKind: "contact",
    title: free ? `New attendee: ${offering.title}` : `New booking request: ${offering.title}`,
    body: parsed.data.question?.slice(0, 160) ?? "",
    url: `/studio/office-hours/${id}`,
  });

  return Response.json({ ok: true, seat });
}
