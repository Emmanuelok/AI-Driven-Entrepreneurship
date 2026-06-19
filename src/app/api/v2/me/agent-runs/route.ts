import { z } from "zod";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { bearerToken } from "@/lib/workspace-auth";
import { parseBody } from "@/lib/parse-body";
import { startAgentRun, type AgentFn } from "@/lib/agent-runner";
import { outreachDrafter } from "@/lib/agents/outreach-drafter";
import { researchBrief } from "@/lib/agents/research-brief";
import { discussionSummary } from "@/lib/agents/discussion-summary";
import { venturePitchPolish } from "@/lib/agents/venture-pitch-polish";
import { groundedQuery } from "@/lib/agents/grounded-query";
import { workspaceGroundedQuery } from "@/lib/agents/workspace-grounded-query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST — start a new agent run. The agent function runs to completion
// inside the request, so the response carries the final id + status.
// v2.1 will background-queue these once we wire a real worker.
// GET  — list the caller's runs (latest 40).

// Adding a new agent is a 3-step change: add the kind to the enum,
// import the agent function, register it in AGENTS. Everything else
// (runner, notifications, history page) routes automatically.
const StartBody = z.object({
  agent_kind: z.enum([
    "outreach_drafter",
    "research_brief",
    "discussion_summary",
    "venture_pitch_polish",
    "grounded_query",
    "workspace_grounded_query",
  ]),
  title: z.string().min(1).max(160).optional(),
  prompt: z.string().max(2000).optional(),
  input: z.record(z.string(), z.unknown()),
});

const AGENTS: Record<string, AgentFn> = {
  outreach_drafter: outreachDrafter,
  research_brief: researchBrief,
  discussion_summary: discussionSummary,
  venture_pitch_polish: venturePitchPolish,
  grounded_query: groundedQuery,
  workspace_grounded_query: workspaceGroundedQuery,
};

const DEFAULT_TITLES: Record<string, string> = {
  outreach_drafter: "Draft outreach",
  research_brief: "Research brief",
  discussion_summary: "Discussion digest",
  venture_pitch_polish: "Polish pitch",
  grounded_query: "Sage answer",
  workspace_grounded_query: "Sage workspace answer",
};

async function resolveCaller(req: Request) {
  const token = bearerToken(req);
  if (!token) return { error: Response.json({ ok: false, error: "missing_token" }, { status: 401 }) };
  const sb = supabaseAdmin();
  if (!sb) return { error: Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 }) };
  const { data: u, error } = await sb.auth.getUser(token);
  if (error || !u?.user) return { error: Response.json({ ok: false, error: "auth_failed" }, { status: 401 }) };
  return { sb, user: u.user };
}

export async function GET(req: Request) {
  if (!isSupabaseConfigured()) return Response.json({ ok: true, results: [], mode: "local" });
  const r = await resolveCaller(req);
  if ("error" in r) return r.error;
  const { sb, user } = r;
  const { data } = await sb
    .from("agent_runs")
    .select("id, agent_kind, title, status, output, steps, error, started_at, completed_at, approved_at, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(40);
  return Response.json({ ok: true, results: data ?? [] });
}

export async function POST(req: Request) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const r = await resolveCaller(req);
  if ("error" in r) return r.error;
  const { user } = r;

  const parsed = await parseBody(req, StartBody);
  if (!parsed.ok) return parsed.response;
  const { agent_kind, title, prompt, input } = parsed.data;

  const fn = AGENTS[agent_kind];
  if (!fn) return Response.json({ ok: false, error: "unknown_agent" }, { status: 400 });

  const res = await startAgentRun({
    userId: user.id,
    agentKind: agent_kind,
    title: title ?? DEFAULT_TITLES[agent_kind] ?? "New Sage run",
    prompt,
    input,
    fn,
  });
  if ("error" in res) return Response.json({ ok: false, error: res.error }, { status: 500 });
  return Response.json({ ok: true, id: res.id, status: res.status });
}
