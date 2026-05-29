"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";
import { Card, Button, Input } from "@/components/ui";
import { Key, Plus, Trash2, Copy, Check, AlertCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type TokenRow = { id: string; name: string; last_used_at: string | null; created_at: string };

// MCP tokens panel mounted in Settings. Hidden when the user has no
// tokens AND hasn't tried to create one — keeps the Settings page
// uncluttered for non-developers.

export function McpTokensPanel() {
  const [tokens, setTokens] = useState<TokenRow[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [revealedToken, setRevealedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      const sb = supabaseBrowser();
      if (!sb) return;
      const { data: { session } } = await sb.auth.getSession();
      if (!session) { setTokens([]); return; }
      const res = await fetch("/api/v2/mcp/tokens", { headers: { Authorization: `Bearer ${session.access_token}` } });
      const data = await res.json();
      if (data.ok) setTokens(data.results ?? []);
    } catch { setTokens([]); }
  }
  useEffect(() => { refresh(); }, []);

  async function create() {
    setBusy(true); setError(null);
    try {
      const sb = supabaseBrowser();
      if (!sb) return;
      const { data: { session } } = await sb.auth.getSession();
      if (!session) { setError("Sign in first."); return; }
      const res = await fetch("/api/v2/mcp/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!data.ok) { setError(data.error ?? "Couldn't create."); return; }
      setRevealedToken(data.token);
      setName("");
      refresh();
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    if (!confirm("Revoke this token? Any client using it will lose access immediately.")) return;
    const sb = supabaseBrowser();
    if (!sb) return;
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return;
    await fetch(`/api/v2/mcp/tokens/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${session.access_token}` } });
    refresh();
  }

  if (tokens === null) return null;
  if (tokens.length === 0 && !creating && !revealedToken) {
    return (
      <div className="mt-6 pt-6 border-t border-border">
        <div className="flex items-center justify-between">
          <h3 className="text-xs uppercase tracking-widest text-emerald flex items-center gap-1.5">
            <Key className="size-3" /> MCP tokens
          </h3>
          <button onClick={() => setCreating(true)} className="text-[10px] uppercase tracking-widest text-muted hover:text-emerald inline-flex items-center gap-1 transition">
            <Plus className="size-2.5" /> New token
          </button>
        </div>
        <p className="text-[10px] text-muted mt-2">
          MCP tokens authenticate calls from Claude Desktop, Cursor, and other clients to your published MCP servers (set up via the MCP tab on each cloud build).
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6 pt-6 border-t border-border space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs uppercase tracking-widest text-emerald flex items-center gap-1.5">
          <Key className="size-3" /> MCP tokens
        </h3>
        {!revealedToken && (
          <Button size="sm" variant="secondary" onClick={() => setCreating(true)}><Plus className="size-3" /> New token</Button>
        )}
      </div>

      {revealedToken && (
        <Card className="p-3 border-amber/40 bg-amber/5">
          <div className="text-[10px] uppercase tracking-widest text-amber mb-2">Token created · save it now, you won&apos;t see it again</div>
          <div className="flex items-center gap-2">
            <code className="flex-1 min-w-0 break-all bg-[#06100d] border border-border rounded-lg px-3 py-2 text-[10px] font-[family-name:var(--font-mono)]">{revealedToken}</code>
            <Button size="sm" variant="ghost" onClick={async () => { await navigator.clipboard.writeText(revealedToken); setCopied(true); setTimeout(() => setCopied(false), 1500); }} aria-label="Copy">
              {copied ? <Check className="size-3.5 text-emerald" /> : <Copy className="size-3.5" />}
            </Button>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setRevealedToken(null)} className="mt-3">Done</Button>
        </Card>
      )}

      {creating && !revealedToken && (
        <Card className="p-3 space-y-2">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted mb-1">Label</div>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Claude Desktop · MacBook" autoFocus />
            <p className="text-[10px] text-muted mt-1">A nickname so you remember which client is using this token.</p>
          </div>
          {error && (
            <div className="text-xs text-rust flex items-start gap-1.5"><AlertCircle className="size-3.5 shrink-0 mt-0.5" />{error}</div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => { setCreating(false); setName(""); }}>Cancel</Button>
            <Button onClick={create} disabled={busy || name.trim().length < 2}>{busy ? "Creating…" : "Create"}</Button>
          </div>
        </Card>
      )}

      <ul className="space-y-2">
        {tokens.map((t) => (
          <li key={t.id} className="group rounded-xl border border-border p-3 flex items-center gap-3">
            <Key className="size-3.5 text-emerald shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm">{t.name}</div>
              <div className="text-[10px] text-muted">
                created {formatDistanceToNow(new Date(t.created_at), { addSuffix: true })}
                {t.last_used_at ? <> · last used {formatDistanceToNow(new Date(t.last_used_at), { addSuffix: true })}</> : <> · never used</>}
              </div>
            </div>
            <button onClick={() => revoke(t.id)} className="opacity-0 group-hover:opacity-100 transition text-muted hover:text-rust" aria-label="Revoke">
              <Trash2 className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
