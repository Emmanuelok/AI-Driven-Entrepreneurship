import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { bearerToken } from "@/lib/workspace-auth";
import {
  toLedgerRows, filterLedger, summarizeLedger, groupLedgerByMonth,
  type RawSession, type RawSeat, type RawOffering, type LedgerSource, type LedgerStatus, type Counterparty,
} from "@/lib/payouts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — the caller's transaction ledger. Pulled from local DB (NO
//       Stripe calls), so this endpoint is fast and works offline of
//       Stripe. Supports filtering by source / status / date range
//       and cursor pagination.
//
// Query params:
//   ?source=session|office_hours
//   ?status=earned|upcoming|refunded
//   ?from=ISO    — inclusive lower bound on occurredAt
//   ?to=ISO      — inclusive upper bound
//   ?limit=50    — page size, capped at 200
//   ?offset=0    — for simple pagination
//
// Response:
//   { ok, total, rows, summary, months }
//
// summary applies to the FILTERED set; months is per-month grouping
// (also of the filtered set) for the dashboard's "scroll by month"
// view. rows is the paginated slice.

const VALID_SOURCES: LedgerSource[] = ["session", "office_hours"];
const VALID_STATUSES: LedgerStatus[] = ["earned", "upcoming", "refunded"];

function parseEnum<T extends string>(raw: string | null, valid: readonly T[]): T | undefined {
  if (!raw) return undefined;
  return (valid as readonly string[]).includes(raw) ? (raw as T) : undefined;
}

export async function GET(req: Request): Promise<Response> {
  if (!isSupabaseConfigured()) return Response.json({ ok: true, mode: "local", rows: [], total: 0, summary: null, months: [] });
  const token = bearerToken(req);
  if (!token) return Response.json({ ok: false, error: "missing_token" }, { status: 401 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const { data: u, error: e1 } = await sb.auth.getUser(token);
  if (e1 || !u?.user) return Response.json({ ok: false, error: "auth_failed" }, { status: 401 });
  const userId = u.user.id;

  const url = new URL(req.url);
  const source = parseEnum<LedgerSource>(url.searchParams.get("source"), VALID_SOURCES);
  const status = parseEnum<LedgerStatus>(url.searchParams.get("status"), VALID_STATUSES);
  const from = url.searchParams.get("from") ?? undefined;
  const to = url.searchParams.get("to") ?? undefined;
  const limit = Math.max(1, Math.min(200, parseInt(url.searchParams.get("limit") ?? "50", 10) || 50));
  const offset = Math.max(0, parseInt(url.searchParams.get("offset") ?? "0", 10) || 0);

  // Pull raw rows.
  const [sessionsRes, offeringsRes] = await Promise.all([
    sb.from("mentor_sessions")
      .select("id, status, price_cents, application_fee_pct, currency, paid_at, scheduled_at, topic, founder_user_id, stripe_payment_intent_id")
      .eq("mentor_user_id", userId),
    sb.from("mentor_office_hours")
      .select("id, title, scheduled_at, price_per_seat_cents, application_fee_pct, currency, status")
      .eq("mentor_user_id", userId),
  ]);

  const sessions = (sessionsRes.data ?? []) as RawSession[];
  const offerings = (offeringsRes.data ?? []) as Array<RawOffering & { status: string }>;
  const offeringIds = offerings.map((o) => o.id);

  const seatsRes = offeringIds.length === 0
    ? { data: [] as RawSeat[] }
    : await sb.from("mentor_office_hours_seats")
        .select("id, office_hours_id, status, paid_at, founder_user_id, stripe_payment_intent_id")
        .in("office_hours_id", offeringIds);
  const seats = (seatsRes.data ?? []) as RawSeat[];

  // Hydrate counterparty names.
  const counterpartyIds = Array.from(new Set([
    ...sessions.map((s) => s.founder_user_id),
    ...seats.map((s) => s.founder_user_id),
  ]));
  const counterpartyById = new Map<string, Counterparty>();
  if (counterpartyIds.length > 0) {
    const { data: profiles } = await sb
      .from("user_profiles")
      .select("user_id, display_name, slug")
      .in("user_id", counterpartyIds);
    for (const p of (profiles ?? []) as Array<{ user_id: string; display_name: string; slug: string | null }>) {
      counterpartyById.set(p.user_id, { display_name: p.display_name, slug: p.slug });
    }
  }

  const all = toLedgerRows({ sessions, seats, offerings, counterpartyById });
  const filtered = filterLedger(all, { source, status, from, to });
  const summary = summarizeLedger(filtered);
  const months = groupLedgerByMonth(filtered);
  const total = filtered.length;
  const page = filtered.slice(offset, offset + limit);

  return Response.json({
    ok: true,
    total,
    offset,
    limit,
    rows: page,
    summary,
    // Strip rows inside the month groups to keep the response small.
    // Callers that want the rows already have them in `rows`.
    months: months.map((m) => ({ month: m.month, netCents: m.netCents, count: m.rows.length })),
  });
}
