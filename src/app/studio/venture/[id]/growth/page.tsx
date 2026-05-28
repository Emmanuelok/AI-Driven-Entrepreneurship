"use client";

import { use, useEffect, useMemo, useState } from "react";
import { notFound } from "next/navigation";
import { useStore } from "@/store";
import { Card, Button, Input, Stat, Badge } from "@/components/ui";
import { TrendingUp, Activity, AlertTriangle, Flame } from "lucide-react";
// Recharts is ~100KB gzipped — lazy-load via the GrowthChart component
// so the rest of the cockpit paints fast.
import dynamic from "next/dynamic";
const GrowthChart = dynamic(() => import("@/components/growth-chart").then((m) => m.GrowthChart), {
  ssr: false,
  loading: () => <div className="h-[260px] flex items-center justify-center text-xs text-muted">Loading chart…</div>,
});

type Econ = {
  pricePoint?: number;
  marginalCost?: number;
  cacUsd?: number;
  payingCustomers?: number;
  churnMonthlyPct?: number;
  burnMonthlyUsd?: number;
  cashOnHandUsd?: number;
};

type Funnel = { acquisition: number; activation: number; retention: number; referral: number; revenue: number };

export default function GrowthPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { ventures, updateVenture } = useStore();
  const found = ventures.find((x) => x.id === id);

  const [mrr, setMrr] = useState("0");
  const [customers, setCustomers] = useState("0");
  const [econ, setEcon] = useState<Econ>({});
  const [funnel, setFunnel] = useState<Funnel>({ acquisition: 0, activation: 0, retention: 0, referral: 0, revenue: 0 });

  useEffect(() => {
    if (!found) return;
    setMrr(String(found.metrics.mrr));
    setCustomers(String(found.metrics.customers));
    setEcon(found.economics ?? {});
    setFunnel(found.funnel ?? { acquisition: 0, activation: 0, retention: 0, referral: 0, revenue: 0 });
  }, [found?.id]);

  // Unit economics math (computed before any conditional return so hooks stay stable)
  const price = econ.pricePoint ?? 0;
  const mCost = econ.marginalCost ?? 0;
  const grossMarginPct = price > 0 ? ((price - mCost) / price) * 100 : 0;
  const churn = econ.churnMonthlyPct ?? 0;
  const cac = econ.cacUsd ?? 0;
  const ltv = churn > 0 ? (price - mCost) / (churn / 100) : 0;
  const ltvCac = cac > 0 ? ltv / cac : 0;
  const paybackMonths = (price - mCost) > 0 && cac > 0 ? cac / (price - mCost) : 0;
  const burn = econ.burnMonthlyUsd ?? 0;
  const cash = econ.cashOnHandUsd ?? 0;
  const runwayMonths = burn > 0 ? cash / burn : 0;

  const conv = (a: number, b: number) => (a > 0 ? (b / a) * 100 : 0);
  const acqAct = conv(funnel.acquisition, funnel.activation);
  const actRet = conv(funnel.activation, funnel.retention);
  const retRef = conv(funnel.retention, funnel.referral);
  const retRev = conv(funnel.retention, funnel.revenue);

  const trend = useMemo(() => {
    const arr: { week: string; mrr: number; customers: number }[] = [];
    let m = parseFloat(mrr) || 0;
    let c = parseFloat(customers) || 0;
    for (let i = 0; i < 8; i++) {
      arr.push({ week: i === 0 ? "Now" : `+${i}mo`, mrr: Math.round(m), customers: Math.round(c) });
      const surviving = c * (1 - churn / 100);
      const newCustomers = funnel.acquisition * (acqAct / 100) * (actRet / 100) * 0.1;
      c = surviving + newCustomers;
      m = c * (price - mCost) + (c * mCost);
    }
    return arr;
  }, [mrr, customers, churn, funnel, acqAct, actRet, price, mCost]);

  if (!found) { notFound(); return null; }
  const v = found;
  const netBurn = burn - (price - mCost) * (v.metrics.customers ?? 0);
  const dirty = JSON.stringify(econ) !== JSON.stringify(v.economics ?? {}) || JSON.stringify(funnel) !== JSON.stringify(v.funnel ?? { acquisition: 0, activation: 0, retention: 0, referral: 0, revenue: 0 });

  function update() {
    updateVenture(v.id, {
      metrics: { ...v.metrics, mrr: parseFloat(mrr) || 0, customers: parseInt(customers) || 0, revenue: v.metrics.revenue + (parseFloat(mrr) || 0) },
    });
  }
  function saveEcon() { updateVenture(v.id, { economics: econ, funnel }); }

  return (
    <div className="max-w-7xl mx-auto px-5 sm:px-8 py-10 space-y-6">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-emerald mb-1 flex items-center gap-1.5">
            <TrendingUp className="size-3.5" /> Phase 6 — Growth & Economics
          </p>
          <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold">The numbers that decide if this venture lives.</h2>
          <p className="text-sm text-muted mt-1 max-w-2xl">MRR. CAC. LTV. Payback. Runway. AARRR. If you don&apos;t know them by heart, no investor will trust you.</p>
        </div>
      </header>

      {/* Snapshot */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="MRR" value={`$${v.metrics.mrr.toLocaleString()}`} color="emerald" />
        <Stat label="Paying customers" value={v.metrics.customers} color="amber" />
        <Stat label="ARPU" value={`$${v.metrics.customers ? Math.round(v.metrics.mrr / v.metrics.customers) : 0}`} color="indigo" />
        <Stat label="Revenue (lifetime)" value={`$${v.metrics.revenue.toLocaleString()}`} color="rust" />
      </div>

      {/* Unit economics */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-medium flex items-center gap-2"><Flame className="size-4 text-amber" /> Unit economics</h3>
          <Button size="sm" onClick={saveEcon} disabled={!dirty}>Save</Button>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          <FieldNum label="Price / customer / month" value={econ.pricePoint} onChange={(n) => setEcon({ ...econ, pricePoint: n })} prefix="$" />
          <FieldNum label="Variable cost / customer" value={econ.marginalCost} onChange={(n) => setEcon({ ...econ, marginalCost: n })} prefix="$" />
          <FieldNum label="CAC (acquisition cost)" value={econ.cacUsd} onChange={(n) => setEcon({ ...econ, cacUsd: n })} prefix="$" />
          <FieldNum label="Monthly churn %" value={econ.churnMonthlyPct} onChange={(n) => setEcon({ ...econ, churnMonthlyPct: n })} suffix="%" />
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Metric label="Gross margin" value={`${grossMarginPct.toFixed(0)}%`} good={grossMarginPct >= 60} note={grossMarginPct < 40 ? "Below 40% = hard to scale" : grossMarginPct < 60 ? "Below SaaS bar" : "Healthy"} />
          <Metric label="LTV" value={`$${ltv.toFixed(0)}`} good={ltv > 0} note="(price − cost) ÷ churn" />
          <Metric label="LTV / CAC" value={`${ltvCac.toFixed(1)}x`} good={ltvCac >= 3} note={ltvCac < 1 ? "You're paying to lose customers" : ltvCac < 3 ? "OK, push to ≥3x" : "Healthy"} />
          <Metric label="Payback period" value={`${paybackMonths.toFixed(1)} mo`} good={paybackMonths > 0 && paybackMonths < 12} note={paybackMonths > 18 ? "Too slow — won't survive without funding" : "Under 12 months is goal"} />
        </div>
      </Card>

      {/* Runway */}
      <Card className="p-6">
        <h3 className="font-medium mb-4 flex items-center gap-2"><AlertTriangle className="size-4 text-rust" /> Runway</h3>
        <div className="grid sm:grid-cols-3 gap-3 mb-4">
          <FieldNum label="Monthly burn (USD)" value={econ.burnMonthlyUsd} onChange={(n) => setEcon({ ...econ, burnMonthlyUsd: n })} prefix="$" />
          <FieldNum label="Cash on hand (USD)" value={econ.cashOnHandUsd} onChange={(n) => setEcon({ ...econ, cashOnHandUsd: n })} prefix="$" />
          <Metric label="Runway" value={`${runwayMonths.toFixed(1)} mo`} good={runwayMonths >= 12} note={runwayMonths < 6 ? "Raise NOW or cut burn" : runwayMonths < 12 ? "Start raising — 18mo is safe" : "Healthy"} />
        </div>
        <div className="text-xs text-muted">
          Net burn (after revenue contribution): <span className={`font-mono ${netBurn > 0 ? "text-rust" : "text-emerald"}`}>${netBurn.toLocaleString()}</span>/month
        </div>
      </Card>

      {/* AARRR */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-medium flex items-center gap-2"><Activity className="size-4 text-emerald" /> Pirate metrics (AARRR) — last 30 days</h3>
          <Badge color="muted">Dave McClure</Badge>
        </div>
        <div className="grid sm:grid-cols-5 gap-2 mb-5">
          <FunnelInput label="Acquisition" value={funnel.acquisition} onChange={(n) => setFunnel({ ...funnel, acquisition: n })} hint="Visitors / reach" />
          <FunnelInput label="Activation" value={funnel.activation} onChange={(n) => setFunnel({ ...funnel, activation: n })} hint="First key action" />
          <FunnelInput label="Retention" value={funnel.retention} onChange={(n) => setFunnel({ ...funnel, retention: n })} hint="Came back" />
          <FunnelInput label="Referral" value={funnel.referral} onChange={(n) => setFunnel({ ...funnel, referral: n })} hint="Brought a friend" />
          <FunnelInput label="Revenue" value={funnel.revenue} onChange={(n) => setFunnel({ ...funnel, revenue: n })} hint="Paying" />
        </div>
        <div className="grid sm:grid-cols-4 gap-2 text-xs">
          <ConvBadge label="Acq → Act" pct={acqAct} target={30} />
          <ConvBadge label="Act → Ret" pct={actRet} target={40} />
          <ConvBadge label="Ret → Ref" pct={retRef} target={15} />
          <ConvBadge label="Ret → Rev" pct={retRev} target={20} />
        </div>
      </Card>

      {/* Forecast */}
      <Card className="p-6">
        <h3 className="font-medium mb-4">6-month forecast (your inputs)</h3>
        <GrowthChart data={trend} />
        <p className="text-[10px] text-muted text-center mt-3">Projection: current MRR × (1 − churn) + (new acquisitions × activation rate). For napkin math only.</p>
      </Card>

      {/* Manual metric snapshot */}
      <Card className="p-5">
        <h3 className="font-medium mb-4">Snapshot metrics</h3>
        <div className="grid sm:grid-cols-3 gap-3 items-end">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted mb-1.5">MRR ($)</div>
            <Input type="number" value={mrr} onChange={(e) => setMrr(e.target.value)} />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted mb-1.5">Paying customers</div>
            <Input type="number" value={customers} onChange={(e) => setCustomers(e.target.value)} />
          </div>
          <Button onClick={update}>Update snapshot</Button>
        </div>
      </Card>
    </div>
  );
}

function FieldNum({ label, value, onChange, prefix, suffix }: { label: string; value?: number; onChange: (n: number) => void; prefix?: string; suffix?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-muted mb-1.5">{label}</div>
      <div className="relative">
        {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted">{prefix}</span>}
        <input
          type="number"
          value={value ?? ""}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className={`bg-surface-2 border border-border rounded-xl ${prefix ? "pl-7" : "pl-4"} ${suffix ? "pr-7" : "pr-4"} py-2.5 text-sm outline-none focus:border-emerald w-full`}
        />
        {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">{suffix}</span>}
      </div>
    </div>
  );
}

function Metric({ label, value, good, note }: { label: string; value: string; good: boolean; note?: string }) {
  return (
    <div className={`rounded-2xl border p-4 ${good ? "border-emerald/40 bg-emerald/5" : "border-amber/40 bg-amber/5"}`}>
      <div className="text-[10px] uppercase tracking-widest text-muted">{label}</div>
      <div className={`mt-1 font-[family-name:var(--font-display)] text-2xl font-semibold ${good ? "text-emerald" : "text-amber"}`}>{value}</div>
      {note && <div className="text-[10px] text-muted mt-1">{note}</div>}
    </div>
  );
}

function FunnelInput({ label, value, onChange, hint }: { label: string; value: number; onChange: (n: number) => void; hint: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface-2/40 p-3">
      <div className="text-[10px] uppercase tracking-widest text-muted">{label}</div>
      <input type="number" value={value || ""} onChange={(e) => onChange(parseInt(e.target.value) || 0)} className="mt-1 bg-transparent border-0 text-xl font-[family-name:var(--font-display)] font-semibold text-emerald w-full outline-none" />
      <div className="text-[10px] text-muted">{hint}</div>
    </div>
  );
}

function ConvBadge({ label, pct, target }: { label: string; pct: number; target: number }) {
  const good = pct >= target;
  return (
    <div className={`rounded-lg border p-2 ${good ? "border-emerald/40 bg-emerald/5" : "border-border bg-surface-2/40"}`}>
      <div className="text-[10px] uppercase tracking-widest text-muted">{label}</div>
      <div className={`text-sm font-mono ${good ? "text-emerald" : "text-amber"}`}>{pct.toFixed(1)}% <span className="text-muted text-[10px]">target {target}%</span></div>
    </div>
  );
}
