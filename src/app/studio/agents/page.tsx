"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AGENTS } from "@/lib/agents";
import { Card, Badge, Input } from "@/components/ui";
import { Bot, Search, Sparkles, Zap, ArrowRight } from "lucide-react";

const CATS = ["All", "Founder ops", "Research", "Engineering", "Legal & Finance", "Sales & Growth", "Creative"] as const;

export default function AgentsMarketplacePage() {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<(typeof CATS)[number]>("All");

  const list = useMemo(() => {
    return AGENTS.filter((a) => {
      if (cat !== "All" && a.category !== cat) return false;
      if (q && !`${a.name} ${a.short} ${a.long}`.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [q, cat]);

  return (
    <div className="max-w-6xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <div className="mb-8">
        <p className="text-xs uppercase tracking-[0.22em] text-emerald mb-2 flex items-center gap-1.5">
          <Bot className="size-3.5" /> AI Agents Marketplace
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight max-w-3xl">
          {AGENTS.length} specialized agents. <span className="text-emerald">One click each.</span>
        </h1>
        <p className="mt-3 text-muted max-w-2xl">
          Each agent is a Claude-powered one-shot tool that does work a junior associate would take an afternoon on. Paste inputs, get the artifact — usually in under 30 seconds.
        </p>
      </div>

      <Card className="p-4 mb-6 flex flex-wrap gap-3 items-center">
        <div className="flex-1 min-w-[240px] flex items-center gap-2 bg-surface-2 border border-border rounded-xl px-3 py-2">
          <Search className="size-4 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search agents…" className="flex-1 bg-transparent outline-none text-sm" />
        </div>
        <div className="flex gap-1 overflow-x-auto">
          {CATS.map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition ${
                cat === c ? "bg-emerald text-black font-medium" : "border border-border text-muted hover:text-foreground"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </Card>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {list.map((a) => (
          <Link key={a.id} href={`/studio/agents/${a.id}`} className="glass rounded-2xl p-5 hover:border-emerald/40 transition group">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="text-3xl">{a.icon}</div>
              <Badge color={a.color === "emerald" ? "emerald" : a.color === "amber" ? "amber" : a.color === "rust" ? "rust" : "indigo"}>
                {a.category}
              </Badge>
            </div>
            <h3 className="font-[family-name:var(--font-display)] text-xl font-semibold leading-tight group-hover:text-emerald transition">{a.name}</h3>
            <p className="mt-2 text-sm text-muted line-clamp-2 leading-relaxed">{a.short}</p>
            <div className="mt-5 flex items-center justify-between text-xs">
              <span className="text-muted flex items-center gap-1"><Zap className="size-3" /> ~{a.estSeconds}s</span>
              <span className="text-emerald flex items-center gap-1">Run agent <ArrowRight className="size-3.5 group-hover:translate-x-0.5 transition" /></span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
