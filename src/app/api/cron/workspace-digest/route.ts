import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { sendEmail, emailShell } from "@/lib/email";
import { shouldEmail } from "@/lib/notification-prefs";
import { relativeDue, setByLabel } from "@/lib/deadline-schedule";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Weekly workspace digest. Vercel cron (vercel.json): Monday 13:00 UTC.
//
// For every member of any workspace, emails a personal roll-up: their
// deadlines coming due in the next 14 days (assigned to them OR
// workspace-wide) and their open task count, grouped by workspace. Skips
// users with nothing upcoming, and honors the email_student_digest
// opt-out (reused — it's the learner-facing weekly email).
//
// Efficiency: a handful of bulk queries grouped in memory rather than
// N-per-user. Bounded to keep a single run cheap.

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

  const now = Date.now();
  const horizonIso = new Date(now + 14 * DAY).toISOString();

  // 1. Every membership (cap to keep the run bounded).
  const { data: members } = await sb
    .from("workspace_members")
    .select("user_id, workspace_id, email")
    .limit(8000);
  if (!members || members.length === 0) return Response.json({ ok: true, sentCount: 0, scanned: 0 });

  type U = { email: string | null; wsIds: Set<string> };
  const users = new Map<string, U>();
  const wsToMembers = new Map<string, string[]>();
  for (const m of members) {
    const row = m as { user_id: string; workspace_id: string; email: string | null };
    let u = users.get(row.user_id);
    if (!u) { u = { email: row.email, wsIds: new Set() }; users.set(row.user_id, u); }
    if (!u.email && row.email) u.email = row.email;
    u.wsIds.add(row.workspace_id);
    const arr = wsToMembers.get(row.workspace_id) ?? [];
    arr.push(row.user_id);
    wsToMembers.set(row.workspace_id, arr);
  }

  const allWsIds = Array.from(wsToMembers.keys());

  // 2. Workspace titles — and filter out archived workspaces from the
  // digest entirely (the user's "snooze" signal). We narrow allWsIds
  // to active ones for the remaining queries.
  const wsTitle = new Map<string, string>();
  const activeIds = new Set<string>();
  for (let i = 0; i < allWsIds.length; i += 300) {
    const slice = allWsIds.slice(i, i + 300);
    const { data } = await sb.from("workspaces").select("id, title, archived_at").in("id", slice);
    for (const r of data ?? []) {
      const row = r as { id: string; title: string; archived_at: string | null };
      if (row.archived_at) continue;
      wsTitle.set(row.id, row.title);
      activeIds.add(row.id);
    }
  }
  const filteredIds = allWsIds.filter((id) => activeIds.has(id));
  if (filteredIds.length === 0) return Response.json({ ok: true, sentCount: 0, scanned: 0 });

  // 3. Upcoming deadlines across all those workspaces.
  const { data: deadlines } = await sb
    .from("workspace_deadlines")
    .select("workspace_id, assignee_user_id, title, due_at, set_by_role")
    .in("workspace_id", filteredIds.slice(0, 2000))
    .eq("status", "open")
    .gte("due_at", new Date(now).toISOString())
    .lte("due_at", horizonIso)
    .limit(5000);

  // 4. Open tasks assigned to people (active workspaces only).
  const { data: tasks } = await sb
    .from("workspace_tasks")
    .select("workspace_id, assignee_user_id, status")
    .in("workspace_id", filteredIds.slice(0, 2000))
    .neq("status", "done")
    .not("assignee_user_id", "is", null)
    .limit(8000);

  // Group per-user.
  type PerUser = { deadlines: { wsId: string; title: string; dueAt: string; setBy: string }[]; openTasks: number };
  const perUser = new Map<string, PerUser>();
  const ensure = (uid: string): PerUser => {
    let p = perUser.get(uid);
    if (!p) { p = { deadlines: [], openTasks: 0 }; perUser.set(uid, p); }
    return p;
  };

  for (const d of deadlines ?? []) {
    const row = d as { workspace_id: string; assignee_user_id: string | null; title: string; due_at: string; set_by_role: string };
    const recipients = row.assignee_user_id ? [row.assignee_user_id] : (wsToMembers.get(row.workspace_id) ?? []);
    for (const uid of recipients) {
      ensure(uid).deadlines.push({ wsId: row.workspace_id, title: row.title, dueAt: row.due_at, setBy: row.set_by_role });
    }
  }
  for (const t of tasks ?? []) {
    const row = t as { assignee_user_id: string | null };
    if (row.assignee_user_id) ensure(row.assignee_user_id).openTasks++;
  }

  // Send.
  const sent: string[] = [];
  const failed: { user: string; error: string }[] = [];
  let scanned = 0;

  for (const [uid, data] of perUser) {
    if (scanned >= 500) break;
    if (data.deadlines.length === 0 && data.openTasks === 0) continue;
    const u = users.get(uid);
    if (!u?.email) continue;
    scanned++;

    if (!(await shouldEmail(uid, "email_student_digest"))) continue;

    // Soonest 6 deadlines.
    const sortedDeadlines = data.deadlines.sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime()).slice(0, 6);
    const deadlineRows = sortedDeadlines
      .map((d) => `<li><strong>${escapeHtml(d.title)}</strong> — ${escapeHtml(wsTitle.get(d.wsId) || "a workspace")} · ${relativeDue(d.dueAt, now)} · ${setByLabel(d.setBy).label}</li>`)
      .join("");

    const html = emailShell({
      heading: `Your workspaces this week`,
      body: `${data.deadlines.length > 0
        ? `<p>You have <strong>${data.deadlines.length}</strong> deadline${data.deadlines.length === 1 ? "" : "s"} coming up in the next two weeks:</p><ul>${deadlineRows}</ul>`
        : ""}${data.openTasks > 0 ? `<p>And <strong>${data.openTasks}</strong> open task${data.openTasks === 1 ? "" : "s"} assigned to you across your boards.</p>` : ""}<p>Small moves, made together. Keep going.</p>`,
      cta: { href: "https://sankofa.studio/studio/workspaces", label: "Open your workspaces" },
    });

    const r = await sendEmail({
      to: u.email,
      subject: data.deadlines.length > 0 ? `${data.deadlines.length} workspace deadline${data.deadlines.length === 1 ? "" : "s"} coming up` : "Your workspace week",
      html,
      tags: [{ name: "event", value: "workspace-digest" }],
    });
    if (r.ok) sent.push(u.email);
    else failed.push({ user: uid, error: r.error || "unknown" });
  }

  return Response.json({ ok: true, sentCount: sent.length, failed, scannedUsers: scanned });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] || c));
}
