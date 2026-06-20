import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { sendEmail, emailShell } from "@/lib/email";
import { shouldEmail } from "@/lib/notification-prefs";
import {
  normalizeCriteria, filterMatchingVentures, summarizeCriteria,
  type MatchableVenture, type Stage,
} from "@/lib/saved-search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Weekly saved-search alerts fan-out (Phase 75). Vercel cron:
//   { "path": "/api/cron/saved-search-alerts", "schedule": "0 16 * * 1" }
// Mon 16:00 UTC. Requires CRON_SECRET (?secret=).
//
// For each saved search with alert_cadence='weekly', runs the
// search against ventures updated since last_run_at and emails a
// digest of new matches to the investor. Empty-match runs still
// bump last_run_at so we don't re-scan the same window forever, but
// last_alert_at only advances on a real delivery (gives the saved-
// searches UI a clean "last alerted" timestamp distinct from "last
// scanned").
//
// Respects the per-user email_student_digest opt-out (reusing the
// general activity-digest channel) so a single Settings toggle mutes
// both the engagement digest AND saved-search alerts.

const BASE = process.env.NEXT_PUBLIC_SITE_URL || "https://sankofa.studio";
const MAX_SEARCHES = 2000;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = url.searchParams.get("secret");
  const expected = process.env.CRON_SECRET;
  if (!expected || secret !== expected) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, mode: "local", message: "Supabase not configured." });
  }
  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const dryRun = url.searchParams.get("dry") === "1";
  const now = new Date();

  const { data: searches } = await sb
    .from("investor_saved_searches")
    .select("id, user_id, title, criteria, last_run_at, alert_cadence, match_count_total")
    .eq("alert_cadence", "weekly")
    .limit(MAX_SEARCHES);

  if (!searches || searches.length === 0) {
    return Response.json({ ok: true, scanned: 0, sent: 0 });
  }

  let sentCount = 0;
  let emptyCount = 0;
  const failed: Array<{ id: string; error: string }> = [];

  for (const raw of searches as Array<{ id: string; user_id: string; title: string; criteria: unknown; last_run_at: string | null; match_count_total: number }>) {
    try {
      const criteria = normalizeCriteria(raw.criteria as Record<string, unknown>);
      const since = raw.last_run_at ?? new Date(now.getTime() - 7 * 86_400_000).toISOString();

      // Pull candidates updated since last run.
      const { data: vrows } = await sb
        .from("public_ventures")
        .select("slug, payload, sectors, stage, is_raising, raising_amount_usd, region, updated_at")
        .gte("updated_at", since)
        .order("updated_at", { ascending: false })
        .limit(500);

      const candidates: MatchableVenture[] = (vrows ?? []).map((r) => {
        const v = r as { slug: string; payload: Record<string, unknown>; sectors: string[] | null; stage: string | null; is_raising: boolean; raising_amount_usd: number | null; region: string | null; updated_at: string };
        return {
          slug: v.slug,
          title: String(v.payload?.title ?? v.slug),
          tagline: String(v.payload?.tagline ?? ""),
          sectors: v.sectors ?? [],
          stage: (v.stage ?? null) as Stage | null,
          is_raising: v.is_raising,
          raising_amount_usd: v.raising_amount_usd,
          region: v.region,
          updated_at: v.updated_at,
        };
      });
      const matches = filterMatchingVentures(candidates, criteria);

      if (matches.length === 0) {
        emptyCount++;
        if (!dryRun) {
          await sb.from("investor_saved_searches").update({ last_run_at: now.toISOString() }).eq("id", raw.id);
        }
        continue;
      }

      // Respect opt-out.
      if (!(await shouldEmail(raw.user_id, "email_student_digest"))) {
        if (!dryRun) {
          await sb.from("investor_saved_searches").update({ last_run_at: now.toISOString() }).eq("id", raw.id);
        }
        continue;
      }

      // Email address.
      const { data: authUser } = await sb.auth.admin.getUserById(raw.user_id);
      const email = authUser?.user?.email;
      if (!email) continue;

      // Compose.
      const summary = summarizeCriteria(criteria);
      const subject = matches.length === 1
        ? `1 new venture matched "${raw.title}"`
        : `${matches.length} new ventures matched "${raw.title}"`;
      const heading = `${matches.length} new ${matches.length === 1 ? "venture" : "ventures"} match your thesis`;
      const bodyHtml = renderMatchesHtml(matches.slice(0, 10), summary, BASE);

      if (!dryRun) {
        const r = await sendEmail({
          to: email,
          subject,
          html: emailShell({
            heading,
            body: bodyHtml,
            cta: { href: `${BASE}/studio/investor/saved`, label: "Open your saved searches" },
            footer: "You're getting this because you saved a search on Sankofa Studio. Pause or delete it in Settings.",
          }),
          tags: [{ name: "event", value: "saved-search-alert" }],
        });
        if (!r.ok) { failed.push({ id: raw.id, error: r.error || "send_failed" }); continue; }

        await sb.from("investor_saved_searches").update({
          last_run_at: now.toISOString(),
          last_alert_at: now.toISOString(),
          match_count_total: (raw.match_count_total ?? 0) + matches.length,
        }).eq("id", raw.id);
      }
      sentCount++;
    } catch (e) {
      failed.push({ id: raw.id, error: (e as Error).message });
    }
  }

  return Response.json({
    ok: true,
    scanned: searches.length,
    sent: sentCount,
    empty: emptyCount,
    failed,
    dryRun,
  });
}

function renderMatchesHtml(matches: MatchableVenture[], summary: string, base: string): string {
  function esc(s: string): string {
    return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[c]!));
  }
  const intro = `<p>Your saved search <strong>${esc(summary)}</strong> picked up new matches this week.</p>`;
  const list = matches.map((m) => {
    const ask = m.raising_amount_usd ? ` · raising $${Math.round(m.raising_amount_usd / 1000)}k` : "";
    const region = m.region ? ` · ${esc(m.region)}` : "";
    const stage = m.stage ? ` · ${esc(String(m.stage))}` : "";
    const url = `${base}/v/${m.slug}`;
    return `<p style="margin-top:14px;"><a href="${url}" style="color:#2cc295; text-decoration:none; font-weight:600;">${esc(m.title)}</a><br/><span style="color:#cfe0d8; font-size:14px;">${esc(m.tagline)}</span><br/><span style="color:#6b8079; font-size:12px;">${stage}${region}${ask}</span></p>`;
  }).join("\n");
  return intro + list;
}
