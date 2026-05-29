"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";
import { Card, Button, Input, Textarea, Badge } from "@/components/ui";
import { Server, Plus, Trash2, Copy, Check, AlertCircle, Key, ExternalLink, BookOpen } from "lucide-react";
import { McpInstallSnippets } from "@/components/mcp-install-snippets";

type Tool = { name: string; description: string; agentPrompt: string; inputSchema?: Record<string, unknown> };
type Config = { enabled: boolean; name?: string; description?: string; tools: Tool[] };

// MCP server panel mounted on the AI Build Studio.
// Shows up only when the build is cloud-collaborative (it's keyed by
// the cloud build id, which is the local nanoid). Authors declare
// tools; the panel shows the publicly-callable MCP URL + install
// hints for Claude Desktop and Cursor.

export function McpPanel({ buildId, isCloud, isOwner }: { buildId: string; isCloud: boolean; isOwner: boolean }) {
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    if (!isCloud) { setLoading(false); return; }
    (async () => {
      try {
        const sb = supabaseBrowser();
        if (!sb) return;
        const { data: { session } } = await sb.auth.getSession();
        if (!session) return;
        const res = await fetch(`/api/v2/builds/${buildId}/mcp-config`, { headers: { Authorization: `Bearer ${session.access_token}` } });
        const data = await res.json();
        if (data.ok) setConfig(data.config ?? { enabled: false, tools: [] });
      } catch { /* silent */ }
      setLoading(false);
    })();
  }, [buildId, isCloud]);

  async function save(next: Config | null) {
    setBusy(true); setError(null);
    try {
      const sb = supabaseBrowser();
      if (!sb) { setError("Cloud sync isn't configured."); return; }
      const { data: { session } } = await sb.auth.getSession();
      if (!session) { setError("Sign in first."); return; }
      const res = await fetch(`/api/v2/builds/${buildId}/mcp-config`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ config: next }),
      });
      const data = await res.json();
      if (!data.ok) { setError(data.message || data.error || "Couldn't save."); return; }
      setConfig(next ?? { enabled: false, tools: [] });
    } finally {
      setBusy(false);
    }
  }

  if (!isCloud) {
    return (
      <div className="p-5 text-sm space-y-3">
        <h3 className="font-medium flex items-center gap-2"><Server className="size-4 text-emerald" /> MCP server</h3>
        <p className="text-muted leading-relaxed">
          Promote this build to the cloud (Pair menu) to publish it as an MCP server. Once it&apos;s cloud-collaborative, your tools become invokable by Claude Desktop, Cursor, and any MCP-aware client.
        </p>
      </div>
    );
  }
  if (loading) return <div className="p-5 text-sm text-muted">Loading…</div>;

  const cfg: Config = config ?? { enabled: false, tools: [] };
  const url = `${origin}/api/mcp/${buildId}`;

  return (
    <div className="flex flex-col h-full overflow-y-auto p-4 space-y-5">
      <header>
        <div className="flex items-center justify-between">
          <h3 className="font-medium flex items-center gap-2"><Server className="size-4 text-emerald" /> MCP server</h3>
          {isOwner && (
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={cfg.enabled}
                onChange={(e) => save({ ...cfg, enabled: e.target.checked })}
                disabled={busy}
                className="accent-emerald"
              />
              {cfg.enabled ? "Live" : "Off"}
            </label>
          )}
        </div>
        <p className="text-xs text-muted mt-1 leading-relaxed">
          Turn this build into tools any MCP client can install. Each tool has a name, a description, and an agent prompt — clients call the tool with arguments; Claude runs the prompt with those arguments and returns the result.
        </p>
      </header>

      {/* Public URL + install hints */}
      <Card className="p-4 bg-surface-2/40 space-y-3">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-emerald mb-2">Server URL</div>
          <UrlPill text={url} />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-emerald mb-2">Install snippet</div>
          <McpInstallSnippets serverName={cfg.name ?? buildId} url={url} />
        </div>
        <a href="https://modelcontextprotocol.io" target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted hover:text-emerald transition">
          <BookOpen className="size-2.5" /> MCP docs <ExternalLink className="size-2.5" />
        </a>
      </Card>

      {/* Usage stats — visible to all members; numbers nudge authors */}
      <McpStats buildId={buildId} />

      {/* Server metadata */}
      {isOwner && (
        <Card className="p-4 space-y-3">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted mb-1.5">Server name</div>
            <Input value={cfg.name ?? ""} onChange={(e) => save({ ...cfg, name: e.target.value })} placeholder="Maize price coach" />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted mb-1.5">Description</div>
            <Textarea value={cfg.description ?? ""} onChange={(e) => save({ ...cfg, description: e.target.value })} rows={2} placeholder="Tools for cassava + maize farmers in West Africa" />
          </div>
        </Card>
      )}

      {/* Tools */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs uppercase tracking-widest text-emerald">Tools ({cfg.tools.length})</h4>
          {isOwner && (
            <Button size="sm" variant="secondary" onClick={() => save({ ...cfg, tools: [...cfg.tools, { name: `tool_${cfg.tools.length + 1}`, description: "", agentPrompt: "" }] })}>
              <Plus className="size-3" /> Add tool
            </Button>
          )}
        </div>
        {cfg.tools.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-6 text-xs text-muted text-center">
            No tools yet. Add one above — each tool becomes individually invokable.
          </div>
        ) : (
          <ul className="space-y-3">
            {cfg.tools.map((t, i) => (
              <li key={i}>
                <ToolEditor
                  tool={t}
                  editable={isOwner}
                  onChange={(next) => save({ ...cfg, tools: cfg.tools.map((x, j) => j === i ? next : x) })}
                  onRemove={() => save({ ...cfg, tools: cfg.tools.filter((_, j) => j !== i) })}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && (
        <div className="text-xs text-rust flex items-start gap-1.5">
          <AlertCircle className="size-3.5 shrink-0 mt-0.5" />{error}
        </div>
      )}

      <Card className="p-3 text-[10px] text-muted leading-relaxed bg-amber/5 border-amber/30">
        <Key className="size-3 text-amber inline mr-1.5" />
        MCP tokens are managed in <strong className="text-foreground">Settings → MCP tokens</strong>. Issue separate tokens for each client (Claude Desktop, Cursor, etc.) so you can revoke individually.
      </Card>
    </div>
  );
}

function ToolEditor({ tool, editable, onChange, onRemove }: { tool: Tool; editable: boolean; onChange: (next: Tool) => void; onRemove: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="p-3">
      <div className="flex items-start gap-3">
        <Badge color="emerald">{tool.name || "unnamed"}</Badge>
        <div className="flex-1 min-w-0">
          <div className="text-xs text-muted truncate">{tool.description || "—"}</div>
        </div>
        {editable && (
          <>
            <button onClick={() => setOpen(!open)} className="text-[10px] uppercase tracking-widest text-muted hover:text-emerald transition">
              {open ? "Close" : "Edit"}
            </button>
            <button onClick={onRemove} className="text-muted hover:text-rust" aria-label="Remove tool">
              <Trash2 className="size-3.5" />
            </button>
          </>
        )}
      </div>
      {open && (
        <div className="mt-3 space-y-3 pt-3 border-t border-border">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted mb-1">Name (snake_case)</div>
            <Input value={tool.name} onChange={(e) => onChange({ ...tool, name: e.target.value.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 60) })} />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted mb-1">Description (what the tool does)</div>
            <Input value={tool.description} onChange={(e) => onChange({ ...tool, description: e.target.value })} placeholder="Look up the median market price for a crop in a given region." />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted mb-1">Agent prompt (run on every call)</div>
            <Textarea
              value={tool.agentPrompt}
              onChange={(e) => onChange({ ...tool, agentPrompt: e.target.value })}
              rows={6}
              placeholder={"You are a price-lookup tool. The user calls you with { crop, region, currency }.\nReturn a single number followed by the currency code, on one line. No commentary."}
              className="font-[family-name:var(--font-mono)] text-xs"
            />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted mb-1">Input schema (JSON schema, optional)</div>
            <Textarea
              value={JSON.stringify(tool.inputSchema ?? { type: "object", properties: { crop: { type: "string" }, region: { type: "string" } } }, null, 2)}
              onChange={(e) => {
                try {
                  const next = JSON.parse(e.target.value);
                  onChange({ ...tool, inputSchema: next });
                } catch {
                  // Leave the raw text; user can fix typos before saving the next field.
                }
              }}
              rows={6}
              className="font-[family-name:var(--font-mono)] text-xs"
            />
          </div>
        </div>
      )}
    </Card>
  );
}

function UrlPill({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <code className="flex-1 min-w-0 break-all bg-[#06100d] border border-border rounded-lg px-3 py-2 text-[10px] font-[family-name:var(--font-mono)]">{text}</code>
      <Button
        size="sm"
        variant="ghost"
        onClick={async () => {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        aria-label="Copy URL"
      >
        {copied ? <Check className="size-3.5 text-emerald" /> : <Copy className="size-3.5" />}
      </Button>
    </div>
  );
}

// ─── Stats ────────────────────────────────────────────────────────────────
type Stats = {
  totals: { calls: number; okCalls: number; tokensIn: number; tokensOut: number; costUsd: number; uniqueCallers: number };
  tools: Array<{ name: string; calls: number; tokensIn: number; tokensOut: number; costUsd: number; errors: number }>;
  daily: Array<{ day: string; n: number }>;
  recent: Array<{ callerHandle: string; tool: string; tokensIn: number; tokensOut: number; ok: boolean; error: string | null; durationMs: number | null; ts: string }>;
};

function McpStats({ buildId }: { buildId: string }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const sb = supabaseBrowser();
        if (!sb) return;
        const { data: { session } } = await sb.auth.getSession();
        if (!session) return;
        const res = await fetch(`/api/v2/builds/${buildId}/mcp-stats`, { headers: { Authorization: `Bearer ${session.access_token}` } });
        const data = await res.json();
        if (data.ok) setStats(data);
      } catch { /* silent */ }
      setLoading(false);
    })();
  }, [buildId]);

  if (loading) return <div className="text-xs text-muted italic">Loading usage…</div>;
  if (!stats || stats.totals.calls === 0) {
    return (
      <Card className="p-4 text-xs text-muted">
        <div className="font-medium text-foreground mb-1">No invocations yet</div>
        <p className="leading-relaxed">Once an MCP client calls one of your tools, you&apos;ll see call counts, token usage, costs, and a recent log here.</p>
      </Card>
    );
  }

  const maxDaily = Math.max(...stats.daily.map((d) => d.n), 1);

  return (
    <div className="space-y-3">
      <h4 className="text-xs uppercase tracking-widest text-emerald">Usage · last 30 days</h4>
      <div className="grid grid-cols-4 gap-2">
        <StatBox label="Calls" value={stats.totals.calls.toLocaleString()} />
        <StatBox label="Callers" value={String(stats.totals.uniqueCallers)} tone="amber" />
        <StatBox label="Tokens (out)" value={`${(stats.totals.tokensOut / 1000).toFixed(1)}k`} tone="indigo" />
        <StatBox label="Cost" value={`$${stats.totals.costUsd.toFixed(2)}`} tone="rust" />
      </div>

      {/* 14-day sparkline */}
      <Card className="p-3">
        <div className="text-[10px] uppercase tracking-widest text-muted mb-2">Daily calls — past 14 days</div>
        <div className="flex items-end gap-0.5 h-12">
          {stats.daily.map((d) => (
            <div key={d.day} className="flex-1 bg-emerald/40 rounded-sm" style={{ height: `${Math.max(2, (d.n / maxDaily) * 100)}%` }} title={`${d.day}: ${d.n}`} />
          ))}
        </div>
      </Card>

      {/* Per-tool rollup */}
      <Card className="p-3">
        <div className="text-[10px] uppercase tracking-widest text-muted mb-2">By tool</div>
        <table className="w-full text-xs">
          <thead className="text-[10px] uppercase tracking-widest text-muted">
            <tr>
              <th className="text-left py-1.5">Tool</th>
              <th className="text-right py-1.5">Calls</th>
              <th className="text-right py-1.5">Tok in/out</th>
              <th className="text-right py-1.5">Cost</th>
              <th className="text-right py-1.5">Errors</th>
            </tr>
          </thead>
          <tbody>
            {stats.tools.map((t) => (
              <tr key={t.name} className="border-t border-border">
                <td className="py-1.5 font-mono">{t.name}</td>
                <td className="py-1.5 text-right font-mono text-emerald">{t.calls}</td>
                <td className="py-1.5 text-right font-mono text-muted">{(t.tokensIn / 1000).toFixed(1)}k / {(t.tokensOut / 1000).toFixed(1)}k</td>
                <td className="py-1.5 text-right font-mono">${t.costUsd.toFixed(3)}</td>
                <td className="py-1.5 text-right font-mono text-rust">{t.errors || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Recent log */}
      <Card className="p-3">
        <div className="text-[10px] uppercase tracking-widest text-muted mb-2">Recent invocations</div>
        <ul className="space-y-1 max-h-48 overflow-y-auto">
          {stats.recent.map((r, i) => (
            <li key={i} className="text-[10px] flex items-center gap-2 py-0.5">
              <span className={`size-1.5 rounded-full shrink-0 ${r.ok ? "bg-emerald" : "bg-rust"}`} />
              <span className="font-mono text-muted">caller_{r.callerHandle}</span>
              <span className="text-foreground font-mono">{r.tool}</span>
              <span className="text-muted ml-auto">{r.durationMs ? `${r.durationMs}ms` : ""} {r.tokensOut > 0 ? `· ${r.tokensOut}t` : ""}</span>
              <span className="text-muted">{new Date(r.ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function StatBox({ label, value, tone = "emerald" }: { label: string; value: string; tone?: "emerald" | "amber" | "indigo" | "rust" }) {
  const colors = { emerald: "text-emerald", amber: "text-amber", indigo: "text-indigo", rust: "text-rust" } as const;
  return (
    <div className="rounded-xl border border-border bg-surface-2/40 p-2.5">
      <div className="text-[10px] uppercase tracking-widest text-muted">{label}</div>
      <div className={`mt-0.5 font-[family-name:var(--font-display)] text-lg font-semibold ${colors[tone]}`}>{value}</div>
    </div>
  );
}
