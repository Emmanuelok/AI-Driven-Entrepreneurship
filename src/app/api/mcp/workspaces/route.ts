import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { hashToken, initializeResult, rpcResult, rpcError, RpcCode, type JsonRpcRequest } from "@/lib/mcp";
import { rateLimit, rateLimited, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The Workspace MCP server — a GLOBAL (not per-build) MCP endpoint that
// exposes a signed-in user's collaborative workspaces to external AI
// agents (Claude Desktop, Cursor, any MCP client).
//
// Unlike the per-build MCP server (/api/mcp/[slug]), whose tools are AI
// prompts, these tools are DETERMINISTIC data operations: list/read
// workspaces, deadlines, discussion, and notes; create a deadline; post
// a message. Every call is scoped to the workspaces the token's owner
// actually belongs to — the MCP token is the same smcp_ token minted in
// the MCP panel, so a user connects once and gets both build tools and
// workspace tools.
//
// Surfaces:
//   GET  /api/mcp/workspaces → public discovery manifest (tool list).
//   POST /api/mcp/workspaces → JSON-RPC 2.0 (initialize, tools/list,
//                               tools/call). Bearer auth via mcp_tokens.

const SERVER_VERSION = "0.1.0";
const SERVER_NAME = "Sankofa Workspaces";
const SERVER_DESC =
  "Read and act on your Sankofa collaborative workspaces — list workspaces, read deadlines, discussion, and shared notes, create a deadline, or post a message. Every action is scoped to workspaces you're a member of.";

type ToolResult = { ok: true; data: unknown } | { ok: false; message: string };

type ToolDef = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (sb: NonNullable<ReturnType<typeof supabaseAdmin>>, callerId: string, args: Record<string, unknown>) => Promise<ToolResult>;
};

// ── Membership helper ────────────────────────────────────────────────────
async function roleOf(sb: NonNullable<ReturnType<typeof supabaseAdmin>>, workspaceId: string, userId: string): Promise<string | null> {
  const { data } = await sb.rpc("is_workspace_member", { _workspace_id: workspaceId, _user_id: userId });
  return (data as string | null) ?? null;
}

function str(args: Record<string, unknown>, key: string): string | null {
  const v = args[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

// ── Tool registry ────────────────────────────────────────────────────────
const TOOLS: ToolDef[] = [
  {
    name: "list_workspaces",
    description: "List every workspace you belong to, with your role in each. Use this first to discover workspace ids for the other tools.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    handler: async (sb, callerId) => {
      const { data: memberships } = await sb.from("workspace_members").select("workspace_id, role").eq("user_id", callerId);
      const ids = (memberships ?? []).map((m) => (m as { workspace_id: string }).workspace_id);
      if (ids.length === 0) return { ok: true, data: { workspaces: [] } };
      const { data: rows } = await sb
        .from("workspaces")
        .select("id, title, kind, description, visibility, updated_at")
        .in("id", ids)
        .order("updated_at", { ascending: false });
      const roleBy = new Map((memberships ?? []).map((m) => [(m as { workspace_id: string }).workspace_id, (m as { role: string }).role]));
      return {
        ok: true,
        data: {
          workspaces: (rows ?? []).map((r) => ({ ...r, your_role: roleBy.get((r as { id: string }).id) ?? "viewer" })),
        },
      };
    },
  },
  {
    name: "get_workspace",
    description: "Get full detail for one workspace: members, open deadlines, and recent activity.",
    inputSchema: {
      type: "object",
      properties: { workspace_id: { type: "string", description: "The workspace id (from list_workspaces)." } },
      required: ["workspace_id"],
      additionalProperties: false,
    },
    handler: async (sb, callerId, args) => {
      const id = str(args, "workspace_id");
      if (!id) return { ok: false, message: "workspace_id is required." };
      if (!(await roleOf(sb, id, callerId))) return { ok: false, message: "You're not a member of that workspace." };
      const [ws, members, deadlines, activity] = await Promise.all([
        sb.from("workspaces").select("id, title, kind, description, visibility").eq("id", id).maybeSingle(),
        sb.from("workspace_members").select("user_id, role, display_name, email").eq("workspace_id", id),
        sb.from("workspace_deadlines").select("id, title, detail, due_at, status, set_by_role, assignee_user_id").eq("workspace_id", id).eq("status", "open").order("due_at", { ascending: true }),
        sb.from("workspace_activity").select("kind, title, body, created_at").eq("workspace_id", id).order("created_at", { ascending: false }).limit(15),
      ]);
      if (!ws.data) return { ok: false, message: "Workspace not found." };
      return { ok: true, data: { workspace: ws.data, members: members.data ?? [], open_deadlines: deadlines.data ?? [], recent_activity: activity.data ?? [] } };
    },
  },
  {
    name: "list_deadlines",
    description: "List your open deadlines. Without workspace_id, returns open deadlines assigned to you (or workspace-wide) across ALL your workspaces, soonest first.",
    inputSchema: {
      type: "object",
      properties: { workspace_id: { type: "string", description: "Optional — restrict to one workspace." } },
      additionalProperties: false,
    },
    handler: async (sb, callerId, args) => {
      const id = str(args, "workspace_id");
      if (id) {
        if (!(await roleOf(sb, id, callerId))) return { ok: false, message: "You're not a member of that workspace." };
        const { data } = await sb.from("workspace_deadlines").select("id, workspace_id, title, detail, due_at, status, set_by_role, assignee_user_id").eq("workspace_id", id).eq("status", "open").order("due_at", { ascending: true }).limit(50);
        return { ok: true, data: { deadlines: data ?? [] } };
      }
      const { data: memberships } = await sb.from("workspace_members").select("workspace_id").eq("user_id", callerId);
      const ids = (memberships ?? []).map((m) => (m as { workspace_id: string }).workspace_id);
      if (ids.length === 0) return { ok: true, data: { deadlines: [] } };
      const [mine, wide] = await Promise.all([
        sb.from("workspace_deadlines").select("id, workspace_id, title, detail, due_at, status, set_by_role").in("workspace_id", ids).eq("assignee_user_id", callerId).eq("status", "open").order("due_at", { ascending: true }).limit(50),
        sb.from("workspace_deadlines").select("id, workspace_id, title, detail, due_at, status, set_by_role").in("workspace_id", ids).is("assignee_user_id", null).eq("status", "open").order("due_at", { ascending: true }).limit(50),
      ]);
      const merged = [...(mine.data ?? []), ...(wide.data ?? [])].sort((a, b) => new Date(a.due_at as string).getTime() - new Date(b.due_at as string).getTime());
      return { ok: true, data: { deadlines: merged } };
    },
  },
  {
    name: "create_deadline",
    description: "Create a deadline for yourself in a workspace you belong to. due_at must be an ISO-8601 timestamp. Always set as a self-deadline (setByRole=self).",
    inputSchema: {
      type: "object",
      properties: {
        workspace_id: { type: "string" },
        title: { type: "string", description: "What's due." },
        due_at: { type: "string", description: "ISO-8601 timestamp, e.g. 2026-06-20T17:00:00Z." },
        detail: { type: "string", description: "Optional notes." },
      },
      required: ["workspace_id", "title", "due_at"],
      additionalProperties: false,
    },
    handler: async (sb, callerId, args) => {
      const id = str(args, "workspace_id");
      const title = str(args, "title");
      const dueAt = str(args, "due_at");
      if (!id || !title || !dueAt) return { ok: false, message: "workspace_id, title, and due_at are required." };
      if (!(await roleOf(sb, id, callerId))) return { ok: false, message: "You're not a member of that workspace." };
      const due = new Date(dueAt);
      if (isNaN(due.getTime())) return { ok: false, message: "due_at is not a valid date." };
      const { data, error } = await sb
        .from("workspace_deadlines")
        .insert({ workspace_id: id, assignee_user_id: callerId, title, detail: str(args, "detail") ?? "", due_at: due.toISOString(), set_by_user_id: callerId, set_by_role: "self" })
        .select("id, title, due_at, status")
        .single();
      if (error) return { ok: false, message: error.message };
      await sb.from("workspace_activity").insert({ workspace_id: id, user_id: callerId, kind: "deadline_added", title: `Deadline (via agent): ${title}`, body: `due ${due.toISOString()}` });
      return { ok: true, data: { created: data } };
    },
  },
  {
    name: "list_messages",
    description: "Read the most recent discussion messages in a workspace (newest last).",
    inputSchema: {
      type: "object",
      properties: { workspace_id: { type: "string" }, limit: { type: "number", description: "How many recent messages (max 50)." } },
      required: ["workspace_id"],
      additionalProperties: false,
    },
    handler: async (sb, callerId, args) => {
      const id = str(args, "workspace_id");
      if (!id) return { ok: false, message: "workspace_id is required." };
      if (!(await roleOf(sb, id, callerId))) return { ok: false, message: "You're not a member of that workspace." };
      const limit = Math.max(1, Math.min(50, Number(args.limit) || 20));
      const { data } = await sb.from("workspace_messages").select("author_name, is_agent, body, created_at").eq("workspace_id", id).order("created_at", { ascending: false }).limit(limit);
      return { ok: true, data: { messages: (data ?? []).reverse() } };
    },
  },
  {
    name: "post_message",
    description: "Post a message to a workspace discussion as yourself. Useful for leaving status updates or answers from an agent workflow.",
    inputSchema: {
      type: "object",
      properties: { workspace_id: { type: "string" }, body: { type: "string", description: "Message text (markdown ok)." } },
      required: ["workspace_id", "body"],
      additionalProperties: false,
    },
    handler: async (sb, callerId, args) => {
      const id = str(args, "workspace_id");
      const body = str(args, "body");
      if (!id || !body) return { ok: false, message: "workspace_id and body are required." };
      const role = await roleOf(sb, id, callerId);
      if (!role) return { ok: false, message: "You're not a member of that workspace." };
      if (role === "viewer") return { ok: false, message: "Viewers can't post messages." };
      const authorName = (await displayNameFor(sb, callerId)) ?? "Agent";
      const { data, error } = await sb
        .from("workspace_messages")
        .insert({ workspace_id: id, user_id: callerId, author_name: authorName, body, is_agent: false, mentions: [] })
        .select("id, body, created_at")
        .single();
      if (error) return { ok: false, message: error.message };
      return { ok: true, data: { posted: data } };
    },
  },
  {
    name: "list_notes",
    description: "List the shared notes in a workspace (titles + metadata, not bodies).",
    inputSchema: {
      type: "object",
      properties: { workspace_id: { type: "string" } },
      required: ["workspace_id"],
      additionalProperties: false,
    },
    handler: async (sb, callerId, args) => {
      const id = str(args, "workspace_id");
      if (!id) return { ok: false, message: "workspace_id is required." };
      if (!(await roleOf(sb, id, callerId))) return { ok: false, message: "You're not a member of that workspace." };
      const { data } = await sb.from("workspace_docs").select("id, title, updated_by_name, version, updated_at").eq("workspace_id", id).order("updated_at", { ascending: false });
      return { ok: true, data: { notes: data ?? [] } };
    },
  },
  {
    name: "read_note",
    description: "Read the full body of one shared note.",
    inputSchema: {
      type: "object",
      properties: { workspace_id: { type: "string" }, note_id: { type: "string" } },
      required: ["workspace_id", "note_id"],
      additionalProperties: false,
    },
    handler: async (sb, callerId, args) => {
      const id = str(args, "workspace_id");
      const noteId = str(args, "note_id");
      if (!id || !noteId) return { ok: false, message: "workspace_id and note_id are required." };
      if (!(await roleOf(sb, id, callerId))) return { ok: false, message: "You're not a member of that workspace." };
      const { data } = await sb.from("workspace_docs").select("id, title, body, updated_by_name, version, updated_at").eq("id", noteId).eq("workspace_id", id).maybeSingle();
      if (!data) return { ok: false, message: "Note not found." };
      return { ok: true, data: { note: data } };
    },
  },
];

const TOOL_MANIFEST = TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema }));

// ── GET: discovery manifest ──────────────────────────────────────────────
export async function GET(req: Request) {
  return Response.json({
    ok: true,
    server: {
      name: SERVER_NAME,
      description: SERVER_DESC,
      version: SERVER_VERSION,
      protocol: "mcp",
      protocolVersion: "2025-03-26",
      transport: "http",
      endpoint: `${new URL(req.url).origin}/api/mcp/workspaces`,
      authentication: "bearer",
    },
    tools: TOOL_MANIFEST,
  });
}

// ── POST: JSON-RPC 2.0 ───────────────────────────────────────────────────
export async function POST(req: Request) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });

  const rl = rateLimit({ scope: "mcp-workspaces", ipKey: clientIp(req), maxCalls: 120 });
  if (!rl.ok) return rateLimited(rl);

  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return rpc(rpcError(null, RpcCode.Unauthorized, "missing bearer token"));

  const sb = supabaseAdmin();
  if (!sb) return rpc(rpcError(null, RpcCode.InternalError, "admin unavailable"));

  const { data: tokenRow } = await sb.from("mcp_tokens").select("user_id, id").eq("token_hash", hashToken(token)).maybeSingle();
  if (!tokenRow) return rpc(rpcError(null, RpcCode.Unauthorized, "invalid bearer token"));
  const callerId = tokenRow.user_id as string;
  void sb.from("mcp_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", tokenRow.id);

  let body: JsonRpcRequest;
  try {
    body = (await req.json()) as JsonRpcRequest;
  } catch {
    return rpc(rpcError(null, RpcCode.ParseError, "invalid JSON"));
  }
  if (!body || body.jsonrpc !== "2.0" || typeof body.method !== "string") {
    return rpc(rpcError(body?.id ?? null, RpcCode.InvalidRequest, "not a JSON-RPC 2.0 request"));
  }

  try {
    switch (body.method) {
      case "initialize":
        return rpc(rpcResult(body.id, initializeResult({ name: SERVER_NAME, description: SERVER_DESC, version: SERVER_VERSION })));
      case "notifications/initialized":
        return new Response(null, { status: 204 });
      case "tools/list":
        return rpc(rpcResult(body.id, { tools: TOOL_MANIFEST }));
      case "tools/call": {
        const params = (body.params ?? {}) as { name?: string; arguments?: Record<string, unknown> };
        const tool = TOOLS.find((t) => t.name === (params.name ?? "").trim());
        if (!tool) return rpc(rpcError(body.id, RpcCode.ToolNotFound, `tool '${params.name}' not found`));
        const t0 = Date.now();
        let result: ToolResult;
        try {
          result = await tool.handler(sb, callerId, params.arguments ?? {});
        } catch (e) {
          await logInvocation(callerId, tool.name, false, Date.now() - t0, (e as Error).message);
          return rpc(rpcError(body.id, RpcCode.InternalError, (e as Error).message));
        }
        await logInvocation(callerId, tool.name, result.ok, Date.now() - t0, result.ok ? undefined : result.message);
        // MCP content convention: business failures come back as an
        // isError tool result (so the agent reads the reason), not a
        // protocol-level JSON-RPC error.
        if (!result.ok) {
          return rpc(rpcResult(body.id, { content: [{ type: "text", text: result.message }], isError: true }));
        }
        return rpc(rpcResult(body.id, { content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }] }));
      }
      default:
        return rpc(rpcError(body.id, RpcCode.MethodNotFound, `method '${body.method}' not implemented`));
    }
  } catch (e) {
    return rpc(rpcError(body.id, RpcCode.InternalError, (e as Error).message));
  }
}

async function displayNameFor(sb: NonNullable<ReturnType<typeof supabaseAdmin>>, userId: string): Promise<string | null> {
  const { data } = await sb.auth.admin.getUserById(userId);
  return (data?.user?.user_metadata as { name?: string } | null)?.name ?? data?.user?.email ?? null;
}

async function logInvocation(callerId: string, toolName: string, ok: boolean, durationMs: number, error?: string) {
  const sb = supabaseAdmin();
  if (!sb) return;
  // Reuse the mcp_invocations table; build_slug is the synthetic
  // "workspaces" server id. No token cost (deterministic tools).
  await sb.from("mcp_invocations").insert({
    caller_user_id: callerId,
    build_slug: "workspaces",
    tool_name: toolName,
    duration_ms: durationMs,
    tokens_in: 0,
    tokens_out: 0,
    ok,
    error: error ?? null,
  });
}

function rpc(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}
