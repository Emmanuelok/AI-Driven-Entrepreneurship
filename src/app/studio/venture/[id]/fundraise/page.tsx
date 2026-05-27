"use client";

import { use, useMemo, useState } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { useStore } from "@/store";
import { FUNDING } from "@/lib/funding";
import { Card, Badge, Button, Input } from "@/components/ui";
import { Wallet, Calendar, ExternalLink, TrendingUp, Sparkles, Search, Filter } from "lucide-react";

export default function FundraisePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { ventures, updateVenture, notify, unlockBadge } = useStore();
  const found = ventures.find((x) => x.id === id);
  if (!found) { notFound(); return null; }
  const v = found;

  const [stageFilter, setStageFilter] = useState<string>("all");
  const [q, setQ] = useState("");

  const matched = useMemo(() => {
    return FUNDING.filter((f) => {
      if (stageFilter !== "all" && !f.stage.includes(stageFilter as "Idea" | "MVP" | "Revenue" | "Growth")) return false;
      if (q && !`${f.name} ${f.org} ${f.description}`.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [stageFilter, q]);

  const pct = (v.fundingRaised / v.fundingTarget) * 100;

  function markApplied(name: string, amount: number) {
    updateVenture(v.id, { fundingRaised: v.fundingRaised + amount });
    unlockBadge("grant-applied");
    notify({ title: `Application logged: ${name}`, body: `+$${amount.toLocaleString()} added to pipeline.` });
  }

  return (
    <div className="max-w-6xl mx-auto px-5 sm:px-8 py-10">
      <div className="mb-6">
        <p className="text-xs uppercase tracking-[0.22em] text-rust mb-1 flex items-center gap-1.5">
          <Wallet className="size-3.5" /> Phase 5 — Fundraise
        </p>
        <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold">${v.fundingRaised.toLocaleString()} raised / pipelined of ${v.fundingTarget.toLocaleString()}</h2>
        <div className="mt-3 h-2 bg-surface-2 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-emerald to-amber transition-all" style={{ width: `${Math.min(pct, 100)}%` }} />
        </div>
      </div>

      <Card className="p-4 mb-6 flex flex-wrap gap-2 items-center">
        <div className="flex items-center gap-2 flex-1 min-w-[200px] bg-surface-2 rounded-xl px-3 py-2 border border-border">
          <Search className="size-4 text-muted" />
          <input placeholder="Search funding sources…" value={q} onChange={(e) => setQ(e.target.value)} className="flex-1 bg-transparent outline-none text-sm" />
        </div>
        <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)} className="bg-surface-2 border border-border rounded-xl px-3 py-2 text-sm outline-none focus:border-emerald">
          <option value="all">All stages</option>
          <option value="Idea">Idea</option>
          <option value="MVP">MVP</option>
          <option value="Revenue">Revenue</option>
          <option value="Growth">Growth</option>
        </select>
        <Badge color="muted">{matched.length} matched</Badge>
      </Card>

      <div className="grid sm:grid-cols-2 gap-3">
        {matched.map((f) => (
          <Card key={f.id} className="p-5">
            <div className="flex items-center justify-between gap-3 mb-2">
              <Badge color={f.type === "Grant" ? "emerald" : f.type === "Accelerator" ? "amber" : f.type === "Competition" ? "indigo" : "muted"}>{f.type}</Badge>
              <div className="flex gap-0.5" title={`Signal ${f.signal}/5`}>{Array.from({ length: 5 }).map((_, i) => (
                <span key={i} className={`size-1.5 rounded-full ${i < f.signal ? "bg-amber" : "bg-border"}`} />
              ))}</div>
            </div>
            <h3 className="font-[family-name:var(--font-display)] text-lg font-semibold leading-tight">{f.name}</h3>
            <div className="text-xs text-muted">{f.org}</div>
            <div className="mt-3 font-mono text-emerald">
              {f.amountMinUsd === f.amountMaxUsd ? `$${f.amountMinUsd.toLocaleString()}` : `$${f.amountMinUsd.toLocaleString()}–${f.amountMaxUsd.toLocaleString()}`}
              {f.equityPct ? <span className="text-rust"> for {f.equityPct}%</span> : <span className="text-emerald/70"> non-dilutive</span>}
            </div>
            <p className="mt-3 text-sm text-muted line-clamp-3">{f.description}</p>
            <div className="mt-4 flex items-center justify-between text-xs">
              <span className="text-muted flex items-center gap-1">
                <Calendar className="size-3" />
                {f.rolling ? "Rolling" : f.deadline ? `Deadline ${f.deadline}` : "TBA"}
              </span>
              <span className="text-muted">{f.stage.join(" · ")}</span>
            </div>
            <div className="mt-4 flex gap-2">
              <a href={f.applicationUrl} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-xs bg-surface-2 border border-border px-3 py-1.5 rounded-full hover:bg-surface transition">
                Open <ExternalLink className="size-3" />
              </a>
              <Button size="sm" onClick={() => markApplied(f.name, f.amountMaxUsd)}>Mark applied</Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
