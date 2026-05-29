import { createHash } from "node:crypto";

// Shared types + helpers for MCP servers hosted on Sankofa.
//
// Each cloud_build can declare an MCP server via data.mcp_config:
//   {
//     "enabled": true,
//     "name": "Maize price coach",
//     "description": "Tools for cassava + maize farmers in West Africa",
//     "tools": [
//       {
//         "name": "lookup_price",
//         "description": "...",
//         "inputSchema": { "type": "object", "properties": { ... } },
//         "agentPrompt": "You are a price lookup tool. Given a market and crop, ..."
//       }
//     ]
//   }
//
// /api/mcp/[slug] exposes this as a real MCP HTTP server speaking
// JSON-RPC 2.0 — the same protocol Claude Desktop, Cursor, and
// MCP-aware tools install URLs from.

export type McpTool = {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  agentPrompt: string;
};

export type McpConfig = {
  enabled: boolean;
  name?: string;
  description?: string;
  tools: McpTool[];
};

export function isMcpConfig(value: unknown): value is McpConfig {
  if (!value || typeof value !== "object") return false;
  const v = value as { enabled?: unknown; tools?: unknown };
  if (typeof v.enabled !== "boolean") return false;
  if (!Array.isArray(v.tools)) return false;
  return true;
}

// SHA-256 of the secret. Stored in mcp_tokens.token_hash so DB leak
// doesn't reveal usable bearer tokens.
export function hashToken(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

// Generate a new token. Format: "smcp_" + 32 random hex chars. Easy to
// spot in logs / config files.
export function generateToken(): { raw: string; hash: string } {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  const raw = `smcp_${hex}`;
  return { raw, hash: hashToken(raw) };
}

// JSON-RPC 2.0 envelope helpers.
export type JsonRpcRequest = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: unknown };
export type JsonRpcResponse = { jsonrpc: "2.0"; id: string | number | null; result?: unknown; error?: { code: number; message: string; data?: unknown } };

export function rpcResult(id: string | number | null | undefined, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id: id ?? null, result };
}
export function rpcError(id: string | number | null | undefined, code: number, message: string, data?: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message, data } };
}

// Standard MCP error codes (subset of the spec we use).
export const RpcCode = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
  Unauthorized: -32001,
  ToolNotFound: -32002,
  PaymentRequired: -32003,
} as const;

// The "initialize" handshake reply. We say we support tools and not
// resources / prompts (those are easy to add later).
export function initializeResult(server: { name: string; description: string; version: string }): unknown {
  return {
    protocolVersion: "2025-03-26",
    capabilities: {
      tools: { listChanged: false },
    },
    serverInfo: {
      name: server.name,
      version: server.version,
      // Sankofa-flavored metadata so installers know where this came from.
      vendor: "Sankofa Studio",
    },
    instructions: server.description,
  };
}
