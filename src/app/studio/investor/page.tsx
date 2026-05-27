"use client";

import { Card, Badge, Stat, Button } from "@/components/ui";
import { Wallet, TrendingUp, Briefcase, AlertCircle, Users, ArrowUpRight, Sparkles } from "lucide-react";
import { LineChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, AreaChart, Area } from "recharts";

const PORTFOLIO = [
  { name: "KubaCold", invested: 50000, currentMark: 180000, ownership: 6, stage: "Seed", lastUpdate: "Q2 2026", mrr: 4200 },
  { name: "TriageGPT", invested: 75000, currentMark: 120000, ownership: 8, stage: "Pre-seed", lastUpdate: "Q2 2026", mrr: 0 },
  { name: "KiviPay", invested: 100000, currentMark: 420000, ownership: 4, stage: "Seed", lastUpdate: "Q1 2026", mrr: 8400 },
  { name: "Lelapa AI", invested: 25000, currentMark: 280000, ownership: 1.5, stage: "Series A", lastUpdate: "Q1 2026", mrr: 40000 },
  { name: "SahelWeather", invested: 30000, currentMark: 45000, ownership: 5, stage: "Pre-seed", lastUpdate: "Q2 2026", mrr: 600 },
];

const NAV_HISTORY = [
  { q: "Q1 24", nav: 280, deployed: 280 },
  { q: "Q2 24", nav: 295, deployed: 280 },
  { q: "Q3 24", nav: 340, deployed: 280 },
  { q: "Q4 24", nav: 410, deployed: 280 },
  { q: "Q1 25", nav: 520, deployed: 280 },
  { q: "Q2 25", nav: 680, deployed: 280 },
  { q: "Q3 25", nav: 840, deployed: 280 },
  { q: "Q4 25", nav: 920, deployed: 280 },
  { q: "Q1 26", nav: 1020, deployed: 280 },
  { q: "Q2 26", nav: 1045, deployed: 280 },
];

export default function InvestorPortalPage() {
  const totalInvested = PORTFOLIO.reduce((s, p) => s + p.invested, 0);
  const totalCurrent = PORTFOLIO.reduce((s, p) => s + p.currentMark, 0);
  const moic = (totalCurrent / totalInvested).toFixed(2);

  return (
    <div className="max-w-7xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <div className="mb-8">
        <p className="text-xs uppercase tracking-[0.22em] text-emerald mb-2 flex items-center gap-1.5">
          <Briefcase className="size-3.5" /> Investor portal · Sankofa LP view
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight">
          Your portfolio across the Sankofa ecosystem.
        </h1>
        <p className="mt-3 text-muted max-w-2xl">
          Live mark-to-market on every Sankofa-incubated venture you've backed. Quarterly LP letters, founder updates, and exit signals.
        </p>
      </div>

      <div className="grid sm:grid-cols-5 gap-3 mb-8">
        <Stat label="Deployed" value={`$${(totalInvested / 1000).toFixed(0)}k`} color="indigo" sub="across 5 ventures" />
        <Stat label="Current NAV" value={`$${(totalCurrent / 1000).toFixed(0)}k`} color="emerald" sub={`${moic}× MOIC`} />
        <Stat label="Unrealized gain" value={`$${((totalCurrent - totalInvested) / 1000).toFixed(0)}k`} color="amber" />
        <Stat label="DPI" value="0.0×" sub="Realized" color="muted" />
        <Stat label="IRR (est.)" value="48%" color="emerald" sub="annualized" />
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mb-8">
        <Card className="p-6">
          <h3 className="font-medium mb-4 flex items-center gap-2"><TrendingUp className="size-4 text-emerald" /> NAV growth</h3>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={NAV_HISTORY}>
              <CartesianGrid stroke="#1f2c28" strokeDasharray="3 3" />
              <XAxis dataKey="q" stroke="#8aa39a" fontSize={11} />
              <YAxis stroke="#8aa39a" fontSize={11} />
              <Tooltip contentStyle={{ background: "#0f1614", border: "1px solid #1f2c28", borderRadius: 8 }} />
              <Area type="monotone" dataKey="nav" stroke="#2cc295" fill="rgba(44,194,149,0.2)" />
              <Area type="monotone" dataKey="deployed" stroke="#6c8cff" fill="rgba(108,140,255,0.1)" />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
        <Card className="p-6">
          <h3 className="font-medium mb-4 flex items-center gap-2"><AlertCircle className="size-4 text-amber" /> Diligence flags</h3>
          <div className="space-y-3 text-sm">
            {[
              { v: "TriageGPT", flag: "Regulatory path unclear in 3 of 5 target markets — board update requested.", color: "amber" },
              { v: "SahelWeather", flag: "Burn rate up 60% QoQ — convertible note maturity in 8 months.", color: "rust" },
              { v: "KiviPay", flag: "CBK aggregator license filed — green-light for Series A discussions.", color: "emerald" },
              { v: "KubaCold", flag: "Hardware unit BOM down 18% — gross margin trajectory ahead of plan.", color: "emerald" },
            ].map((f) => (
              <div key={f.v} className="flex items-start gap-3 p-3 rounded-xl border border-border bg-surface-2/40">
                <span className={`size-2 rounded-full mt-2 bg-${f.color} shrink-0`} />
                <div>
                  <div className="font-medium text-foreground">{f.v}</div>
                  <div className="text-xs text-muted mt-0.5">{f.flag}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="p-6 mb-8 overflow-x-auto">
        <h3 className="font-medium mb-5 flex items-center gap-2"><Briefcase className="size-4 text-emerald" /> Portfolio companies</h3>
        <table className="w-full text-sm min-w-[700px]">
          <thead className="text-xs uppercase tracking-widest text-muted">
            <tr>
              <th className="text-left py-2">Venture</th>
              <th className="text-left">Stage</th>
              <th className="text-right">Invested</th>
              <th className="text-right">Current mark</th>
              <th className="text-right">MOIC</th>
              <th className="text-right">Ownership</th>
              <th className="text-right">MRR</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {PORTFOLIO.map((p) => {
              const moic = p.currentMark / p.invested;
              return (
                <tr key={p.name} className="border-t border-border hover:bg-surface-2/40 transition">
                  <td className="py-3 font-medium">{p.name}</td>
                  <td><Badge color={p.stage === "Series A" ? "amber" : "emerald"}>{p.stage}</Badge></td>
                  <td className="text-right font-mono">${(p.invested / 1000).toFixed(0)}k</td>
                  <td className="text-right font-mono text-emerald">${(p.currentMark / 1000).toFixed(0)}k</td>
                  <td className="text-right font-mono" style={{ color: moic >= 2 ? "#2cc295" : moic >= 1 ? "#f4a949" : "#d96444" }}>{moic.toFixed(2)}×</td>
                  <td className="text-right text-muted">{p.ownership}%</td>
                  <td className="text-right font-mono">${p.mrr.toLocaleString()}</td>
                  <td className="text-right"><button className="text-emerald hover:underline text-xs">View →</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <Card className="p-6 bg-gradient-to-br from-emerald/10 to-amber/10">
        <div className="flex items-start gap-4">
          <Sparkles className="size-6 text-amber shrink-0" />
          <div>
            <h3 className="font-[family-name:var(--font-display)] text-xl font-semibold">Q2 2026 LP letter</h3>
            <p className="mt-2 text-muted text-sm leading-relaxed">
              Two of your five holdings crossed material milestones this quarter (Lelapa AI's Series A close, KubaCold's first $1k MRR). One needs attention (SahelWeather burn). Full letter and quarterly call below.
            </p>
            <div className="mt-4 flex gap-2 flex-wrap">
              <Button>Read full LP letter <ArrowUpRight className="size-4" /></Button>
              <Button variant="secondary">Q2 video call recording</Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
