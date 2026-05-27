"use client";

import { useStore } from "@/store";
import { useExt } from "@/store/extensions";
import { Card, Badge, Stat, EmptyState, Button } from "@/components/ui";
import { Network, TrendingUp, DollarSign, Users, Rocket, ArrowRight, Building2, Sparkles } from "lucide-react";
import { BarChart, Bar, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, PieChart, Pie, Cell, Legend, Treemap } from "recharts";
import Link from "next/link";

const SECTOR_COLORS: Record<string, string> = {
  Agriculture: "#2cc295",
  Health: "#d96444",
  Fintech: "#6c8cff",
  Climate: "#f4a949",
  Education: "#9b6cff",
  Other: "#8aa39a",
};

export default function ConglomeratePage() {
  const { ventures } = useStore();
  const { pitches } = useExt();

  if (ventures.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-5 py-20">
        <EmptyState
          icon={Network}
          title="No ventures in your conglomerate yet"
          body="Start ventures from the Venture Studio. Once you have 2+, this view aggregates capital, customers, team, and metrics across all of them."
          action={<Link href="/studio/venture"><Button><Rocket className="size-4" /> Start a venture</Button></Link>}
        />
      </div>
    );
  }

  const totalMRR = ventures.reduce((s, v) => s + v.metrics.mrr, 0);
  const totalCustomers = ventures.reduce((s, v) => s + v.metrics.customers, 0);
  const totalFunding = ventures.reduce((s, v) => s + v.fundingRaised, 0);
  const totalTeam = ventures.reduce((s, v) => s + v.team.length, 0);
  const totalInterviews = ventures.reduce((s, v) => s + v.interviews.length, 0);

  const phaseDist = ["ideate", "discover", "mvp", "launch", "scale"].map((p) => ({
    name: p,
    value: ventures.filter((v) => v.phase === p).length,
    color: p === "scale" ? "#f4a949" : p === "launch" ? "#2cc295" : "#6c8cff",
  })).filter((d) => d.value > 0);

  const ventureMRR = ventures.map((v) => ({ name: v.name.slice(0, 12), mrr: v.metrics.mrr, customers: v.metrics.customers }));

  return (
    <div className="max-w-7xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <div className="mb-8">
        <p className="text-xs uppercase tracking-[0.22em] text-emerald mb-2 flex items-center gap-1.5">
          <Network className="size-3.5" /> Conglomerate · Portfolio view
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight">
          {ventures.length} ventures. <span className="text-emerald">One holding.</span>
        </h1>
        <p className="mt-3 text-muted max-w-2xl">
          The view investors and acquirers eventually see. Aggregated capital deployed, MRR, customers, exits — across your full portfolio.
        </p>
      </div>

      <div className="grid sm:grid-cols-5 gap-3 mb-8">
        <Stat label="Total MRR" value={`$${totalMRR.toLocaleString()}`} color="emerald" sub={`$${(totalMRR * 12).toLocaleString()} ARR`} />
        <Stat label="Customers" value={totalCustomers.toLocaleString()} color="amber" />
        <Stat label="Capital deployed" value={`$${(totalFunding / 1000).toFixed(0)}k`} color="indigo" />
        <Stat label="Team across portfolio" value={totalTeam} color="rust" />
        <Stat label="Customer interviews" value={totalInterviews} color="emerald" />
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mb-8">
        <Card className="p-6">
          <h3 className="font-medium mb-4 flex items-center gap-2"><TrendingUp className="size-4 text-emerald" /> MRR by venture</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={ventureMRR}>
              <CartesianGrid stroke="#1f2c28" strokeDasharray="3 3" />
              <XAxis dataKey="name" stroke="#8aa39a" fontSize={11} />
              <YAxis stroke="#8aa39a" fontSize={11} />
              <Tooltip contentStyle={{ background: "#0f1614", border: "1px solid #1f2c28", borderRadius: 8 }} />
              <Bar dataKey="mrr" fill="#2cc295" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card className="p-6">
          <h3 className="font-medium mb-4 flex items-center gap-2"><Building2 className="size-4 text-amber" /> Portfolio phase distribution</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={phaseDist} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                {phaseDist.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Pie>
              <Tooltip contentStyle={{ background: "#0f1614", border: "1px solid #1f2c28", borderRadius: 8 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <Card className="p-6 mb-8">
        <h3 className="font-medium mb-5 flex items-center gap-2"><Rocket className="size-4 text-emerald" /> Holdings</h3>
        <div className="grid gap-3">
          {ventures.map((v) => (
            <Link key={v.id} href={`/studio/venture/${v.id}`} className="flex items-center gap-4 p-4 rounded-xl border border-border bg-surface-2/40 hover:bg-surface-2 transition group">
              <div className="size-12 rounded-2xl bg-gradient-to-br from-emerald to-amber flex items-center justify-center text-black font-bold">{v.name[0]}</div>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{v.name}</div>
                <div className="text-xs text-muted truncate">{v.tagline}</div>
              </div>
              <div className="hidden sm:block text-right">
                <div className="font-mono text-emerald">${v.metrics.mrr}</div>
                <div className="text-xs text-muted">MRR</div>
              </div>
              <div className="hidden sm:block text-right">
                <div className="font-mono text-amber">{v.metrics.customers}</div>
                <div className="text-xs text-muted">customers</div>
              </div>
              <Badge color={v.phase === "scale" ? "amber" : v.phase === "launch" ? "emerald" : "indigo"}>{v.phase}</Badge>
              <ArrowRight className="size-4 text-muted group-hover:text-emerald transition" />
            </Link>
          ))}
        </div>
      </Card>

      <Card className="p-6 bg-gradient-to-br from-emerald/10 to-amber/10">
        <div className="flex items-start gap-4">
          <Sparkles className="size-6 text-amber shrink-0" />
          <div>
            <h3 className="font-[family-name:var(--font-display)] text-xl font-semibold">Cross-portfolio insight</h3>
            <p className="mt-2 text-muted text-sm leading-relaxed">
              Founders running multiple ventures should look for: (1) shared distribution channels (one cooperative network can serve multiple ventures), (2) shared infrastructure (one back-office handles all books), (3) talent rotation (engineers move between ventures, deepening institutional knowledge). The conglomerate effect is real — but only if you actively manage these crossovers.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
