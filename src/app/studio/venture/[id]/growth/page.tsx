"use client";

import { use, useEffect, useState } from "react";
import { notFound } from "next/navigation";
import { useStore } from "@/store";
import { Card, Button, Input, Stat } from "@/components/ui";
import { TrendingUp, Plus, Users, DollarSign, Activity } from "lucide-react";
import { LineChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";

const SEED_GROWTH = [
  { week: "W1", mrr: 0, customers: 0 },
  { week: "W2", mrr: 50, customers: 1 },
  { week: "W3", mrr: 150, customers: 3 },
  { week: "W4", mrr: 300, customers: 6 },
  { week: "W5", mrr: 550, customers: 11 },
  { week: "W6", mrr: 900, customers: 17 },
  { week: "W7", mrr: 1400, customers: 25 },
  { week: "W8", mrr: 2200, customers: 35 },
];

export default function GrowthPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { ventures, updateVenture } = useStore();
  const [mrr, setMrr] = useState("0");
  const [customers, setCustomers] = useState("0");

  const found = ventures.find((x) => x.id === id);

  useEffect(() => {
    if (!found) return;
    setMrr(String(found.metrics.mrr));
    setCustomers(String(found.metrics.customers));
  }, [found?.id]);

  if (!found) { notFound(); return null; }
  const v = found;

  function update() {
    updateVenture(v.id, {
      metrics: { ...v.metrics, mrr: parseFloat(mrr) || 0, customers: parseInt(customers) || 0, revenue: v.metrics.revenue + (parseFloat(mrr) || 0) },
    });
  }

  return (
    <div className="max-w-6xl mx-auto px-5 sm:px-8 py-10">
      <p className="text-xs uppercase tracking-[0.22em] text-emerald mb-1 flex items-center gap-1.5">
        <TrendingUp className="size-3.5" /> Phase 6 — Growth
      </p>
      <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold">Track the metrics that matter.</h2>
      <p className="text-sm text-muted mt-1">MRR, customer count, retention, and CAC. The numbers tell you what to build next.</p>

      <div className="grid sm:grid-cols-4 gap-3 mt-6">
        <Stat label="MRR" value={`$${v.metrics.mrr.toLocaleString()}`} color="emerald" />
        <Stat label="Customers" value={v.metrics.customers} color="amber" />
        <Stat label="ARPU" value={`$${v.metrics.customers ? Math.round(v.metrics.mrr / v.metrics.customers) : 0}`} color="indigo" />
        <Stat label="Revenue (lifetime)" value={`$${v.metrics.revenue.toLocaleString()}`} color="rust" />
      </div>

      <Card className="mt-6 p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-medium flex items-center gap-2"><Activity className="size-4 text-emerald" /> MRR + Customer growth</h3>
          <Button size="sm" variant="secondary" onClick={() => alert("Connect Stripe / Paystack — coming soon.")}>Connect Stripe</Button>
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={SEED_GROWTH}>
            <CartesianGrid stroke="#1f2c28" strokeDasharray="3 3" />
            <XAxis dataKey="week" stroke="#8aa39a" fontSize={12} />
            <YAxis stroke="#8aa39a" fontSize={12} />
            <Tooltip contentStyle={{ background: "#0f1614", border: "1px solid #1f2c28", borderRadius: 8 }} />
            <Line type="monotone" dataKey="mrr" stroke="#2cc295" strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="customers" stroke="#f4a949" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
        <p className="text-xs text-muted text-center mt-3">Sample trajectory — replace with your real data once Stripe/Paystack is wired.</p>
      </Card>

      <Card className="mt-6 p-6">
        <h3 className="font-medium mb-4">Manual metric update</h3>
        <div className="grid sm:grid-cols-3 gap-3 items-end">
          <div>
            <div className="text-xs uppercase tracking-widest text-muted mb-1.5">Monthly recurring revenue ($)</div>
            <Input type="number" value={mrr} onChange={(e) => setMrr(e.target.value)} />
          </div>
          <div>
            <div className="text-xs uppercase tracking-widest text-muted mb-1.5">Customers</div>
            <Input type="number" value={customers} onChange={(e) => setCustomers(e.target.value)} />
          </div>
          <Button onClick={update}>Update metrics</Button>
        </div>
      </Card>

      <Card className="mt-6 p-6">
        <h3 className="font-medium mb-3 flex items-center gap-2"><Users className="size-4 text-emerald" /> Channels working for you</h3>
        <div className="grid sm:grid-cols-2 gap-3 text-sm">
          {[
            { c: "Cooperative chairmen", n: "12 intros", conv: "67%" },
            { c: "WhatsApp groups (regional)", n: "8 groups", conv: "23%" },
            { c: "Friday prayer announcements", n: "3 mosques", conv: "44%" },
            { c: "Market-day demos", n: "5 Saturdays", conv: "31%" },
          ].map((c) => (
            <div key={c.c} className="rounded-xl border border-border bg-surface-2/50 p-4">
              <div className="font-medium">{c.c}</div>
              <div className="text-xs text-muted mt-1">{c.n} · conversion {c.conv}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
