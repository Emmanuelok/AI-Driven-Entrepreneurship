import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Nightly ux_events retention sweep.
//
// The table accretes monotonically — every companion click, every mcp
// search, every starter tap. We don't need history past ~3 months for
// threshold tuning, so trim everything older.
//
// Retention is configurable via TELEMETRY_RETENTION_DAYS (default 90).
// Operator can raise it for a specific investigation, then drop it
// back — the next sweep catches up.

const DAY = 86_400_000;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = url.searchParams.get("secret");
  const expected = process.env.CRON_SECRET;
  if (!expected || secret !== expected) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const days = Math.max(1, Math.min(365, parseInt(process.env.TELEMETRY_RETENTION_DAYS ?? "90") || 90));
  const cutoffIso = new Date(Date.now() - days * DAY).toISOString();

  // Supabase delete returns the deleted rows when you ask. Count via
  // head=true keeps us from shipping rows over the wire.
  const { error, count } = await sb.from("ux_events")
    .delete({ count: "exact" })
    .lt("created_at", cutoffIso);

  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  return Response.json({
    ok: true,
    retentionDays: days,
    cutoff: cutoffIso,
    deleted: count ?? 0,
  });
}
