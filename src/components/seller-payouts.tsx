"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase";
import { Card, Badge } from "@/components/ui";
import { TrendingUp, GraduationCap, Hammer, ArrowRight, ExternalLink } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type Sale = { kind: "cohort" | "build"; ref_id: string; ref_name: string; buyer_id: string; amount_cents: number; currency: string; ts: string };
type Payout = { id: string; amount: number; currency: string; status: string; arrival_date: number };
type Totals = { allTime: number; last30d: number; salesCount: number; currency: string };
type Bal = { available: { amount: number; currency: string }[]; pending: { amount: number; currency: string }[] } | null;

type Data = {
  configured: boolean;
  sellerReady?: boolean;
  sales?: Sale[];
  totals?: Totals;
  balance?: Bal;
  payouts?: Payout[];
};

// Compact seller earnings dashboard. Shown below SellerStatusPanel
// in Settings when the user has at least one sale (otherwise hidden
// so the panel doesn't feel like a graveyard of zeroes).

export function SellerPayouts() {
  const [data, setData] = useState<Data | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const sb = supabaseBrowser();
        if (!sb) return;
        const { data: { session } } = await sb.auth.getSession();
        if (!session) return;
        const res = await fetch("/api/v2/payments/seller/payouts", { headers: { Authorization: `Bearer ${session.access_token}` } });
        const json = await res.json();
        if (json.ok) setData(json);
      } catch { /* silent */ }
    })();
  }, []);

  if (!data || !data.configured) return null;
  const hasAnySales = (data.totals?.salesCount ?? 0) > 0;
  if (!hasAnySales && !data.sellerReady) return null;

  return (
    <div className="space-y-4 mt-6 pt-6 border-t border-border">
      <h3 className="text-xs uppercase tracking-widest text-emerald flex items-center gap-1.5">
        <TrendingUp className="size-3" /> Your earnings
      </h3>

      {/* Top-line numbers */}
      <div className="grid grid-cols-3 gap-2">
        <Counter label="Sales (30d)" value={fmt((data.totals?.last30d ?? 0), data.totals?.currency)} />
        <Counter label="All-time" value={fmt((data.totals?.allTime ?? 0), data.totals?.currency)} tone="amber" />
        <Counter label="Count" value={String(data.totals?.salesCount ?? 0)} tone="indigo" />
      </div>

      {/* Stripe balance */}
      {data.balance && (
        <Card className="p-4 bg-surface-2/40">
          <div className="text-[10px] uppercase tracking-widest text-muted mb-2">Stripe balance</div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <div className="text-muted">Available</div>
              <div className="font-mono">{(data.balance.available ?? []).map((b) => fmt(b.amount, b.currency)).join(", ") || "0"}</div>
            </div>
            <div>
              <div className="text-muted">Pending</div>
              <div className="font-mono">{(data.balance.pending ?? []).map((b) => fmt(b.amount, b.currency)).join(", ") || "0"}</div>
            </div>
          </div>
        </Card>
      )}

      {/* Recent payouts */}
      {data.payouts && data.payouts.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted mb-2">Recent payouts</div>
          <ul className="space-y-1.5">
            {data.payouts.map((p) => (
              <li key={p.id} className="flex items-center justify-between text-xs py-1.5 border-b border-border last:border-0">
                <span className="font-mono">{fmt(p.amount, p.currency)}</span>
                <Badge color={p.status === "paid" ? "emerald" : "muted"}>{p.status}</Badge>
                <span className="text-muted">{new Date(p.arrival_date * 1000).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recent sales */}
      {data.sales && data.sales.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted mb-2">Recent sales</div>
          <ul className="space-y-1.5">
            {data.sales.slice(0, 10).map((s, i) => {
              const Icon = s.kind === "cohort" ? GraduationCap : Hammer;
              const href = s.kind === "cohort" ? `/studio/cohorts/${s.ref_id}` : `/studio/marketplace/${s.ref_id}`;
              return (
                <li key={`${s.kind}-${s.ref_id}-${s.ts}-${i}`}>
                  <Link href={href} className="flex items-center gap-2 py-1.5 hover:bg-surface-2/50 -mx-2 px-2 rounded transition group">
                    <Icon className="size-3.5 text-emerald shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs truncate">{s.ref_name || s.ref_id}</div>
                      <div className="text-[10px] text-muted">{formatDistanceToNow(new Date(s.ts), { addSuffix: true })}</div>
                    </div>
                    <span className="text-xs font-mono text-emerald">{fmt(s.amount_cents, s.currency)}</span>
                    <ArrowRight className="size-3 text-muted opacity-0 group-hover:opacity-100 transition" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <a href="https://dashboard.stripe.com/express" target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted hover:text-emerald transition">
        Stripe Express dashboard <ExternalLink className="size-2.5" />
      </a>
    </div>
  );
}

function Counter({ label, value, tone = "emerald" }: { label: string; value: string; tone?: "emerald" | "amber" | "indigo" }) {
  const colors = { emerald: "text-emerald", amber: "text-amber", indigo: "text-indigo" } as const;
  return (
    <div className="rounded-xl border border-border bg-surface-2/40 p-3">
      <div className="text-[10px] uppercase tracking-widest text-muted">{label}</div>
      <div className={`mt-1 font-[family-name:var(--font-display)] text-xl font-semibold ${colors[tone]}`}>{value}</div>
    </div>
  );
}

function fmt(cents: number, currency: string = "usd"): string {
  const code = (currency || "usd").toUpperCase();
  return `${(cents / 100).toFixed(2)} ${code}`;
}
