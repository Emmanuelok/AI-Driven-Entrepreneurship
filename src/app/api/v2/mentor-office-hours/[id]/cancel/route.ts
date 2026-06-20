import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { bearerToken } from "@/lib/workspace-auth";
import { createNotification } from "@/lib/notifications-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST — mentor cancels the whole offering. We:
//   1. Flip the offering to status='cancelled'.
//   2. Flip every pending seat to 'cancelled' (no money to return).
//   3. Mark every paid seat 'refunded' in our DB. The actual Stripe
//      refund still needs to happen — for now this leaves a marker
//      that the founder's UI shows "refund pending"; out-of-band the
//      operator processes the refund via Stripe dashboard or the
//      existing refund_requests pipeline.
//   4. Notify each affected founder.

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await ctx.params;

  const token = bearerToken(req);
  if (!token) return Response.json({ ok: false, error: "auth_required" }, { status: 401 });
  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });
  const { data: u } = await sb.auth.getUser(token);
  if (!u?.user) return Response.json({ ok: false, error: "auth_failed" }, { status: 401 });

  const { data: offering } = await sb
    .from("mentor_office_hours")
    .select("id, mentor_user_id, status, title")
    .eq("id", id)
    .maybeSingle();
  if (!offering) return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  const o = offering as { id: string; mentor_user_id: string; status: string; title: string };
  if (o.mentor_user_id !== u.user.id) return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (o.status !== "open") return Response.json({ ok: false, error: "wrong_status" }, { status: 400 });

  const now = new Date().toISOString();

  await sb
    .from("mentor_office_hours")
    .update({ status: "cancelled", cancelled_at: now })
    .eq("id", id);

  await sb
    .from("mentor_office_hours_seats")
    .update({ status: "cancelled", cancelled_at: now })
    .eq("office_hours_id", id)
    .eq("status", "pending");

  const { data: paidSeats } = await sb
    .from("mentor_office_hours_seats")
    .update({ status: "refunded", refunded_at: now })
    .eq("office_hours_id", id)
    .in("status", ["paid", "attended"])
    .select("founder_user_id");

  // Notify each impacted founder. Best-effort.
  const ids = new Set<string>(((paidSeats ?? []) as Array<{ founder_user_id: string }>).map((r) => r.founder_user_id));
  // Also notify pending-cancelled founders.
  const { data: pendingFounders } = await sb
    .from("mentor_office_hours_seats")
    .select("founder_user_id")
    .eq("office_hours_id", id)
    .eq("status", "cancelled")
    .eq("cancelled_at", now);
  for (const r of ((pendingFounders ?? []) as Array<{ founder_user_id: string }>)) ids.add(r.founder_user_id);

  await Promise.all(Array.from(ids).map((founderUserId) =>
    createNotification({
      userId: founderUserId,
      actorId: u.user.id,
      kind: "verification",
      targetKind: "contact",
      title: `Office hours cancelled: ${o.title}`,
      body: "The mentor cancelled this session. Refund pending if you paid.",
      url: `/studio/office-hours/${id}`,
    }),
  ));

  return Response.json({ ok: true, refunded: ids.size });
}
