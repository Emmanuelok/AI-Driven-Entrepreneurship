"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";
import { Badge, Button, Card } from "@/components/ui";
import { Undo2, Check, X, AlertCircle, Inbox, Send, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type Row = {
  id: string;
  kind: "cohort" | "build";
  ref_id: string;
  buyer_id?: string;
  amount_cents: number;
  currency: string;
  reason: string | null;
  status: "pending" | "approved" | "declined";
  created_at: string;
  updated_at: string;
  stripe_refund_id?: string | null;
};

// Seller-side refund inbox + buyer-side outbox combined. Mounted under
// the seller payouts dashboard in Settings. Hidden when both are empty.

export function RefundInbox() {
  const [inbox, setInbox] = useState<Row[]>([]);
  const [outbox, setOutbox] = useState<Row[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const sb = supabaseBrowser();
      if (!sb) return;
      const { data: { session } } = await sb.auth.getSession();
      if (!session) return;
      const res = await fetch("/api/v2/payments/refund-requests", { headers: { Authorization: `Bearer ${session.access_token}` } });
      const data = await res.json();
      if (data.ok) {
        setInbox(data.inbox ?? []);
        setOutbox(data.outbox ?? []);
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Realtime: a new request lands → refresh.
  useEffect(() => {
    const sb = supabaseBrowser();
    if (!sb) return;
    let ch: ReturnType<typeof sb.channel> | null = null;
    (async () => {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) return;
      ch = sb.channel(`refunds:${session.user.id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "refund_requests" }, () => refresh())
        .subscribe();
    })();
    return () => { if (ch) sb.removeChannel(ch); };
  }, [refresh]);

  async function decide(id: string, decision: "approved" | "declined") {
    if (decision === "approved" && !confirm("Approve refund? Stripe will refund the buyer immediately and revoke their access.")) return;
    setBusyId(id); setError(null);
    try {
      const sb = supabaseBrowser();
      if (!sb) return;
      const { data: { session } } = await sb.auth.getSession();
      if (!session) return;
      const res = await fetch(`/api/v2/payments/refund-request/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ decision }),
      });
      const data = await res.json();
      if (!data.ok) { setError(data.message || data.error || "Couldn't decide."); return; }
      refresh();
    } finally {
      setBusyId(null);
    }
  }

  if (inbox.length === 0 && outbox.length === 0) return null;

  return (
    <div className="space-y-4 mt-6 pt-6 border-t border-border">
      <h3 className="text-xs uppercase tracking-widest text-amber flex items-center gap-1.5">
        <Undo2 className="size-3" /> Refunds
      </h3>

      {inbox.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted mb-2 flex items-center gap-1.5">
            <Inbox className="size-2.5" /> Inbox ({inbox.filter((r) => r.status === "pending").length} pending)
          </div>
          <ul className="space-y-2">
            {inbox.map((r) => (
              <li key={r.id}>
                <Card className="p-3">
                  <div className="flex items-start gap-3">
                    <StatusPill status={r.status} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs">
                        <span className="font-mono text-emerald">{(r.amount_cents / 100).toFixed(2)} {r.currency.toUpperCase()}</span>
                        {" · "}
                        <span className="text-muted">{r.kind} · {r.ref_id.slice(0, 24)}</span>
                      </div>
                      {r.reason && <p className="text-xs text-muted mt-1 italic">&ldquo;{r.reason}&rdquo;</p>}
                      <div className="text-[10px] text-muted mt-1">requested {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}</div>
                    </div>
                    {r.status === "pending" && (
                      <div className="flex gap-1.5 shrink-0">
                        <Button size="sm" variant="ghost" onClick={() => decide(r.id, "declined")} disabled={busyId === r.id}>
                          <X className="size-3.5 text-rust" />
                        </Button>
                        <Button size="sm" onClick={() => decide(r.id, "approved")} disabled={busyId === r.id}>
                          <Check className="size-3.5" /> Refund
                        </Button>
                      </div>
                    )}
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </div>
      )}

      {outbox.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted mb-2 flex items-center gap-1.5">
            <Send className="size-2.5" /> Your requests
          </div>
          <ul className="space-y-2">
            {outbox.map((r) => (
              <li key={r.id} className="rounded-xl border border-border p-3 text-xs">
                <div className="flex items-start gap-3">
                  <StatusPill status={r.status} />
                  <div className="flex-1 min-w-0">
                    <span className="font-mono text-emerald">{(r.amount_cents / 100).toFixed(2)} {r.currency.toUpperCase()}</span>
                    {" · "}
                    <span className="text-muted">{r.kind} · {r.ref_id.slice(0, 24)}</span>
                    <div className="text-[10px] text-muted mt-1">{formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}</div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <div className="text-xs text-rust flex items-start gap-1.5"><AlertCircle className="size-3.5 shrink-0 mt-0.5" />{error}</div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: Row["status"] }) {
  if (status === "pending") return <Badge color="amber"><Clock className="size-2.5" /> pending</Badge>;
  if (status === "approved") return <Badge color="emerald"><Check className="size-2.5" /> refunded</Badge>;
  return <Badge color="rust"><X className="size-2.5" /> declined</Badge>;
}
