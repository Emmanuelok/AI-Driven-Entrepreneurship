import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { buildIcs, type IcsEvent } from "@/lib/ics";
import { setByLabel } from "@/lib/deadline-schedule";
import { toRRule, validateRule } from "@/lib/recurrence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public iCalendar feed scoped to ONE workspace. The token in the path
// is the capability — no session. Resolves token → (workspace_id,
// user_id) and re-verifies membership at serve time so revoking access
// also kills the feed even if the token wasn't rotated.
//
// We emit deadlines (assigned to this user OR workspace-wide) plus
// task due dates assigned to them, all OPEN. Symmetric with the
// cross-workspace feed at /api/calendar/[token] but limited to one
// project — useful when a member only wants ONE workspace in their
// calendar app.
//
// Always returns 200 with a valid (possibly empty) calendar so a bad
// or revoked token doesn't make the user's calendar app show a noisy
// sync error — an unknown token simply yields an empty feed.

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const clean = token.replace(/\.ics$/i, "");

  const empty = (name = "Sankofa — Workspace") => icsResponse(buildIcs({ name, events: [] }));
  if (!isSupabaseConfigured() || clean.length < 16) return empty();

  const sb = supabaseAdmin();
  if (!sb) return empty();

  const { data: row } = await sb
    .from("workspace_calendar_tokens")
    .select("workspace_id, user_id")
    .eq("token", clean)
    .maybeSingle();
  if (!row) return empty();
  const { workspace_id, user_id } = row as { workspace_id: string; user_id: string };

  // Re-verify membership at serve time — if the workspace owner
  // removed this user, kill the feed even though the token is still
  // alive. Cheap call.
  const { data: roleRow } = await sb
    .from("workspace_members")
    .select("workspace_id")
    .eq("workspace_id", workspace_id)
    .eq("user_id", user_id)
    .maybeSingle();
  if (!roleRow) return empty();

  // Skip archived workspaces — same rule as the cross-workspace feed.
  const { data: ws } = await sb
    .from("workspaces")
    .select("id, title, archived_at")
    .eq("id", workspace_id)
    .maybeSingle();
  if (!ws) return empty();
  const wsRow = ws as { id: string; title: string; archived_at: string | null };
  const wsTitle = wsRow.title;
  if (wsRow.archived_at) return empty(`Sankofa — ${wsTitle}`);

  const [mineDeadlines, wideDeadlines, tasks] = await Promise.all([
    sb.from("workspace_deadlines").select("id, title, detail, due_at, status, set_by_role, recurrence_rule").eq("workspace_id", workspace_id).eq("assignee_user_id", user_id).eq("status", "open").limit(500),
    sb.from("workspace_deadlines").select("id, title, detail, due_at, status, set_by_role, recurrence_rule").eq("workspace_id", workspace_id).is("assignee_user_id", null).eq("status", "open").limit(500),
    sb.from("workspace_tasks").select("id, title, detail, due_at, status").eq("workspace_id", workspace_id).eq("assignee_user_id", user_id).neq("status", "done").not("due_at", "is", null).limit(500),
  ]);

  const events: IcsEvent[] = [];
  for (const d of [...(mineDeadlines.data ?? []), ...(wideDeadlines.data ?? [])]) {
    const r = d as { id: string; title: string; detail: string | null; due_at: string; set_by_role: string | null; recurrence_rule: unknown };
    const start = new Date(r.due_at);
    const sourceLine = `Deadline · set by ${setByLabel(r.set_by_role ?? "self").label}`;
    let rrule: string | undefined;
    if (r.recurrence_rule) {
      const v = validateRule(r.recurrence_rule);
      if (v.ok) rrule = toRRule(v.rule);
    }
    events.push({
      uid: `deadline-${r.id}@sankofa.studio`,
      start,
      summary: `${r.title} (${wsTitle})`,
      description: [r.detail ?? "", sourceLine].filter(Boolean).join("\n"),
      url: `https://sankofa.studio/studio/workspaces/${workspace_id}`,
      categories: [setByLabel(r.set_by_role ?? "self").label],
      rrule,
    });
  }
  for (const t of tasks.data ?? []) {
    const r = t as { id: string; title: string; detail: string | null; due_at: string };
    events.push({
      uid: `task-${r.id}@sankofa.studio`,
      start: new Date(r.due_at),
      summary: `${r.title} (${wsTitle})`,
      description: [r.detail ?? "", "Task"].filter(Boolean).join("\n"),
      url: `https://sankofa.studio/studio/workspaces/${workspace_id}`,
      categories: ["Task"],
    });
  }

  events.sort((a, b) => a.start.getTime() - b.start.getTime());

  const ics = buildIcs({ name: `Sankofa — ${wsTitle}`, events });
  return icsResponse(ics);
}

function icsResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="sankofa-workspace.ics"',
      "Cache-Control": "public, max-age=900",
    },
  });
}
