"use client";

import { useMemo, useState } from "react";
import { Play, Loader2, AlertCircle, Check, Copy, ChevronDown, KeyRound } from "lucide-react";

// In-browser MCP tool playground. Rendered inline on /mcp/[slug] so
// visitors can hit "Try it" without leaving the page — the typical
// conversion path is browse → try one tool → install Claude Desktop.
//
// The token is held in sessionStorage (not localStorage) — clears on
// browser close. We never proxy it; the JSON-RPC request goes
// browser → /api/mcp/[slug] on the same origin, identical to what a
// real client would send.

type Tool = { name: string; description: string; inputSchema?: Record<string, unknown> };
type JsonRpcResp = { jsonrpc: "2.0"; id: number; result?: { content?: { type: string; text?: string }[] }; error?: { code: number; message: string } };

const TOKEN_KEY = "sankofa-mcp-playground-token";

export function McpPlayground({ slug, serverName, tools }: { slug: string; serverName: string; tools: Tool[] }) {
  const [open, setOpen] = useState(false);
  const [toolName, setToolName] = useState<string>(tools[0]?.name ?? "");
  const [token, setToken] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    try { return sessionStorage.getItem(TOKEN_KEY) ?? ""; } catch { return ""; }
  });
  const [argsText, setArgsText] = useState<string>(() => exampleArgs(tools[0]?.inputSchema));
  const [running, setRunning] = useState(false);
  const [response, setResponse] = useState<{ ok: boolean; text: string; ms: number } | null>(null);
  const [copied, setCopied] = useState(false);

  const tool = useMemo(() => tools.find((t) => t.name === toolName) ?? tools[0], [tools, toolName]);

  function pickTool(name: string) {
    setToolName(name);
    const next = tools.find((t) => t.name === name);
    setArgsText(exampleArgs(next?.inputSchema));
    setResponse(null);
  }

  function saveToken(v: string) {
    setToken(v);
    try {
      if (v) sessionStorage.setItem(TOKEN_KEY, v);
      else sessionStorage.removeItem(TOKEN_KEY);
    } catch { /* silent */ }
  }

  async function invoke() {
    if (!tool) return;
    setRunning(true);
    setResponse(null);
    const t0 = performance.now();
    try {
      let parsed: Record<string, unknown>;
      try { parsed = argsText.trim() ? JSON.parse(argsText) : {}; }
      catch (e) {
        setResponse({ ok: false, text: `Arguments aren't valid JSON: ${(e as Error).message}`, ms: 0 });
        return;
      }
      const res = await fetch(`/api/mcp/${encodeURIComponent(slug)}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: Math.floor(Date.now() / 1000),
          method: "tools/call",
          params: { name: tool.name, arguments: parsed },
        }),
      });
      const ms = Math.round(performance.now() - t0);
      const data = (await res.json()) as JsonRpcResp;
      if (data.error) {
        setResponse({ ok: false, text: `Error ${data.error.code}: ${data.error.message}`, ms });
      } else {
        const text = (data.result?.content ?? []).map((c) => c.text ?? "").join("").trim() || "(empty response)";
        setResponse({ ok: true, text, ms });
      }
    } catch (e) {
      setResponse({ ok: false, text: (e as Error).message, ms: Math.round(performance.now() - t0) });
    } finally {
      setRunning(false);
    }
  }

  if (tools.length === 0) return null;

  return (
    <div className="rounded-2xl border border-[#2a3a35] bg-[#141d1a] overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#1a2421] transition"
      >
        <span className="flex items-center gap-2 text-sm">
          <Play className="size-3.5 text-[#2cc295]" />
          Try it in the browser
        </span>
        <ChevronDown className={`size-3.5 text-[#8aa39a] transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="p-4 pt-2 border-t border-[#1f2c28] space-y-3">
          {/* Token row */}
          <div>
            <div className="text-[10px] uppercase tracking-widest text-[#8aa39a] mb-1.5 flex items-center gap-1.5">
              <KeyRound className="size-2.5" /> Your MCP token
            </div>
            <input
              type="password"
              value={token}
              onChange={(e) => saveToken(e.target.value)}
              placeholder="smcp_…"
              autoComplete="off"
              spellCheck={false}
              className="w-full bg-[#06100d] border border-[#2a3a35] rounded-lg px-3 py-2 text-xs font-mono outline-none focus:border-[#2cc295]"
            />
            <p className="text-[10px] text-[#6b8079] mt-1">Held in this tab only — clears when you close the browser. Mint a token in <a href="/studio/settings" className="text-[#2cc295] hover:text-[#f4a949]">Settings → MCP tokens</a>.</p>
          </div>

          {/* Tool picker */}
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-[#8aa39a] mb-1.5">Tool</div>
              <select
                value={toolName}
                onChange={(e) => pickTool(e.target.value)}
                className="w-full bg-[#06100d] border border-[#2a3a35] rounded-lg px-3 py-2 text-xs outline-none focus:border-[#2cc295]"
              >
                {tools.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
              </select>
              {tool?.description && (
                <p className="text-[10px] text-[#8aa39a] mt-1.5 leading-relaxed">{tool.description}</p>
              )}
            </div>
            <div className="flex items-end">
              <button
                onClick={invoke}
                disabled={running || !token.trim()}
                className="w-full inline-flex items-center justify-center gap-1.5 bg-[#2cc295] text-[#0a0f0d] font-medium rounded-lg px-3 py-2 text-xs hover:bg-[#42d3a8] disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {running ? <><Loader2 className="size-3 animate-spin" /> Calling Claude…</> : <><Play className="size-3" /> Invoke</>}
              </button>
            </div>
          </div>

          {/* Arguments */}
          <div>
            <div className="text-[10px] uppercase tracking-widest text-[#8aa39a] mb-1.5 flex items-center justify-between">
              <span>Arguments (JSON)</span>
              <button onClick={() => setArgsText(exampleArgs(tool?.inputSchema))} className="text-[10px] uppercase tracking-widest text-[#6b8079] hover:text-[#2cc295] transition">Reset</button>
            </div>
            <textarea
              value={argsText}
              onChange={(e) => setArgsText(e.target.value)}
              rows={5}
              spellCheck={false}
              className="w-full bg-[#06100d] border border-[#2a3a35] rounded-lg px-3 py-2 text-[11px] font-mono outline-none focus:border-[#2cc295] whitespace-pre"
            />
          </div>

          {/* Response */}
          {response && (
            <div className={`rounded-lg border p-3 ${response.ok ? "border-[#2cc295]/30 bg-[#2cc295]/5" : "border-rust/30 bg-rust/5"}`}>
              <div className="flex items-center justify-between mb-1.5">
                <span className={`text-[10px] uppercase tracking-widest flex items-center gap-1.5 ${response.ok ? "text-[#2cc295]" : "text-rust"}`}>
                  {response.ok ? <Check className="size-3" /> : <AlertCircle className="size-3" />}
                  {response.ok ? "Result" : "Error"}
                  <span className="text-[#6b8079]">· {response.ms}ms</span>
                </span>
                <button
                  onClick={async () => { await navigator.clipboard.writeText(response.text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                  className="text-[#6b8079] hover:text-[#2cc295] transition"
                  aria-label="Copy result"
                >
                  {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
                </button>
              </div>
              <pre className="text-[11px] font-mono whitespace-pre-wrap break-words text-[#e7efe9] max-h-64 overflow-y-auto">{response.text}</pre>
            </div>
          )}

          <p className="text-[10px] text-[#6b8079] leading-relaxed">
            Calls go directly to the live MCP endpoint with your token and count against {serverName}&apos;s usage stats. Same path Claude Desktop and Cursor use.
          </p>
        </div>
      )}
    </div>
  );
}

// Build an example arguments JSON from the tool's input schema, so the
// textarea starts populated rather than blank. Falls back to a stub.
function exampleArgs(schema: Record<string, unknown> | undefined): string {
  const props = (schema as { properties?: Record<string, { type?: string; example?: unknown }> })?.properties;
  if (!props || Object.keys(props).length === 0) return "{}";
  const obj: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) {
    if (v?.example !== undefined) { obj[k] = v.example; continue; }
    switch (v?.type) {
      case "number":
      case "integer": obj[k] = 0; break;
      case "boolean": obj[k] = false; break;
      case "array": obj[k] = []; break;
      case "object": obj[k] = {}; break;
      default: obj[k] = "";
    }
  }
  return JSON.stringify(obj, null, 2);
}
