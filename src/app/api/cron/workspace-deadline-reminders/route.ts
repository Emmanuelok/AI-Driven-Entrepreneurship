import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { shouldRemind, windowLabel, setByLabel, type DeadlineRow } from "@/lib/deadline-schedule";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Walks every OPEN workspace deadline, decides whether each is due for
// a reminder using the pure deadline-schedule policy, and writes one
// in-app notification per (deadline, assignee) into public.notifications.
// For workspace-wide deadlines (assignee_user_id null) every active
// member receives the reminder.
//
// Idempotency: shouldRemind() reads last_reminded_at and uses each
// window's horizon to dedupe. After a successful pass we stamp
// last_reminded_at = now so the cron is safe to re-run within the same
// hour (and so a failure mid-pass doesn't double-notify).
//
// Cron schedule (vercel.json): every two hours, * 0/2 * * *

const DAY = 86_400_000;

type NotificationInsert = {
  user_id: string;
  kind: string;
  actor_name: string | null;
  target_kind: string | null;
  target_slug: string | null;
  title: string;
  body: string | null;
  url: string | null;
  read: boolean;
};

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

  // Pull every open deadline due within the cron's interest window:
  // anything from now - 1 day (catches overdue grace) through now + 8
  // days (catches the 7d warning with some headroom).
  const since = new Date(now - 1 * DAY).toISOString();
  const until = new Date(now + 8 * DAY).toISOString();
  const { data: deadlines, error } = await sb
    .from("workspace_deadlines")
    .select("id, workspace_id, assignee_user_id, title, due_at, status, set_by_role, last_reminded_at")
    .eq("status", "open")
    .gte("due_at", since)
    .lte("due_at", until)
    .limit(2000);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  if (!deadlines || deadlines.length === 0) return Response.json({ ok: true, scanned: 0, fired: 0 });

  // Cache workspace metadata + member rosters as we go so repeated
  // deadlines on the same workspace don't refetch.
  const wsCache = new Map<string, { title: string }>();
  const memberCache = new Map<string, string[]>(); // workspace_id → user_id[]
  const reminded: string[] = [];
  const notifs: NotificationInsert[] = [];

  for (const raw of deadlines) {
    const d = raw as DeadlineRow;
    const decision = shouldRemind(d, now);
    if (!decision) continue;

    // Recipients: either the assignee, or every member if workspace-wide.
    let recipients: string[];
    if (d.assignee_user_id) {
      recipients = [d.assignee_user_id];
    } else {
      let members = memberCache.get(d.workspace_id);
      if (!members) {
        const { data: rows } = await sb
          .from("workspace_members")
          .select("user_id")
          .eq("workspace_id", d.workspace_id);
        members = (rows ?? []).map((r) => (r as { user_id: string }).user_id);
        memberCache.set(d.workspace_id, members);
      }
      recipients = members;
    }
    if (recipients.length === 0) continue;

    let ws = wsCache.get(d.workspace_id);
    if (!ws) {
      const { data } = await sb.from("workspaces").select("title").eq("id", d.workspace_id).maybeSingle();
      ws = { title: (data?.title as string | undefined) || "your workspace" };
      wsCache.set(d.workspace_id, ws);
    }

    const sourceTag = setByLabel(d.set_by_role).label;
    const headline = headlineFor(decision.window, d.title, ws.title);
    const body = bodyFor(decision.window, sourceTag, new Date(d.due_at));
    const href = `/studio/workspaces/${d.workspace_id}`;

    for (const userId of recipients) {
      notifs.push({
        user_id: userId,
        kind: "system",
        actor_name: "Deadline engine",
        target_kind: "venture", // notifications.target_kind is constrained to existing values; this is the closest fit
        target_slug: d.workspace_id,
        title: headline,
        body,
        url: href,
        read: false,
      });
    }
    reminded.push(d.id);
  }

  // Insert in batches so a single query failure doesn't black-hole the
  // whole run. notifications already enforce per-user-recent dedupe in
  // the UI, so a transient double-write here is harmless.
  const BATCH = 200;
  let inserted = 0;
  for (let i = 0; i < notifs.length; i += BATCH) {
    const slice = notifs.slice(i, i + BATCH);
    const { error: insErr } = await sb.from("notifications").insert(slice);
    if (!insErr) inserted += slice.length;
  }

  // Stamp last_reminded_at on the deadlines we acted on.
  if (reminded.length > 0) {
    const stamp = new Date(now).toISOString();
    for (let i = 0; i < reminded.length; i += BATCH) {
      const slice = reminded.slice(i, i + BATCH);
      await sb.from("workspace_deadlines").update({ last_reminded_at: stamp }).in("id", slice);
    }
  }

  return Response.json({
    ok: true,
    scanned: deadlines.length,
    deadlinesReminded: reminded.length,
    notificationsInserted: inserted,
  });
}

function headlineFor(window: string, title: string, workspaceTitle: string): string {
  const w = windowLabel(window as Parameters<typeof windowLabel>[0]);
  if (window === "overdue") return `Missed: ${title} (${workspaceTitle})`;
  return `${w}: ${title}`;
}

function bodyFor(window: string, sourceTag: string, due: Date): string {
  const localTime = due.toUTCString().replace(":00 GMT", " UTC");
  if (window === "overdue") return `Set by ${sourceTag}. Was due ${localTime}.`;
  return `Set by ${sourceTag}. Due ${localTime}.`;
}
