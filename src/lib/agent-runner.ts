import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { createNotification } from "@/lib/notifications-server";

// Generic durable helper for driving an agent_runs row through its
// status machine. Agents are async functions that receive a Context
// with a step()-builder; the runner persists each transition so the
// UI can replay the trace and the bell can fire on completion.
//
// One run per call. The actual orchestration (queueing, concurrency
// limits, retries) is intentionally out of scope here — v2.0 ships
// the foreground "fire and wait" model where the agent runs inside
// the request handler. Background execution + scheduling lands in
// v2.1 when we have a real queue.

export type AgentStep = {
  label: string;
  status: "running" | "done" | "failed";
  started_at: string;
  finished_at?: string;
  data?: unknown;
};

export type AgentContext = {
  // Mark a new step as in-flight. Returns a finalize() callback to
  // close the step. Steps render in the order they're started.
  step: <T>(label: string, fn: () => Promise<T>, extra?: { data?: unknown }) => Promise<T>;
  // The current agent_runs row id, in case the agent wants to surface
  // it back.
  runId: string;
  // The user_id who launched the run — agents that touch user-scoped
  // data (their profile, ventures, etc.) read this off the context.
  userId: string;
  // Free-form input the user submitted with the run.
  input: Record<string, unknown>;
};

export type AgentResult = {
  output: Record<string, unknown>;
  // If terminal=true, the run completes outright. Otherwise it stops
  // at needs_approval so the user can review the output before any
  // external side effect (sending the outreach, posting, etc.).
  terminal: boolean;
  // Title to overwrite the run's row title with on completion (the
  // initial title might be a placeholder).
  title?: string;
  // Optional notification to fire on completion. Defaults to a
  // generic "Sage finished {title}" notification on terminal runs and
  // needs_approval runs alike.
  notification?: { title: string; body?: string; url?: string };
};

export type AgentFn = (ctx: AgentContext) => Promise<AgentResult>;

// Start + drive a run. Persists the initial row, executes the agent
// inside a try/catch, and writes the final status + output + trace.
// Returns the row id so the caller can return it to the client.
export async function startAgentRun(args: {
  userId: string;
  agentKind: string;
  title: string;
  prompt?: string;
  input: Record<string, unknown>;
  fn: AgentFn;
}): Promise<{ id: string; status: string } | { error: string }> {
  if (!isSupabaseConfigured()) return { error: "supabase_not_configured" };
  const sb = supabaseAdmin();
  if (!sb) return { error: "admin_unavailable" };

  const startedAt = new Date().toISOString();
  const { data: row, error: insertErr } = await sb
    .from("agent_runs")
    .insert({
      user_id: args.userId,
      agent_kind: args.agentKind,
      title: args.title,
      prompt: args.prompt ?? "",
      input: args.input,
      status: "running",
      started_at: startedAt,
    })
    .select("id")
    .single();
  if (insertErr || !row) return { error: insertErr?.message ?? "insert_failed" };
  const runId = (row as { id: string }).id;

  const steps: AgentStep[] = [];

  async function persistSteps() {
    try {
      await sb!.from("agent_runs").update({ steps }).eq("id", runId);
    } catch { /* best-effort trace */ }
  }

  const ctx: AgentContext = {
    runId,
    userId: args.userId,
    input: args.input,
    step: async <T,>(label: string, fn: () => Promise<T>, extra?: { data?: unknown }) => {
      const startedAt = new Date().toISOString();
      const stepIdx = steps.length;
      steps.push({ label, status: "running", started_at: startedAt });
      await persistSteps();
      try {
        const result = await fn();
        steps[stepIdx] = {
          label,
          status: "done",
          started_at: startedAt,
          finished_at: new Date().toISOString(),
          data: extra?.data,
        };
        await persistSteps();
        return result;
      } catch (e) {
        steps[stepIdx] = {
          label,
          status: "failed",
          started_at: startedAt,
          finished_at: new Date().toISOString(),
          data: { error: (e as Error).message },
        };
        await persistSteps();
        throw e;
      }
    },
  };

  try {
    const result = await args.fn(ctx);
    const finalStatus = result.terminal ? "completed" : "needs_approval";
    const completedAt = new Date().toISOString();
    await sb.from("agent_runs").update({
      output: result.output,
      status: finalStatus,
      completed_at: completedAt,
      title: result.title ?? args.title,
    }).eq("id", runId);

    void createNotification({
      userId: args.userId,
      kind: "agent_complete",
      targetKind: "agent",
      targetSlug: runId,
      title: result.notification?.title ?? `Sage finished: ${result.title ?? args.title}`,
      body: result.notification?.body,
      // Deep-link to the new detail page so a tap on the bell or a
      // device push lands on the actual run, not the list view.
      url: result.notification?.url ?? `/studio/agent-runs/${runId}`,
    });

    return { id: runId, status: finalStatus };
  } catch (e) {
    const msg = (e as Error).message;
    await sb.from("agent_runs").update({
      status: "failed",
      error: msg,
      completed_at: new Date().toISOString(),
    }).eq("id", runId);
    return { id: runId, status: "failed" };
  }
}
