import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { buildIcs, type IcsEvent } from "@/lib/ics";
import { collectCalendarItems } from "@/app/api/v2/me/calendar/route";
import { setByLabel } from "@/lib/deadline-schedule";
import { toRRule, validateRule } from "@/lib/recurrence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public iCalendar feed. The token in the path IS the capability — no
// session. Calendar apps (Google / Apple / Outlook) poll this on their
// own schedule. We resolve the token → user_id with the service role
// and emit their workspace deadlines + task due dates as VEVENTs.
//
// The path ends in .ics conceptually; Next routes [token] so a client
// can subscribe to /api/calendar/<token> (most apps don't require the
// extension, but we set the right Content-Type + filename regardless).
//
// Always returns 200 with a valid (possibly empty) calendar so a bad
// token doesn't make the user's calendar app show a noisy sync error —
// an unknown token simply yields an empty feed.

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const clean = token.replace(/\.ics$/i, "");

  const empty = () => icsResponse(buildIcs({ name: "Sankofa — Workspace deadlines", events: [] }));

  if (!isSupabaseConfigured() || clean.length < 16) return empty();

  const sb = supabaseAdmin();
  if (!sb) return empty();

  const { data: row } = await sb.from("calendar_tokens").select("user_id").eq("token", clean).maybeSingle();
  if (!row) return empty();
  const userId = row.user_id as string;

  const items = await collectCalendarItems(sb, userId);

  const events: IcsEvent[] = items.map((it) => {
    const start = new Date(it.due_at);
    const categories = it.kind === "task" ? ["Task"] : [setByLabel(it.set_by_role ?? "self").label];
    const sourceLine = it.kind === "task" ? "Task" : `Deadline · set by ${setByLabel(it.set_by_role ?? "self").label}`;
    // If this is a recurring deadline, attach an RRULE so the
    // subscriber's calendar expands the series locally (instead of us
    // materializing N occurrences in the feed).
    let rrule: string | undefined;
    if (it.recurrence_rule) {
      const v = validateRule(it.recurrence_rule);
      if (v.ok) rrule = toRRule(v.rule);
    }
    return {
      uid: `${it.kind}-${it.id}@sankofa.studio`,
      start,
      summary: `${it.title} (${it.workspace_title})`,
      description: [it.detail, sourceLine].filter(Boolean).join("\n"),
      url: `https://sankofa.studio/studio/workspaces/${it.workspace_id}`,
      categories,
      rrule,
    };
  });

  const ics = buildIcs({ name: "Sankofa — Workspace deadlines", events });
  return icsResponse(ics);
}

function icsResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="sankofa-workspaces.ics"',
      // Let calendar apps cache briefly; they poll on their own cadence.
      "Cache-Control": "public, max-age=900",
    },
  });
}
