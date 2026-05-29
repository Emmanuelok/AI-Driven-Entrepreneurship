"use client";

import { useState } from "react";
import { Dialog, Button, Textarea } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase";
import { Undo2, AlertCircle, Check } from "lucide-react";

// Drop-in "Request refund" button for buyers. Shown on cohort + build
// detail pages once they've enrolled/purchased. The seller decides;
// approved → automatic Stripe refund + revoked access.

export function RefundRequestButton({ kind, refId, label = "Request refund" }: { kind: "cohort" | "build"; refId: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function submit() {
    setBusy(true); setFeedback(null);
    try {
      const sb = supabaseBrowser();
      if (!sb) { setFeedback({ kind: "err", text: "Cloud sync isn't configured." }); return; }
      const { data: { session } } = await sb.auth.getSession();
      if (!session) { setFeedback({ kind: "err", text: "Sign in first." }); return; }
      const res = await fetch("/api/v2/payments/refund-request", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ kind, refId, reason: reason.trim() || undefined }),
      });
      const data = await res.json();
      if (!data.ok) { setFeedback({ kind: "err", text: data.error ?? "Couldn't submit." }); return; }
      setFeedback({ kind: "ok", text: data.alreadyPending ? "You already have a pending request for this." : "Request sent. The seller decides next." });
      setReason("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={() => { setOpen(true); setFeedback(null); }}
        className="text-[10px] uppercase tracking-widest text-muted hover:text-rust inline-flex items-center gap-1 transition"
      >
        <Undo2 className="size-2.5" /> {label}
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Request refund" size="md">
        <div className="space-y-3">
          <p className="text-xs text-muted leading-relaxed">
            The seller reviews your request. If approved, Stripe automatically refunds the original payment + reverses the platform fee, and you immediately lose access to the {kind === "cohort" ? "cohort" : "build"}. Approval typically takes 1-3 days; decision is at the seller&apos;s discretion.
          </p>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted mb-1">Reason (optional but helps)</div>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Bought the wrong cohort — meant to enroll in the next intake. Started but the content overlaps with a class I already took." />
          </div>
          {feedback && (
            <div className={`text-xs flex items-start gap-1.5 ${feedback.kind === "err" ? "text-rust" : "text-emerald"}`}>
              {feedback.kind === "err" ? <AlertCircle className="size-3.5 shrink-0 mt-0.5" /> : <Check className="size-3.5 shrink-0 mt-0.5" />}
              {feedback.text}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={busy}>
              <Undo2 className="size-4" /> {busy ? "Submitting…" : "Submit request"}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
