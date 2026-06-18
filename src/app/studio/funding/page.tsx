"use client";

import { useMemo, useState } from "react";
import { FUNDING } from "@/lib/funding";
import { resolveDepartment } from "@/lib/recommendations";
import { useStore } from "@/store";
import { Card, Badge } from "@/components/ui";
import { RegisteredStakeholders } from "@/components/registered-stakeholders";
import { Calendar, ExternalLink, Search, GraduationCap, Library } from "lucide-react";

const TYPES = ["All", "Grant", "Accelerator", "Pre-seed VC", "Seed VC", "Series A+", "Competition", "Scholarship", "Debt"];
const STAGES = ["All", "Idea", "MVP", "Revenue", "Growth"];

export default function FundingPage() {
  const { user } = useStore();
  const dept = useMemo(() => resolveDepartment(user?.field), [user?.field]);
  const [q, setQ] = useState("");
  const [type, setType] = useState("All");
  const [stage, setStage] = useState("All");
  // Default the discipline filter on when we can resolve the dept —
  // students see funders aligned to their field first, can click off
  // to browse the whole catalog.
  const [forMyDiscipline, setForMyDiscipline] = useState<boolean>(!!dept);

  // A funder "matches" the discipline when its sectors include any of
  // dept.relevantSectors OR includes "Any" (sector-agnostic). We score
  // by overlap count so the most-relevant funders rank highest.
  const scoreFor = useMemo(() => {
    if (!dept) return () => 0;
    const rel = new Set(dept.relevantSectors);
    return (sectors: string[]): number => {
      let s = 0;
      for (const sec of sectors) if (rel.has(sec)) s += 2;
      if (sectors.includes("Any")) s += 1;
      return s;
    };
  }, [dept]);

  const filtered = useMemo(() => {
    const base = FUNDING.filter((f) => {
      if (type !== "All" && f.type !== type) return false;
      if (stage !== "All" && !f.stage.includes(stage as "Idea" | "MVP" | "Revenue" | "Growth")) return false;
      if (q && !`${f.name} ${f.org} ${f.description} ${f.sectors.join(" ")}`.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
    if (forMyDiscipline && dept) {
      return [...base].sort((a, b) => scoreFor(b.sectors) - scoreFor(a.sectors));
    }
    return base;
  }, [q, type, stage, forMyDiscipline, dept, scoreFor]);

  const totalAvailable = filtered.reduce((sum, f) => sum + f.amountMaxUsd, 0);

  return (
    <div className="max-w-6xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <div className="mb-8">
        <p className="text-xs uppercase tracking-[0.22em] text-emerald mb-2">Funding finder</p>
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight max-w-3xl">
          Every grant, accelerator, and check writing for African founders. In one place.
        </h1>
        <p className="mt-3 text-muted max-w-2xl">
          Funders and programs that have registered on Sankofa are below — reach out directly. Underneath, a curated catalog of real-world funding sources, from $5k Tony Elumelu grants to $20M Norrsken22 growth checks.
        </p>
      </div>

      {/* Registered funders — real grant programs / accelerators that
          signed up and can be contacted through their profile. */}
      <RegisteredStakeholders
        type="funder"
        title="Funders & programs on Sankofa"
        blurb="Registered grant programs, accelerators, and funders — reach out directly."
        emptyHint="No funders have published a public profile yet. Run a grant or program?"
        signupHref="/studio/onboarding?as=funder"
      />

      <div className="flex items-center gap-2 mt-10 mb-3">
        <Library className="size-5 text-amber" />
        <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">Funding catalog</h2>
      </div>
      <p className="text-sm text-muted mb-5 max-w-2xl">
        A curated directory of real-world funding sources for African founders. Links go to each program&apos;s own application — these are external programs, not Sankofa accounts.
      </p>

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
        {dept && (
          <label className="flex items-center gap-2 text-sm cursor-pointer" title={`Surface funders whose sectors match ${dept.name}`}>
            <input type="checkbox" checked={forMyDiscipline} onChange={(e) => setForMyDiscipline(e.target.checked)} className="accent-emerald" />
            <GraduationCap className="size-3.5 text-emerald" />
            For {dept.name.split(" ")[0]}
          </label>
        )}
      </Card>

      <div className="grid sm:grid-cols-2 gap-3">
        {filtered.map((f) => {
          const score = forMyDiscipline ? scoreFor(f.sectors) : 0;
          const isStrong = score >= 2;
          return (
            <Card key={f.id} className={`p-5 ${isStrong ? "border-emerald/40 ring-1 ring-emerald/20" : ""}`}>
              <div className="flex items-center justify-between gap-3 mb-2">
                <Badge color={f.type === "Grant" ? "emerald" : f.type === "Accelerator" ? "amber" : f.type === "Competition" ? "indigo" : "muted"}>{f.type}</Badge>
                <div className="flex gap-0.5" title={`Signal ${f.signal}/5`}>{Array.from({ length: 5 }).map((_, i) => (
                  <span key={i} className={`size-1.5 rounded-full ${i < f.signal ? "bg-amber" : "bg-border"}`} />
                ))}</div>
              </div>
              {isStrong && (
                <div className="mb-2 inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-emerald">
                  <GraduationCap className="size-2.5" /> Sector match for your discipline
                </div>
              )}
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
          );
        })}
      </div>
    </div>
  );
}
