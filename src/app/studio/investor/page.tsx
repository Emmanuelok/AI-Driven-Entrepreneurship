"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, Button, Badge } from "@/components/ui";
import { Briefcase, ArrowLeft, ArrowRight, Loader2, Search, Filter, Flame, Eye, Globe2, ShieldCheck } from "lucide-react";
import type { VentureCard } from "@/app/api/v2/ventures/browse/route";

// Investor portal — a real opt-in venture marketplace.
//
// Founders publish ventures (via the existing /api/public/publish
// flow); investors browse, filter by raising-status, sector, stage,
// region; open a venture for the full public page; reach the founder
// through their profile.

const STAGE_OPTIONS = [
  { v: "", label: "Any stage" },
  { v: "idea", label: "Idea" },
  { v: "discover", label: "Discovery" },
  { v: "mvp", label: "MVP" },
  { v: "launch", label: "Launch" },
  { v: "scale", label: "Scale" },
];

const SORT_OPTIONS = [
  { v: "recent", label: "Most recently updated" },
  { v: "raising", label: "Largest raise" },
  { v: "views", label: "Most viewed" },
];

export default function InvestorPortalPage() {
  const [rows, setRows] = useState<VentureCard[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const [q, setQ] = useState("");
  const [stage, setStage] = useState("");
  const [sector, setSector] = useState("");
  const [raisingOnly, setRaisingOnly] = useState(false);
  const [sort, setSort] = useState("recent");

  // Debounced fetch on any filter change so typing in the search box
  // doesn't fire a request per keystroke. 250ms keeps it snappy.
  useEffect(() => {
    setLoading(true);
    const t = setTimeout(async () => {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (stage) params.set("stage", stage);
      if (sector) params.set("sector", sector);
      if (raisingOnly) params.set("raising", "1");
      if (sort) params.set("sort", sort);
      params.set("limit", "30");
      try {
        const res = await fetch(`/api/v2/ventures/browse?${params.toString()}`);
        const data = (await res.json()) as { ok: boolean; results?: VentureCard[]; total?: number };
        if (data.ok && data.results) { setRows(data.results); setTotal(data.total ?? 0); }
        else { setRows([]); setTotal(0); }
      } catch { setRows([]); setTotal(0); }
      setLoading(false);
    }, 250);
    return () => clearTimeout(t);
  }, [q, stage, sector, raisingOnly, sort]);

  // Distinct sector chips from the visible rows — keeps the chips
  // honest about what's actually on the marketplace right now without
  // a separate aggregate query.
  const visibleSectors = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) for (const s of r.sectors) counts.set(s, (counts.get(s) ?? 0) + 1);
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [rows]);

  return (
    <div className="max-w-7xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <Link href="/studio" className="text-xs text-muted hover:text-foreground inline-flex items-center gap-1.5 mb-4">
        <ArrowLeft className="size-3" /> Studio
      </Link>

      <div className="mb-8 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-emerald mb-2 flex items-center gap-1.5">
            <Briefcase className="size-3.5" /> Investor portal
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight">
            Ventures founders have published for backers.
          </h1>
          <p className="mt-3 text-muted max-w-2xl leading-relaxed">
            Real opt-in ventures from Sankofa founders. Each row has been published by its owner with a public-safe view of their venture. Click through to see the full pitch and reach the founder.
          </p>
        </div>
        <Link href="/studio/investor/datarooms">
          <Button variant="secondary"><ShieldCheck className="size-4" /> My deal rooms</Button>
        </Link>
      </div>

      <Card className="p-4 mb-6 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="size-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search ventures…"
              className="bg-surface-2 border border-border rounded-xl pl-10 pr-3 py-2 text-sm outline-none focus:border-emerald w-full"
            />
          </div>
          <select value={stage} onChange={(e) => setStage(e.target.value)} className="bg-surface-2 border border-border rounded-xl px-3 py-2 text-sm outline-none focus:border-emerald">
            {STAGE_OPTIONS.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value)} className="bg-surface-2 border border-border rounded-xl px-3 py-2 text-sm outline-none focus:border-emerald">
            {SORT_OPTIONS.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm cursor-pointer pl-1">
            <input type="checkbox" checked={raisingOnly} onChange={(e) => setRaisingOnly(e.target.checked)} className="accent-emerald" />
            <Flame className="size-3.5 text-amber" /> Raising now
          </label>
        </div>
        {visibleSectors.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap pt-1">
            <Filter className="size-3 text-muted" />
            <button
              onClick={() => setSector("")}
              className={`text-[11px] px-2.5 py-1 rounded-full border transition ${sector === "" ? "border-emerald bg-emerald/10 text-emerald" : "border-border text-muted hover:border-muted hover:text-foreground"}`}
            >
              All sectors
            </button>
            {visibleSectors.map(([s, n]) => (
              <button
                key={s}
                onClick={() => setSector(sector === s ? "" : s)}
                className={`text-[11px] px-2.5 py-1 rounded-full border transition ${sector === s ? "border-emerald bg-emerald/10 text-emerald" : "border-border text-muted hover:border-muted hover:text-foreground"}`}
              >
                {s} <span className="text-muted/70 ml-0.5">{n}</span>
              </button>
            ))}
          </div>
        )}
      </Card>

      <div className="text-xs text-muted mb-3">
        {loading ? "Loading…" : `${total} venture${total === 1 ? "" : "s"} match`}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="size-6 text-emerald animate-spin" /></div>
      ) : rows.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {rows.map((v) => (
            <VentureCardView key={v.slug} v={v} />
          ))}
        </div>
      )}

      <Card className="mt-10 p-6 bg-gradient-to-br from-emerald/5 to-amber/5">
        <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold mb-2">Are you a founder?</h2>
        <p className="text-sm text-muted leading-relaxed mb-4 max-w-2xl">
          Publish your venture from its venture page — set your sector, stage, and whether you&apos;re currently raising. Investors browsing here will see it within the hour.
        </p>
        <Link href="/studio/venture">
          <Button variant="secondary">Open my ventures <ArrowRight className="size-3.5" /></Button>
        </Link>
      </Card>
    </div>
  );
}

function VentureCardView({ v }: { v: VentureCard }) {
  return (
    <Link href={`/v/${v.slug}`} className="block group">
      <Card className="p-5 h-full hover:border-emerald/40 transition flex flex-col">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="size-10 rounded-2xl bg-gradient-to-br from-emerald to-amber flex items-center justify-center text-black font-semibold shrink-0">
            {v.title.trim().slice(0, 1).toUpperCase()}
          </div>
          {v.is_raising && (
            <Badge color="amber">
              <span className="inline-flex items-center gap-1"><Flame className="size-2.5" /> Raising</span>
            </Badge>
          )}
        </div>
        <h3 className="font-medium text-sm group-hover:text-emerald transition">{v.title}</h3>
        {v.tagline && <p className="mt-1 text-xs text-muted leading-relaxed line-clamp-3">{v.tagline}</p>}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {v.stage && <Badge color="emerald">{v.stage}</Badge>}
          {v.region && (
            <span className="text-[10px] px-2 py-0.5 rounded-full border border-border bg-surface-2 text-muted inline-flex items-center gap-1">
              <Globe2 className="size-2.5" /> {v.region}
            </span>
          )}
          {v.sectors.slice(0, 2).map((s) => (
            <span key={s} className="text-[10px] px-2 py-0.5 rounded-full border border-border bg-surface-2 text-muted">{s}</span>
          ))}
        </div>
        <div className="mt-auto pt-3 flex items-center justify-between text-[11px] text-muted">
          {v.is_raising && v.raising_amount_usd ? (
            <span className="text-amber font-mono">${(v.raising_amount_usd / 1000).toFixed(0)}k ask</span>
          ) : (
            <span></span>
          )}
          <span className="inline-flex items-center gap-1"><Eye className="size-3" /> {v.views}</span>
        </div>
      </Card>
    </Link>
  );
}

function EmptyState() {
  return (
    <Card className="p-10 text-center">
      <p className="text-muted leading-relaxed max-w-md mx-auto">
        No ventures match those filters yet. Try clearing them — or check back as more founders publish.
      </p>
    </Card>
  );
}
