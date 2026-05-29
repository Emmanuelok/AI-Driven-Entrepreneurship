import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lists the caller's refund requests, split by direction:
//   - outbox: requests *I* (as buyer) submitted
//   - inbox:  requests targeting products *I* own
//
// Used by the buyer-side "my requests" view and the seller-side
// refund inbox in Settings.

export async function GET(req: Request) {
  if (!isSupabaseConfigured()) return Response.json({ ok: true, mode: "local", inbox: [], outbox: [] });
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ ok: false, error: "missing_token" }, { status: 401 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const { data: u, error: e1 } = await sb.auth.getUser(token);
  if (e1 || !u?.user) return Response.json({ ok: false, error: "auth_failed" }, { status: 401 });
  const userId = u.user.id;

  // Outbox: I'm the buyer.
  const { data: outboxRows } = await sb.from("refund_requests")
    .select("id, kind, ref_id, amount_cents, currency, reason, status, created_at, updated_at, stripe_refund_id")
    .eq("buyer_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);

  // Inbox: I own the target. We pull both kinds in parallel.
  const [myCohorts, myBuilds] = await Promise.all([
    sb.from("cohorts").select("id").eq("owner_id", userId),
    sb.from("public_builds").select("slug").eq("owner_id", userId),
  ]);
  const cohortIds = (myCohorts.data ?? []).map((r) => (r as { id: string }).id);
  const buildSlugs = (myBuilds.data ?? []).map((r) => (r as { slug: string }).slug);

  type InboxRow = { id: string; kind: "cohort" | "build"; ref_id: string; buyer_id: string; amount_cents: number; currency: string; reason: string | null; status: string; created_at: string; updated_at: string };
  let inbox: InboxRow[] = [];
  if (cohortIds.length > 0 || buildSlugs.length > 0) {
    const refIds = [...cohortIds, ...buildSlugs];
    const { data } = await sb.from("refund_requests")
      .select("id, kind, ref_id, buyer_id, amount_cents, currency, reason, status, created_at, updated_at")
      .in("ref_id", refIds)
      .order("created_at", { ascending: false })
      .limit(100);
    inbox = (data ?? []) as InboxRow[];
  }

  return Response.json({ ok: true, outbox: outboxRows ?? [], inbox });
}
