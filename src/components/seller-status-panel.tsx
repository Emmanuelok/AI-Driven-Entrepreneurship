"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";
import { Button, Card, Badge } from "@/components/ui";
import { Wallet, Check, AlertCircle, ExternalLink, Loader2 } from "lucide-react";

type SellerStatus = {
  ok: boolean;
  configured: boolean;
  hasAccount?: boolean;
  ready?: boolean;
  chargesEnabled?: boolean;
  payoutsEnabled?: boolean;
  detailsSubmitted?: boolean;
  country?: string;
  accountId?: string;
};

const COUNTRIES = [
  { code: "GH", name: "Ghana 🇬🇭" },
  { code: "KE", name: "Kenya 🇰🇪" },
  { code: "NG", name: "Nigeria 🇳🇬" },
  { code: "ZA", name: "South Africa 🇿🇦" },
  { code: "US", name: "United States 🇺🇸" },
  { code: "GB", name: "United Kingdom 🇬🇧" },
  { code: "CA", name: "Canada 🇨🇦" },
  { code: "AU", name: "Australia 🇦🇺" },
  { code: "DE", name: "Germany 🇩🇪" },
  { code: "FR", name: "France 🇫🇷" },
  { code: "IN", name: "India 🇮🇳" },
];

// Mounted in /studio/settings. Lets the user start (or finish) Stripe
// Connect Express onboarding and see their current readiness. Hidden
// entirely when Stripe isn't configured on the deploy.

export function SellerStatusPanel() {
  const [status, setStatus] = useState<SellerStatus | null>(null);
  const [country, setCountry] = useState("GH");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      const sb = supabaseBrowser();
      if (!sb) return;
      const { data: { session } } = await sb.auth.getSession();
      if (!session) return;
      const res = await fetch("/api/v2/payments/seller/status", { headers: { Authorization: `Bearer ${session.access_token}` } });
      const data = await res.json();
      setStatus(data);
      if (data.country) setCountry(data.country);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    refresh();
    // If we just returned from onboarding, give Stripe a beat then refresh.
    if (typeof window !== "undefined" && new URLSearchParams(location.search).get("stripe") === "done") {
      setTimeout(refresh, 1500);
    }
  }, []);

  async function onboard() {
    setBusy(true); setError(null);
    try {
      const sb = supabaseBrowser();
      if (!sb) return;
      const { data: { session } } = await sb.auth.getSession();
      if (!session) { setError("Sign in first."); return; }
      const res = await fetch("/api/v2/payments/seller/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ country }),
      });
      const data = await res.json();
      if (!data.ok || !data.url) { setError(data.error ?? "Couldn't start onboarding."); return; }
      window.location.href = data.url;
    } finally {
      setBusy(false);
    }
  }

  if (status === null) return <div className="text-sm text-muted">Loading…</div>;
  if (!status.configured) {
    return (
      <div className="text-xs text-muted">
        Payments aren&apos;t wired on this deployment. Set <code className="text-emerald">STRIPE_SECRET_KEY</code> + <code className="text-emerald">STRIPE_WEBHOOK_SECRET</code> on the project to enable paid cohorts and creator payouts.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <Wallet className="size-4 text-amber shrink-0 mt-0.5" />
        <div className="text-sm flex-1">
          <div className="font-medium">Sell paid cohorts on Sankofa</div>
          <p className="text-muted leading-relaxed mt-1">
            Connect a Stripe account to charge students for cohort enrollment. The platform takes a flat application fee — the rest goes straight to you. Stripe handles KYC, tax, and payouts in your local currency.
          </p>
        </div>
      </div>

      {!status.hasAccount ? (
        <>
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <div className="text-[10px] uppercase tracking-widest text-muted mb-1.5">Your country</div>
              <select
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="bg-surface-2 border border-border rounded-xl px-3 py-2 text-sm outline-none focus:border-emerald w-full"
              >
                {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
              </select>
            </div>
            <Button onClick={onboard} disabled={busy}>
              <ExternalLink className="size-4" /> {busy ? "Opening Stripe…" : "Start onboarding"}
            </Button>
          </div>
        </>
      ) : status.ready ? (
        <Card className="p-4 border border-emerald/30 bg-emerald/5">
          <div className="flex items-center gap-2 text-sm">
            <Check className="size-4 text-emerald" />
            <span className="font-medium">Connected — ready to take payments</span>
          </div>
          <div className="mt-2 text-[10px] text-muted">
            Account {status.accountId?.slice(0, 16)}… · {status.country}
          </div>
        </Card>
      ) : (
        <Card className="p-4 border border-amber/30 bg-amber/5">
          <div className="flex items-start gap-2 text-sm">
            <AlertCircle className="size-4 text-amber shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-medium">Finish onboarding</div>
              <div className="mt-1 text-xs text-muted">
                Charges: <Status ok={status.chargesEnabled} /> · Payouts: <Status ok={status.payoutsEnabled} /> · Details submitted: <Status ok={status.detailsSubmitted} />
              </div>
            </div>
            <Button onClick={onboard} disabled={busy} size="sm">{busy ? "…" : "Continue"}</Button>
          </div>
        </Card>
      )}

      {error && (
        <div className="text-xs text-rust flex items-start gap-1.5">
          <AlertCircle className="size-3.5 shrink-0 mt-0.5" />{error}
        </div>
      )}
    </div>
  );
}

function Status({ ok }: { ok?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 ${ok ? "text-emerald" : "text-amber"}`}>
      {ok ? <Check className="size-3" /> : <Loader2 className="size-3" />}
      {ok ? "yes" : "pending"}
    </span>
  );
}
