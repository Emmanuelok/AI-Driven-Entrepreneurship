"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";
import { Dialog, Button, Input } from "@/components/ui";
import { Share2, Copy, Check, AlertCircle, Link as LinkIcon } from "lucide-react";

// "Share with a co-founder" — creates a one-time share token that
// clones the current venture snapshot into the recipient's account.
// One-way (not collaborative). Real-time collab requires a venture-row
// refactor we haven't shipped yet.

type Venture = { id: string; name: string };

export function ShareVentureButton({ venture }: { venture: Venture & Record<string, unknown> }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [maxUses, setMaxUses] = useState("5");

  async function create() {
    setBusy(true);
    setError(null);
    setShareUrl(null);
    try {
      const sb = supabaseBrowser();
      if (!sb) {
        setError("Cloud sync isn't configured. Set up Supabase on this project to share with co-founders.");
        return;
      }
      const { data: { session } } = await sb.auth.getSession();
      if (!session) {
        setError("Sign in first so we can issue the share link.");
        return;
      }
      const res = await fetch("/api/venture/share", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ ventureId: venture.id, payload: venture, maxUses: parseInt(maxUses) || 5 }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || "Couldn't create share link.");
        return;
      }
      setShareUrl(data.shareUrl);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function copy() {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <>
      <button
        onClick={() => { setOpen(true); setShareUrl(null); setError(null); }}
        className="size-11 rounded-full border border-border hover:border-emerald/40 bg-surface hover:bg-surface-2 transition flex items-center justify-center text-muted hover:text-emerald"
        title="Share with a co-founder"
      >
        <Share2 className="size-4" />
      </button>

      <Dialog open={open} onClose={() => setOpen(false)} title="Share with a co-founder" size="md">
        <div className="space-y-4">
          <p className="text-sm text-muted leading-relaxed">
            Sankofa creates a one-time link a co-founder can use to <strong className="text-foreground">clone this
            venture</strong> into their own account — Lean Canvas, interviews, MVP tasks, deck, all of it.
          </p>
          <div className="rounded-xl border border-amber/30 bg-amber/5 p-3 text-xs text-muted flex items-start gap-2">
            <AlertCircle className="size-3.5 text-amber shrink-0 mt-0.5" />
            <span>One-way clone — not live collaboration. Edits diverge from there. Real-time co-editing is a future release.</span>
          </div>

          {!shareUrl && (
            <>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-muted mb-1.5">Max redemptions</div>
                <Input type="number" min="1" max="100" value={maxUses} onChange={(e) => setMaxUses(e.target.value)} />
                <div className="text-[10px] text-muted mt-1">Link expires after 14 days or this many uses, whichever comes first.</div>
              </div>
              {error && <div className="text-sm text-rust">{error}</div>}
              <div className="flex justify-end">
                <Button onClick={create} disabled={busy}>
                  <LinkIcon className="size-4" /> {busy ? "Creating…" : "Create share link"}
                </Button>
              </div>
            </>
          )}

          {shareUrl && (
            <div className="space-y-3">
              <div className="text-[10px] uppercase tracking-widest text-emerald">Share link ready</div>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={shareUrl}
                  className="flex-1 bg-surface-2 border border-border rounded-xl px-3 py-2 text-xs font-mono outline-none"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <Button onClick={copy} variant="secondary">
                  {copied ? <Check className="size-4 text-emerald" /> : <Copy className="size-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted">Send this on WhatsApp / email. When opened, they&apos;ll be prompted to sign in then redeem.</p>
            </div>
          )}
        </div>
      </Dialog>
    </>
  );
}
