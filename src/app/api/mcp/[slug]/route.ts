import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { hashToken, isMcpConfig, initializeResult, rpcResult, rpcError, RpcCode, type JsonRpcRequest, type McpConfig, type McpTool } from "@/lib/mcp";
import { moderateOrBlock } from "@/lib/moderation";
import { rateLimit, rateLimited, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// MCP server endpoint.
//
// The slug here is a cloud_builds.id (a build that's been promoted to
// the cloud). MCP is opt-in per build via the author's mcp_config in
// data.mcp_config. v1 keeps it simple:
//   - Free for any authenticated MCP token holder (rate-limited).
//   - No paid gates yet — paid tool calls land when we're certain the
//     spec around Connect routing settles.
//
// Two surfaces:
//   GET  /api/mcp/[slug]  → public discovery manifest.
//   POST /api/mcp/[slug]  → JSON-RPC 2.0 (initialize, tools/list,
//                            tools/call). Bearer auth via mcp_tokens.

const SERVER_VERSION = "0.1.0";

export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { slug } = await ctx.params;
  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const { data: build } = await sb.from("cloud_builds").select("name, data").eq("id", slug).maybeSingle();
  if (!build) return Response.json({ ok: false, error: "not_found" }, { status: 404 });

  const config = (build.data as { mcp_config?: unknown })?.mcp_config;
  if (!isMcpConfig(config) || !config.enabled) {
    return Response.json({ ok: false, error: "mcp_disabled", message: "This build hasn't published an MCP server." }, { status: 404 });
  }

  return Response.json({
    ok: true,
    server: {
      name: config.name ?? build.name,
      description: config.description ?? "",
      version: SERVER_VERSION,
      protocol: "mcp",
      protocolVersion: "2025-03-26",
      transport: "http",
      endpoint: `${new URL(req.url).origin}/api/mcp/${slug}`,
      authentication: "bearer",
    },
    tools: config.tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema ?? { type: "object", properties: {}, additionalProperties: true },
    })),
  });
}

export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { slug } = await ctx.params;

  // Per-IP rate limit — keeps a runaway client from burning budget
  // before we even get to the Claude call.
  const rl = rateLimit({ scope: "mcp", ipKey: clientIp(req), maxCalls: 60 });
  if (!rl.ok) return rateLimited(rl);

  // Authenticate via Bearer MCP token.
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return rpc(rpcError(null, RpcCode.Unauthorized, "missing bearer token"));

  const sb = supabaseAdmin();
  if (!sb) return rpc(rpcError(null, RpcCode.InternalError, "admin unavailable"));

  const { data: tokenRow } = await sb.from("mcp_tokens").select("user_id, id").eq("token_hash", hashToken(token)).maybeSingle();
  if (!tokenRow) return rpc(rpcError(null, RpcCode.Unauthorized, "invalid bearer token"));
  const callerId = tokenRow.user_id;
  void sb.from("mcp_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", tokenRow.id);

  // Build lookup.
  const { data: build } = await sb.from("cloud_builds").select("name, data, owner_id").eq("id", slug).maybeSingle();
  if (!build) return rpc(rpcError(null, RpcCode.MethodNotFound, "build not found"));
  const config = (build.data as { mcp_config?: unknown })?.mcp_config;
  if (!isMcpConfig(config) || !config.enabled) return rpc(rpcError(null, RpcCode.MethodNotFound, "mcp disabled on this build"));

  // Parse the JSON-RPC envelope.
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
        return rpc(rpcResult(body.id, initializeResult({
          name: config.name ?? build.name,
          description: config.description ?? "",
          version: SERVER_VERSION,
        })));
      case "notifications/initialized":
        return new Response(null, { status: 204 });
      case "tools/list":
        return rpc(rpcResult(body.id, {
          tools: config.tools.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema ?? { type: "object", properties: {}, additionalProperties: true },
          })),
        }));
      case "tools/call": {
        const params = (body.params ?? {}) as { name?: string; arguments?: Record<string, unknown> };
        const toolName = (params.name ?? "").trim();
        const tool = config.tools.find((t) => t.name === toolName);
        if (!tool) return rpc(rpcError(body.id, RpcCode.ToolNotFound, `tool '${toolName}' not found`));
        return await callTool({ tool, args: params.arguments ?? {}, callerId, slug, requestId: body.id ?? null });
      }
      default:
        return rpc(rpcError(body.id, RpcCode.MethodNotFound, `method '${body.method}' not implemented`));
    }
  } catch (e) {
    return rpc(rpcError(body.id, RpcCode.InternalError, (e as Error).message));
  }
}

// ─── Tool invocation: call Claude with the tool's prompt + args ──────────
async function callTool({ tool, args, callerId, slug, requestId }: { tool: McpTool; args: Record<string, unknown>; callerId: string; slug: string; requestId: string | number | null }): Promise<Response> {
  const sb = supabaseAdmin();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const userText = JSON.stringify(args);

  const blocked = await moderateOrBlock(userText, { skipLLM: true });
  if (blocked) {
    await logInvocation(slug, callerId, tool.name, { ok: false, error: "blocked_by_safety", tokensIn: 0, tokensOut: 0, durationMs: 0 });
    return rpc(rpcError(requestId, RpcCode.InvalidParams, "blocked by safety policy"));
  }

  if (!apiKey) {
    await logInvocation(slug, callerId, tool.name, { ok: true, tokensIn: 0, tokensOut: 0, durationMs: 0 });
    return rpc(rpcResult(requestId, { content: [{ type: "text", text: `[demo] ANTHROPIC_API_KEY isn't set on the server. Args received: ${userText.slice(0, 200)}` }] }));
  }

  const t0 = Date.now();
  let tokensIn = 0;
  let tokensOut = 0;
  let outputText = "";
  try {
    const client = new Anthropic({ apiKey });
    const res = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      system: [{ type: "text", text: tool.agentPrompt, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: `Tool call arguments (JSON):\n${userText}` }],
    });
    outputText = res.content.filter((c) => c.type === "text").map((c) => (c.type === "text" ? c.text : "")).join("").trim();
    tokensIn = res.usage?.input_tokens ?? 0;
    tokensOut = res.usage?.output_tokens ?? 0;
  } catch (e) {
    await logInvocation(slug, callerId, tool.name, { ok: false, error: (e as Error).message, tokensIn, tokensOut, durationMs: Date.now() - t0 });
    return rpc(rpcError(requestId, RpcCode.InternalError, (e as Error).message));
  }

  await logInvocation(slug, callerId, tool.name, { ok: true, tokensIn, tokensOut, durationMs: Date.now() - t0 });
  void sb?.from("ai_usage").insert({
    user_id: callerId,
    scope: `mcp/${slug}/${tool.name}`.slice(0, 120),
    model: "claude-sonnet-4-6",
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    cost_usd: (tokensIn * 3 + tokensOut * 15) / 1_000_000,
  });

  return rpc(rpcResult(requestId, { content: [{ type: "text", text: outputText }] }));
}

async function logInvocation(slug: string, callerId: string, toolName: string, meta: { ok: boolean; error?: string; tokensIn: number; tokensOut: number; durationMs: number }) {
  const sb = supabaseAdmin();
  if (!sb) return;
  await sb.from("mcp_invocations").insert({
    caller_user_id: callerId,
    build_slug: slug,
    tool_name: toolName,
    duration_ms: meta.durationMs,
    tokens_in: meta.tokensIn,
    tokens_out: meta.tokensOut,
    ok: meta.ok,
    error: meta.error ?? null,
  });
}

function rpc(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
