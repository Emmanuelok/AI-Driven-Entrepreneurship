import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { sendEmail, emailShell } from "@/lib/email";
import { shouldEmail } from "@/lib/notification-prefs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Instructor weekly digest. Configure as a Vercel Cron in vercel.json:
//   { "path": "/api/cron/instructor-digest", "schedule": "0 14 * * 1" }
// (Monday 2pm UTC — most African + European timezones are mid-morning
// to mid-afternoon, students just started their week, instructors
// open their inbox).
//
// For each cohort, we email owner + instructors a rollup of the last
// 7 days: completions, top-stuck assignments, new discussion threads,
// pending questions, new enrollments. We skip cohorts where nothing
// happened so a digest never feels like noise.
//
// Requires CRON_SECRET; pass ?secret= to call.

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

  const sinceIso = new Date(Date.now() - 7 * DAY).toISOString();

  // Pull every cohort. At Sankofa scale this is fine; if it ever crosses
  // a few thousand we paginate.
  const { data: cohorts, error } = await sb.from("cohorts").select("id, name, institution, owner_id").limit(1000);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  const sent: { cohortId: string; email: string }[] = [];
  const skipped: { cohortId: string; reason: string }[] = [];
  const failed: { email: string; error: string }[] = [];

  for (const cohort of cohorts ?? []) {
    try {
      // Gather instructors (owner + cohort_members.role='instructor').
      const { data: members } = await sb.from("cohort_members")
        .select("user_id, role, email, display_name")
        .eq("cohort_id", cohort.id);
      const studentCount = (members ?? []).filter((m) => m.role === "student").length;
      const instructors = (members ?? []).filter((m) => m.role === "instructor" || m.user_id === cohort.owner_id);

      // Resolve owner email via auth.users since cohort_members may not
      // include the owner.
      const ownerEmail = await resolveEmail(sb, cohort.owner_id);
      const recipients = new Map<string, string>(); // userId → email
      if (ownerEmail) recipients.set(cohort.owner_id, ownerEmail);
      for (const m of instructors) {
        if (!recipients.has(m.user_id)) {
          const e = m.email ?? (await resolveEmail(sb, m.user_id));
          if (e) recipients.set(m.user_id, e);
        }
      }
      if (recipients.size === 0) { skipped.push({ cohortId: cohort.id, reason: "no_instructor_emails" }); continue; }

      // Weekly stats.
      const [progress7, threads7, newEnrolls, assignments] = await Promise.all([
        sb.from("cohort_progress").select("status, updated_at, user_id, assignment_id").eq("cohort_id", cohort.id).gte("updated_at", sinceIso),
        sb.from("cohort_threads").select("id, title, kind, resolved_at, created_at").eq("cohort_id", cohort.id).gte("created_at", sinceIso).order("created_at", { ascending: false }),
        sb.from("cohort_enrollments").select("user_id, paid_at").eq("cohort_id", cohort.id).gte("paid_at", sinceIso),
        sb.from("cohort_assignments").select("id, title").eq("cohort_id", cohort.id),
      ]);

      const completions = (progress7.data ?? []).filter((r) => r.status === "completed" || r.status === "submitted").length;
      const inProgress = (progress7.data ?? []).filter((r) => r.status === "in_progress").length;
      const newThreads = (threads7.data ?? []).length;
      const pendingQuestions = (threads7.data ?? []).filter((t) => t.kind === "question" && !t.resolved_at).slice(0, 5);
      const enrollments = (newEnrolls.data ?? []).length;

      // Skip silent weeks.
      if (completions === 0 && newThreads === 0 && enrollments === 0 && inProgress === 0) {
        skipped.push({ cohortId: cohort.id, reason: "silent_week" }); continue;
      }

      // Top stuck assignment: most in_progress rows older than 7d.
      const stuckByAssignment = new Map<string, number>();
      const { data: stuck } = await sb.from("cohort_progress")
        .select("assignment_id, status, updated_at")
        .eq("cohort_id", cohort.id)
        .eq("status", "in_progress")
        .lt("updated_at", sinceIso);
      for (const s of stuck ?? []) {
        stuckByAssignment.set(s.assignment_id, (stuckByAssignment.get(s.assignment_id) ?? 0) + 1);
      }
      const topStuck = Array.from(stuckByAssignment.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([aid, n]) => ({
          title: (assignments.data ?? []).find((a) => a.id === aid)?.title ?? "(removed)",
          n,
        }));

      const html = renderInstructorDigest({
        cohortName: cohort.name,
        institution: cohort.institution,
        studentCount,
        completions,
        inProgress,
        enrollments,
        newThreads,
        pendingQuestions: pendingQuestions.map((t) => t.title),
        topStuck,
        cohortUrl: `https://sankofa.studio/studio/cohorts/${cohort.id}`,
      });

      // One email per recipient — but skip anyone who's opted out.
      for (const [userId, email] of recipients) {
        if (!(await shouldEmail(userId, "email_instructor_digest"))) continue;
        const r = await sendEmail({
          to: email,
          subject: `${cohort.name} — weekly cohort digest`,
          html,
          tags: [{ name: "event", value: "instructor-digest" }, { name: "cohort", value: cohort.id.slice(0, 8) }],
        });
        if (r.ok) sent.push({ cohortId: cohort.id, email });
        else failed.push({ email, error: r.error || "unknown" });
      }
    } catch (e) {
      failed.push({ email: cohort.id, error: (e as Error).message });
    }
  }

  return Response.json({
    ok: true,
    cohortsScanned: cohorts?.length ?? 0,
    sentCount: sent.length,
    skippedCount: skipped.length,
    failedCount: failed.length,
    failed,
  });
}

async function resolveEmail(sb: NonNullable<ReturnType<typeof supabaseAdmin>>, userId: string): Promise<string | null> {
  try {
    const { data } = await sb.auth.admin.getUserById(userId);
    return data?.user?.email ?? null;
  } catch { return null; }
}

function renderInstructorDigest(d: {
  cohortName: string; institution: string | null; studentCount: number;
  completions: number; inProgress: number; enrollments: number; newThreads: number;
  pendingQuestions: string[]; topStuck: { title: string; n: number }[];
  cohortUrl: string;
}): string {
  const stuckList = d.topStuck.length === 0
    ? "<p style=\"color:#8aa39a;font-size:13px\">No assignments are flagged as stuck — students are flowing.</p>"
    : `<ul style="padding-left:18px;color:#e7efe9;font-size:14px">${d.topStuck.map((s) => `<li><strong>${escape(s.title)}</strong> — ${s.n} student${s.n === 1 ? "" : "s"} stuck &gt;7 days</li>`).join("")}</ul>`;

  const questionList = d.pendingQuestions.length === 0
    ? "<p style=\"color:#8aa39a;font-size:13px\">No unresolved questions this week. Quiet, or no one's asking.</p>"
    : `<ul style="padding-left:18px;color:#e7efe9;font-size:14px">${d.pendingQuestions.map((q) => `<li>${escape(q)}</li>`).join("")}</ul>`;

  const body = `
    <p style="color:#e7efe9;font-size:15px;line-height:1.5">
      <strong>${d.studentCount}</strong> student${d.studentCount === 1 ? "" : "s"}${d.institution ? ` · ${escape(d.institution)}` : ""}. Here&rsquo;s what shifted this past week.
    </p>
    <table cellpadding="0" cellspacing="0" style="width:100%;margin:18px 0">
      <tr>
        ${statCell("Completions", String(d.completions), "#2cc295")}
        ${statCell("In progress", String(d.inProgress), "#f4a949")}
        ${statCell("New threads", String(d.newThreads), "#2cc295")}
        ${statCell("New enrollments", String(d.enrollments), "#9b8cff")}
      </tr>
    </table>

    <h3 style="color:#f4a949;font-size:13px;text-transform:uppercase;letter-spacing:0.18em;margin:24px 0 8px">Top stuck</h3>
    ${stuckList}

    <h3 style="color:#f4a949;font-size:13px;text-transform:uppercase;letter-spacing:0.18em;margin:24px 0 8px">Pending questions (up to 5)</h3>
    ${questionList}
  `;

  return emailShell({
    heading: `${d.cohortName} — your cohort this week`,
    body,
    cta: { href: d.cohortUrl, label: "Open the cohort" },
    footer: "You receive this because you own or co-instruct this cohort. To stop, message the Sankofa team or remove yourself from the cohort.",
  });
}

function statCell(label: string, value: string, color: string): string {
  return `
    <td style="padding:0 6px;width:25%">
      <div style="background:#141d1a;border:1px solid #2a3a35;border-radius:12px;padding:12px 10px;text-align:center">
        <div style="color:#8aa39a;font-size:9px;text-transform:uppercase;letter-spacing:0.2em">${label}</div>
        <div style="color:${color};font-size:24px;font-weight:600;margin-top:4px">${value}</div>
      </div>
    </td>`;
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]!));
}
