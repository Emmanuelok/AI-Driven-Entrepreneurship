"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { PROBLEMS, Problem } from "@/lib/problems";
import { Search, MapPin, Users, ArrowRight, Filter } from "lucide-react";

const SECTORS = ["All", "Agriculture", "Health", "Energy", "Education", "Finance", "Logistics", "Climate", "Governance", "Water", "Creative"] as const;

export default function ProblemsPage() {
  const [q, setQ] = useState("");
  const [sector, setSector] = useState<(typeof SECTORS)[number]>("All");
  const [minSeverity, setMinSeverity] = useState(0);

  const filtered = useMemo(() => {
    return PROBLEMS.filter((p) => {
      if (sector !== "All" && p.sector !== sector) return false;
      if (p.severity < minSeverity) return false;
      if (q && !(`${p.title} ${p.description} ${p.region} ${p.affected}`.toLowerCase().includes(q.toLowerCase()))) return false;
      return true;
    });
  }, [q, sector, minSeverity]);

  return (
    <div className="max-w-6xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <div className="mb-8">
        <p className="text-xs uppercase tracking-[0.22em] text-emerald mb-2">Local Problem Hub</p>
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight max-w-3xl">
          The problems no global platform tells you about. Pick one. Build for it.
        </h1>
        <p className="mt-3 text-muted max-w-2xl">
          Each entry is sourced from on-the-ground research, World Bank / WHO / UNESCO / AGRA datasets, and founder interviews. Pick one as your venture target — Sage will scope it down with you.
        </p>
      </div>

      <div className="glass rounded-2xl p-4 mb-6 flex flex-wrap gap-3 items-center">
        <div className="flex-1 min-w-[240px] flex items-center gap-2 bg-surface-2 border border-border rounded-xl px-3 py-2">
          <Search className="size-4 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search problems…"
            className="flex-1 bg-transparent outline-none text-sm"
          />
        </div>
        <select
          value={sector}
          onChange={(e) => setSector(e.target.value as (typeof SECTORS)[number])}
          className="bg-surface-2 border border-border rounded-xl px-3 py-2 text-sm outline-none focus:border-emerald"
        >
          {SECTORS.map((s) => (
            <option key={s} value={s} className="bg-surface">{s}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-muted">
          <Filter className="size-4" /> Severity ≥
          <select
            value={minSeverity}
            onChange={(e) => setMinSeverity(parseInt(e.target.value))}
            className="bg-surface-2 border border-border rounded-xl px-2 py-1 outline-none"
          >
            {[0, 3, 4, 5].map((v) => (
              <option key={v} value={v} className="bg-surface">{v === 0 ? "any" : v}</option>
            ))}
          </select>
        </label>
        <div className="text-xs text-muted">{filtered.length} of {PROBLEMS.length}</div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {filtered.map((p) => (
          <ProblemCard key={p.id} p={p} />
        ))}
      </div>
      {filtered.length === 0 && (
        <div className="text-center py-20 text-muted">No problems match those filters. Try widening them.</div>
      )}
    </div>
  );
}

function ProblemCard({ p }: { p: Problem }) {
  return (
    <Link
      href={`/studio/problems/${p.id}`}
      className="glass rounded-2xl p-6 hover:border-emerald/40 transition group flex flex-col"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <span className="text-[10px] uppercase tracking-widest text-emerald border border-emerald/40 bg-emerald/5 px-2 py-0.5 rounded-full">
          {p.sector}
        </span>
        <Severity n={p.severity} />
      </div>
      <h3 className="font-[family-name:var(--font-display)] text-xl font-semibold leading-tight group-hover:text-emerald transition">
        {p.title}
      </h3>
      <p className="mt-3 text-sm text-muted line-clamp-3 leading-relaxed flex-1">{p.description}</p>
      <div className="mt-4 pt-4 border-t border-border flex items-center justify-between text-xs text-muted">
        <span className="flex items-center gap-1.5"><MapPin className="size-3" /> {p.region}</span>
        <span className="flex items-center gap-1.5"><Users className="size-3" /> {p.affected.split(" ")[0]}</span>
      </div>
      <div className="mt-3 flex items-center gap-1 text-sm text-emerald">
        Open brief <ArrowRight className="size-3.5 group-hover:translate-x-0.5 transition" />
      </div>
    </Link>
  );
}

function Severity({ n }: { n: number }) {
  return (
    <div className="flex gap-0.5" title={`Severity ${n}/5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={`size-1.5 rounded-full ${i <= n ? "bg-rust" : "bg-border"}`} />
      ))}
    </div>
  );
}
