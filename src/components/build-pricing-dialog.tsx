"use client";

import { useEffect, useState } from "react";
import { Dialog, Button, Input, Badge } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase";
import { DollarSign, AlertCircle, Check, Trash2 } from "lucide-react";

type Pricing = { price_cents: number; currency: string; application_fee_pct: number } | null;
const CURRENCIES = ["usd", "eur", "gbp", "ghs", "kes", "ngn", "zar"];

// Owner-facing pricing dialog for a marketplace build. Same pattern as
// the cohort pricing dialog; clean copy keeps the two flows independent
// so changes to one don't surprise the other.

export function BuildPricingDialog({ slug, open, onClose, onSaved }: { slug: string; open: boolean; onClose: () => void; onSaved: () => void }) {
  const [pricing, setPricing] = useState<Pricing>(null);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("usd");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const res = await fetch(`/api/v2/marketplace/build/${slug}/pricing`);
        const data = await res.json();
        if (data.ok && data.pricing) {
          setPricing(data.pricing);
          setAmount((data.pricing.price_cents / 100).toFixed(2));
          setCurrency(data.pricing.currency);
        } else {
          setPricing(null);
          setAmount("");
          setCurrency("usd");
        }
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [slug, open]);

  async function save() {
    setBusy(true); setError(null);
    try {
      const sb = supabaseBrowser();
      if (!sb) { setError("Cloud sync isn't configured."); return; }
      const { data: { session } } = await sb.auth.getSession();
      if (!session) { setError("Sign in first."); return; }
      const cents = Math.round(parseFloat(amount || "0") * 100);
      const res = await fetch(`/api/v2/marketplace/build/${slug}/pricing`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ priceCents: cents, currency }),
      });
      const data = await res.json();
      if (!data.ok) { setError(data.message || data.error || "Couldn't save."); return; }
      onSaved();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  async function clearPricing() {
    if (!confirm("Make this build free again? Existing buyers keep their access.")) return;
    setBusy(true); setError(null);
    try {
      const sb = supabaseBrowser();
      if (!sb) return;
      const { data: { session } } = await sb.auth.getSession();
      if (!session) return;
      await fetch(`/api/v2/marketplace/build/${slug}/pricing`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ priceCents: 0 }),
      });
      onSaved();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  const cents = Math.round(parseFloat(amount || "0") * 100);
  const fee = pricing?.application_fee_pct ?? 10;
  const platformTake = Math.floor((cents * fee) / 100);
  const sellerTake = cents - platformTake;

  return (
    <Dialog open={open} onClose={onClose} title="Price this build" size="md">
      <div className="space-y-4">
        <p className="text-xs text-muted leading-relaxed">
          Charge for forks of this build. Buyers see the public preview for free; paying unlocks the &quot;Fork to my studio&quot; action. Platform takes a flat <strong className="text-emerald">{fee}%</strong>, the rest goes to you via Stripe.
        </p>

        <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted mb-1.5">Amount</div>
            <Input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="9.00" />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted mb-1.5">Currency</div>
            <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="bg-surface-2 border border-border rounded-xl px-3 py-2 text-sm outline-none focus:border-emerald">
              {CURRENCIES.map((c) => <option key={c} value={c}>{c.toUpperCase()}</option>)}
            </select>
          </div>
        </div>

        {cents > 0 && (
          <div className="rounded-xl border border-border bg-surface-2/40 p-3 text-xs space-y-1">
            <div className="flex items-center justify-between"><span className="text-muted">Buyer pays</span><span className="font-mono">{(cents / 100).toFixed(2)} {currency.toUpperCase()}</span></div>
            <div className="flex items-center justify-between"><span className="text-muted">Platform fee ({fee}%)</span><span className="font-mono text-rust">−{(platformTake / 100).toFixed(2)}</span></div>
            <div className="flex items-center justify-between font-medium pt-1 border-t border-border"><span>You receive</span><span className="font-mono text-emerald">{(sellerTake / 100).toFixed(2)} {currency.toUpperCase()}</span></div>
          </div>
        )}

        {error && (
          <div className="text-xs text-rust flex items-start gap-1.5"><AlertCircle className="size-3.5 shrink-0 mt-0.5" />{error}</div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          {pricing && (
            <Button variant="ghost" onClick={clearPricing} disabled={busy}>
              <Trash2 className="size-4 text-rust" /> Make free
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={busy || !amount || cents <= 0}>
            <Check className="size-4" /> {busy ? "Saving…" : pricing ? "Update price" : "Set price"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

export function BuildPriceBadge({ pricing }: { pricing: Pricing }) {
  if (!pricing || pricing.price_cents === 0) return <Badge color="emerald">Free</Badge>;
  return (
    <Badge color="amber">
      <DollarSign className="size-2.5" />{(pricing.price_cents / 100).toFixed(2)} {pricing.currency.toUpperCase()}
    </Badge>
  );
}
