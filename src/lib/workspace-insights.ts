// ─────────────────────────────────────────────────────────────────────────
// Pure per-user workspace insights.
//
// Given a set of activity-ish events for ONE user in ONE workspace over
// a window, compute a small "your week here" summary: tasks closed,
// deadlines hit, messages sent, files added, plus a momentum verdict and
// a single human headline. Pure + deterministic so it's unit-testable
// and the same computation can run on any surface.
//
// Inputs are deliberately narrow projections (not DB rows) so the route
// maps Supabase data into them and this module stays decoupled.
// ─────────────────────────────────────────────────────────────────────────

const DAY = 86_400_000;

export type InsightEvent = {
  kind: "task_done" | "deadline_done" | "message" | "file_added" | "task_added" | "note_edit";
  at: number; // epoch ms
};

export type WorkspaceInsights = {
  windowDays: number;
  tasksClosed: number;
  deadlinesHit: number;
  messagesSent: number;
  filesAdded: number;
  tasksCreated: number;
  notesEdited: number;
  activeDays: number;          // distinct local days with ≥1 event
  totalEvents: number;
  momentum: "on-fire" | "steady" | "light" | "quiet";
  headline: string;
};

// Distinct local-day key for an epoch ms (UTC-based; good enough for an
// "active days" count and consistent with the rest of the engine).
function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
}

export function computeWorkspaceInsights(events: InsightEvent[], now: number, windowDays = 7): WorkspaceInsights {
  const since = now - windowDays * DAY;
  const inWindow = events.filter((e) => e.at >= since && e.at <= now);

  const count = (kind: InsightEvent["kind"]) => inWindow.filter((e) => e.kind === kind).length;
  const tasksClosed = count("task_done");
  const deadlinesHit = count("deadline_done");
  const messagesSent = count("message");
  const filesAdded = count("file_added");
  const tasksCreated = count("task_added");
  const notesEdited = count("note_edit");
  const totalEvents = inWindow.length;

  const days = new Set(inWindow.map((e) => dayKey(e.at)));
  const activeDays = days.size;

  // Momentum: weighted toward "produced output" (closed tasks +
  // deadlines + files) over "chatter" (messages), and toward
  // consistency (active days).
  const output = tasksClosed * 2 + deadlinesHit * 3 + filesAdded + tasksCreated;
  const score = output + messagesSent * 0.5 + activeDays * 2;
  let momentum: WorkspaceInsights["momentum"];
  if (score >= 20) momentum = "on-fire";
  else if (score >= 8) momentum = "steady";
  else if (score >= 2) momentum = "light";
  else momentum = "quiet";

  const headline = buildHeadline({ tasksClosed, deadlinesHit, messagesSent, filesAdded, activeDays, momentum, windowDays });

  return {
    windowDays,
    tasksClosed,
    deadlinesHit,
    messagesSent,
    filesAdded,
    tasksCreated,
    notesEdited,
    activeDays,
    totalEvents,
    momentum,
    headline,
  };
}

function buildHeadline(d: {
  tasksClosed: number; deadlinesHit: number; messagesSent: number; filesAdded: number;
  activeDays: number; momentum: WorkspaceInsights["momentum"]; windowDays: number;
}): string {
  if (d.momentum === "quiet") {
    return `Quiet ${d.windowDays === 7 ? "week" : `${d.windowDays} days`} here. One small move gets the wheel turning again.`;
  }
  // Lead with the most impressive concrete number.
  const parts: string[] = [];
  if (d.tasksClosed > 0) parts.push(`closed ${d.tasksClosed} task${d.tasksClosed === 1 ? "" : "s"}`);
  if (d.deadlinesHit > 0) parts.push(`hit ${d.deadlinesHit} deadline${d.deadlinesHit === 1 ? "" : "s"}`);
  if (d.filesAdded > 0) parts.push(`shared ${d.filesAdded} file${d.filesAdded === 1 ? "" : "s"}`);
  if (d.messagesSent > 0) parts.push(`sent ${d.messagesSent} message${d.messagesSent === 1 ? "" : "s"}`);

  const lead = parts.length === 0
    ? "Some quiet progress"
    : parts.length === 1
      ? `You ${parts[0]}`
      : `You ${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;

  const cadence = d.activeDays >= 5
    ? `across ${d.activeDays} days — that consistency is the whole game.`
    : d.activeDays >= 3
      ? `over ${d.activeDays} days.`
      : `in ${d.activeDays} day${d.activeDays === 1 ? "" : "s"}.`;

  const flourish = d.momentum === "on-fire" ? " You're on fire." : "";
  return `${lead} ${cadence}${flourish}`;
}
