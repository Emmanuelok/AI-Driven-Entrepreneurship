import { z } from "zod";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { bearerToken } from "@/lib/workspace-auth";
import { parseBody } from "@/lib/parse-body";
import { startAgentRun } from "@/lib/agent-runner";
import { outreachDrafter } from "@/lib/agents/outreach-drafter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST — start a new agent run. The agent function runs to completion
// inside the request, so the response carries the final id + status.
// v2.1 will background-queue these once we wire a real worker.
// GET  — list the caller's runs (latest 40).

const StartBody = z.object({
  agent_kind: z.enum(["outreach_drafter"]),
  title: z.string().min(1).max(160).optional(),
  prompt: z.string().max(2000).optional(),
  input: z.record(z.string(), z.unknown()),
});

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

  // Route to the right agent function. Adding new agents is a one-line
  // entry here + a module under lib/agents/.
  const fn = agent_kind === "outreach_drafter" ? outreachDrafter : null;
  if (!fn) return Response.json({ ok: false, error: "unknown_agent" }, { status: 400 });

  const res = await startAgentRun({
    userId: user.id,
    agentKind: agent_kind,
    title: title ?? "New Sage run",
    prompt,
    input,
    fn,
  });
  if ("error" in res) return Response.json({ ok: false, error: res.error }, { status: 500 });
  return Response.json({ ok: true, id: res.id, status: res.status });
}
