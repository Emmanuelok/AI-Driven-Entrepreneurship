"use client";

import { useState } from "react";
import { useByoKey } from "@/store/byo-key";
import { Button, Input } from "@/components/ui";
import { Key, Check, AlertCircle, ExternalLink } from "lucide-react";

// Lets a student paste their own Anthropic API key. Stored ONLY in
// localStorage. Every AI call from this device then forwards the key
// via the X-Anthropic-Key header; the server uses it for that one
// request and discards it.

export function ByoKeyPanel() {
  const { key, enabled, setKey, setEnabled, clear, hydrated } = useByoKey();
  const [draft, setDraft] = useState(key);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verified, setVerified] = useState<boolean | null>(null);

  if (!hydrated) return null;

  async function save() {
    const v = draft.trim();
    if (!v) { setError("Paste your key first."); return; }
    if (!v.startsWith("sk-ant-")) { setError("Anthropic keys start with sk-ant-."); return; }
    setError(null);
    setVerifying(true);
    setVerified(null);
    try {
      // Verify by calling /api/build/proxy with a 1-token health check.
      const res = await fetch("/api/build/proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Anthropic-Key": v },
        body: JSON.stringify({ messages: [{ role: "user", content: "ok" }], max_tokens: 1 }),
      });
      const data = await res.json();
      if (data.error) {
        setError(`Verification failed: ${data.message || data.error}`);
        setVerified(false);
      } else {
        setKey(v);
        setVerified(true);
      }
    } catch (e) {
      setError((e as Error).message);
      setVerified(false);
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          <Key className="size-4 text-amber" />
          <span>Bring your own Anthropic key</span>
        </div>
        {enabled && key && (
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="accent-emerald"
              aria-label="Use my own key for all AI calls"
            />
            {enabled ? "Active" : "Paused"}
          </label>
        )}
      </div>

      <p className="text-xs text-muted leading-relaxed">
        Heavy user? Drop your own <code className="text-emerald">sk-ant-…</code> here and every AI call on this device uses your key instead of the
        platform&apos;s. Stored only in your browser. Never sent to our servers except to forward to Anthropic for that one request.
      </p>

      <div className="flex gap-2">
        <Input
          type="password"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="sk-ant-…"
          autoComplete="off"
          spellCheck={false}
        />
        <Button onClick={save} disabled={verifying || !draft.trim()}>
          {verifying ? "Verifying…" : enabled && key ? "Update" : "Save"}
        </Button>
        {enabled && key && (
          <Button variant="ghost" onClick={() => { clear(); setDraft(""); setVerified(null); }}>Remove</Button>
        )}
      </div>

      {verified === true && (
        <div className="text-xs text-emerald flex items-center gap-1.5"><Check className="size-3.5" /> Verified. All AI calls on this device now use your key.</div>
      )}
      {error && (
        <div className="text-xs text-rust flex items-start gap-1.5"><AlertCircle className="size-3.5 shrink-0 mt-0.5" />{error}</div>
      )}

      <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener" className="text-[10px] uppercase tracking-widest text-muted hover:text-emerald inline-flex items-center gap-1">
        Generate a key at console.anthropic.com <ExternalLink className="size-2.5" />
      </a>
    </div>
  );
}
