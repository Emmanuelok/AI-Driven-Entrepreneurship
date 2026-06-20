import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { sendEmail, emailShell } from "@/lib/email";
import { shouldEmail } from "@/lib/notification-prefs";
import { buildDigestForUser } from "@/lib/digest-data";
import { renderDigestBodyHtml, renderDigestText } from "@/lib/digest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Engagement digest fan-out (Phase 73). Configure as a Vercel Cron:
//   { "crons": [{ "path": "/api/cron/engagement-digest", "schedule": "0 14 * * 1" }] }
// Runs Monday 2pm UTC. Requires CRON_SECRET (?secret=).
//
// Distinct from the existing weekly-digest (which reads the local-first
// sankofa_main mirror): this one reads the v2 money + dataroom tables
// and sends each mentor/founder their composed engagement digest
// (Phase 73). Skips users with an empty digest or who opted out of the
// activity-digest email category.
//
// Candidate set: every user who is EITHER a mentor with sessions/
// offerings OR a founder whose published venture has at least one
// dataroom grant. We cap the run for safety.

const BASE = process.env.NEXT_PUBLIC_SITE_URL || "https://sankofa.studio";
const MAX_USERS = 1000;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = url.searchParams.get("secret");
  const expected = process.env.CRON_SECRET;
  if (!expected || secret !== expected) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, mode: "local", message: "Supabase not configured — digest is a no-op." });
  }
  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const windowDays = Math.max(1, Math.min(30, parseInt(url.searchParams.get("days") ?? "7", 10) || 7));
  const dryRun = url.searchParams.get("dry") === "1";

  // ── Collect candidate user ids ───────────────────────────────────
  const candidates = new Set<string>();

  const [sessionMentors, offeringMentors, ventures] = await Promise.all([
    sb.from("mentor_sessions").select("mentor_user_id").limit(5000),
    sb.from("mentor_office_hours").select("mentor_user_id").limit(5000),
    sb.from("public_ventures").select("slug, owner_id").limit(5000),
  ]);

  for (const r of (sessionMentors.data ?? []) as Array<{ mentor_user_id: string }>) candidates.add(r.mentor_user_id);
  for (const r of (offeringMentors.data ?? []) as Array<{ mentor_user_id: string }>) candidates.add(r.mentor_user_id);

  // Founders only count when their venture actually has a grant —
  // otherwise the founder section is empty and we'd skip anyway. Pull
  // the set of slugs with grants, then add their owners.
  const ventureRows = (ventures.data ?? []) as Array<{ slug: string; owner_id: string }>;
  if (ventureRows.length > 0) {
    const ownerBySlug = new Map(ventureRows.map((v) => [v.slug, v.owner_id]));
    const { data: grantSlugs } = await sb
      .from("venture_dataroom_grants")
      .select("venture_slug")
      .in("venture_slug", ventureRows.map((v) => v.slug))
      .limit(5000);
    for (const g of (grantSlugs ?? []) as Array<{ venture_slug: string }>) {
      const owner = ownerBySlug.get(g.venture_slug);
      if (owner) candidates.add(owner);
    }
  }

  const userIds = Array.from(candidates).slice(0, MAX_USERS);

  const sent: string[] = [];
  const skipped: { reason: string; count: number } = { reason: "empty_or_optout", count: 0 };
  const failed: { userId: string; error: string }[] = [];

  for (const userId of userIds) {
    try {
      // Opt-out gate (reuses the general activity-digest channel).
      if (!(await shouldEmail(userId, "email_student_digest"))) { skipped.count++; continue; }

      // Display name + email.
      const { data: profile } = await sb.from("user_profiles").select("display_name").eq("user_id", userId).maybeSingle();
      const { data: authUser } = await sb.auth.admin.getUserById(userId);
      const email = authUser?.user?.email;
      if (!email) { skipped.count++; continue; }
      const name = (profile as { display_name?: string } | null)?.display_name?.trim() || email.split("@")[0];

      const digest = await buildDigestForUser(sb, userId, { displayName: name, baseUrl: BASE, windowDays });
      if (digest.isEmpty) { skipped.count++; continue; }
      if (dryRun) { sent.push(email); continue; }

      const html = emailShell({
        heading: digest.heading,
        body: renderDigestBodyHtml(digest),
        cta: digest.cta,
        footer: "Your weekly Sankofa engagement digest. Manage email preferences in Settings.",
      });
      const r = await sendEmail({
        to: email,
        subject: digest.subject,
        html,
        text: renderDigestText(digest),
        tags: [{ name: "event", value: "engagement-digest" }],
      });
      if (r.ok) sent.push(email);
      else failed.push({ userId, error: r.error || "unknown" });
    } catch (e) {
      failed.push({ userId, error: (e as Error).message });
    }
  }

  return Response.json({
    ok: true,
    candidateCount: userIds.length,
    sentCount: sent.length,
    skippedCount: skipped.count,
    failed,
    dryRun,
  });
}
