"use client";

import { useMemo, useState } from "react";
import { FUNDING } from "@/lib/funding";
import { Card, Badge, Input, Button } from "@/components/ui";
import { Wallet, Calendar, ExternalLink, Search, TrendingUp } from "lucide-react";

const TYPES = ["All", "Grant", "Accelerator", "Pre-seed VC", "Seed VC", "Series A+", "Competition", "Scholarship", "Debt"];
const STAGES = ["All", "Idea", "MVP", "Revenue", "Growth"];

export default function FundingPage() {
  const [q, setQ] = useState("");
  const [type, setType] = useState("All");
  const [stage, setStage] = useState("All");

  const filtered = useMemo(() => {
    return FUNDING.filter((f) => {
      if (type !== "All" && f.type !== type) return false;
      if (stage !== "All" && !f.stage.includes(stage as "Idea" | "MVP" | "Revenue" | "Growth")) return false;
      if (q && !`${f.name} ${f.org} ${f.description} ${f.sectors.join(" ")}`.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [q, type, stage]);

  const totalAvailable = filtered.reduce((sum, f) => sum + f.amountMaxUsd, 0);

  return (
    <div className="max-w-6xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <div className="mb-8">
        <p className="text-xs uppercase tracking-[0.22em] text-emerald mb-2">Funding finder</p>
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight max-w-3xl">
          Every grant, accelerator, and check writing for African founders. In one place.
        </h1>
        <p className="mt-3 text-muted max-w-2xl">
          From $5k Tony Elumelu grants to $20M Norrsken22 growth checks. Filter by stage, type, and sector. Apply with one click.
        </p>
      </div>

      <Card className="p-5 mb-6 grid sm:grid-cols-3 gap-3">
        <div className="rounded-xl bg-surface-2 border border-border p-4">
          <div className="text-[10px] uppercase tracking-widest text-muted">Sources in database</div>
          <div className="font-[family-name:var(--font-display)] text-2xl font-semibold text-emerald mt-1">{FUNDING.length}</div>
        </div>
        <div className="rounded-xl bg-surface-2 border border-border p-4">
          <div className="text-[10px] uppercase tracking-widest text-muted">Matched right now</div>
          <div className="font-[family-name:var(--font-display)] text-2xl font-semibold text-amber mt-1">{filtered.length}</div>
        </div>
        <div className="rounded-xl bg-surface-2 border border-border p-4">
          <div className="text-[10px] uppercase tracking-widest text-muted">Max addressable capital</div>
          <div className="font-[family-name:var(--font-display)] text-2xl font-semibold text-emerald mt-1">${(totalAvailable / 1_000_000).toFixed(1)}M+</div>
        </div>
      </Card>

      <Card className="p-4 mb-6 flex flex-wrap gap-3 items-center">
        <div className="flex-1 min-w-[200px] flex items-center gap-2 bg-surface-2 rounded-xl px-3 py-2 border border-border">
          <Search className="size-4 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="flex-1 bg-transparent outline-none text-sm" />
        </div>
        <select value={type} onChange={(e) => setType(e.target.value)} className="bg-surface-2 border border-border rounded-xl px-3 py-2 text-sm outline-none focus:border-emerald">
          {TYPES.map((t) => <option key={t}>{t}</option>)}
        </select>
        <select value={stage} onChange={(e) => setStage(e.target.value)} className="bg-surface-2 border border-border rounded-xl px-3 py-2 text-sm outline-none focus:border-emerald">
          {STAGES.map((s) => <option key={s}>{s}</option>)}
        </select>
      </Card>

      <div className="grid sm:grid-cols-2 gap-3">
        {filtered.map((f) => (
          <Card key={f.id} className="p-5">
            <div className="flex items-center justify-between gap-3 mb-2">
              <Badge color={f.type === "Grant" ? "emerald" : f.type === "Accelerator" ? "amber" : f.type === "Competition" ? "indigo" : "muted"}>{f.type}</Badge>
              <div className="flex gap-0.5" title={`Signal ${f.signal}/5`}>{Array.from({ length: 5 }).map((_, i) => (
                <span key={i} className={`size-1.5 rounded-full ${i < f.signal ? "bg-amber" : "bg-border"}`} />
              ))}</div>
            </div>
            <h3 className="font-[family-name:var(--font-display)] text-lg font-semibold leading-tight">{f.name}</h3>
            <div className="text-xs text-muted">{f.org}</div>
            <div className="mt-3 font-mono text-emerald text-lg">
              {f.amountMinUsd === f.amountMaxUsd ? `$${f.amountMinUsd.toLocaleString()}` : `$${f.amountMinUsd.toLocaleString()}–${f.amountMaxUsd.toLocaleString()}`}
              {f.equityPct ? <span className="text-rust text-sm"> for {f.equityPct}%</span> : <span className="text-emerald/70 text-sm"> non-dilutive</span>}
            </div>
            <p className="mt-3 text-sm text-muted line-clamp-3">{f.description}</p>
            <p className="mt-2 text-xs text-emerald italic">{f.whoFor}</p>
            <div className="mt-4 flex items-center justify-between text-xs">
              <span className="text-muted flex items-center gap-1">
                <Calendar className="size-3" />
                {f.rolling ? "Rolling" : f.deadline ? `Deadline ${f.deadline}` : "TBA"}
              </span>
              <a href={f.applicationUrl} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-emerald hover:underline">
                Apply <ExternalLink className="size-3" />
              </a>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
