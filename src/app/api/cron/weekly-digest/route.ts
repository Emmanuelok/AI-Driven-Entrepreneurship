import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { sendEmail, emailShell } from "@/lib/email";
import { shouldEmail } from "@/lib/notification-prefs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Weekly digest. Configure as a Vercel Cron (vercel.json):
//   { "crons": [{ "path": "/api/cron/weekly-digest", "schedule": "0 18 * * 0" }] }
// Runs Sunday 6pm UTC. Requires CRON_SECRET env var; the cron caller
// sends it as ?secret= so random visitors can't trigger fan-out emails.
//
// Aggregates each user's activity over the past 7 days from sankofa_main
// (interviews, MVP tasks done) + ai_usage (total spend) and sends a
// templated email via /api/notify. No-ops if Supabase or Resend isn't
// configured.

export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = url.searchParams.get("secret");
  const expected = process.env.CRON_SECRET;
  if (expected && secret !== expected) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, mode: "local", message: "Supabase not configured — digest is a no-op." });
  }
  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin unavailable" }, { status: 500 });

  const sinceIso = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const sent: string[] = [];
  const failed: { email: string; error: string }[] = [];

  // Pull all users' main store + aggregate. Real production would
  // paginate; for now we cap to 500 users per run.
  const { data: rows, error } = await sb
    .from("sankofa_main")
    .select("user_id, data, updated_at")
    .gte("updated_at", sinceIso)
    .limit(500);

  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  for (const row of rows ?? []) {
    try {
      const data = row.data as { user?: { email?: string; name?: string }; ventures?: Array<{ name: string; interviews?: unknown[]; mvpTasks?: { done: boolean }[] }>; streak?: number };
      const email = data.user?.email;
      if (!email) continue;

      let interviews = 0;
      let shipped = 0;
      let topVenture = "";
      let topShip = 0;
      for (const v of data.ventures ?? []) {
        interviews += (v.interviews ?? []).length;
        const s = (v.mvpTasks ?? []).filter((t) => t.done).length;
        shipped += s;
        if (s > topShip) { topShip = s; topVenture = v.name; }
      }

      // AI spend for this user this week.
      const { data: usage } = await sb
        .from("ai_usage")
        .select("cost_usd")
        .eq("user_id", row.user_id)
        .gte("created_at", sinceIso);
      const aiSpend = (usage ?? []).reduce((s, u) => s + Number(u.cost_usd || 0), 0);
      const aiCalls = (usage ?? []).length;

      // Skip silent weeks — nothing meaningful happened.
      if (interviews === 0 && shipped === 0 && aiCalls === 0) continue;

      // Skip when the user has opted out.
      if (!(await shouldEmail(row.user_id, "email_student_digest"))) continue;

      const body = emailShell({
        heading: `Your Sankofa week — ${shipped} shipped`,
        body: `<p>You logged <strong>${interviews}</strong> interviews, shipped <strong>${shipped}</strong> MVP tasks, and ran <strong>${aiCalls}</strong> AI calls (about $${aiSpend.toFixed(2)}).</p><p>Most-active venture: <strong>${topVenture || "—"}</strong>. Streak: ${data.streak ?? 0} days.</p>`,
        cta: { href: "https://sankofa.studio/studio", label: "Open your studio" },
      });

      const r = await sendEmail({
        to: email,
        subject: `Sankofa weekly — ${shipped} thing${shipped === 1 ? "" : "s"} shipped`,
        html: body,
        tags: [{ name: "event", value: "weekly-digest" }],
      });
      if (r.ok) sent.push(email);
      else failed.push({ email, error: r.error || "unknown" });
    } catch (e) {
      failed.push({ email: row.user_id, error: (e as Error).message });
    }
  }

  return Response.json({ ok: true, sentCount: sent.length, failed, scannedUsers: rows?.length ?? 0 });
}
