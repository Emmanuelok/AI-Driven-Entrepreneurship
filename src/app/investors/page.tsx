"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { profileApi } from "@/lib/profile-api";
import type { InvestorCard } from "@/app/api/v2/investors/route";
import { VALID_STAGES, stageLabel } from "@/lib/saved-search";
import { Card, Badge, Button } from "@/components/ui";
import { Target, Search, Loader2, Globe2, Mail, Filter, ArrowRight, Sparkles } from "lucide-react";

// /investors — public directory of investor theses. No auth. Founders
// browse by sector/stage, filter to those accepting cold pitches, and
// open a thesis to pitch.

export default function InvestorDirectoryPage() {
  const [rows, setRows] = useState<InvestorCard[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const [q, setQ] = useState("");
  const [sector, setSector] = useState("");
  const [stage, setStage] = useState("");
  const [coldOnly, setColdOnly] = useState(false);

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(async () => {
      const r = await profileApi.listInvestors({
        q: q.trim() || undefined,
        sector: sector || undefined,
        stage: stage || undefined,
        coldPitch: coldOnly || undefined,
        limit: 30,
      });
      if (r.ok) { setRows(r.results); setTotal(r.total); }
      else { setRows([]); setTotal(0); }
      setLoading(false);
    }, 250);
    return () => clearTimeout(t);
  }, [q, sector, stage, coldOnly]);

  const sectorChips = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) for (const s of r.sectors) counts.set(s, (counts.get(s) ?? 0) + 1);
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [rows]);

  return (
    <div className="max-w-6xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <div className="mb-8">
        <p className="text-xs uppercase tracking-[0.22em] text-emerald mb-2 flex items-center gap-1.5">
          <Target className="size-3.5" /> Investors
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight">
          The backers, and what they back.
        </h1>
        <p className="mt-3 text-muted max-w-2xl leading-relaxed">
          Investors who&apos;ve published a thesis on Sankofa. Filter by sector and stage, find the ones whose mandate fits your venture, and pitch the right deal to the right person.
        </p>
      </div>

      <Card className="p-4 mb-6 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="size-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search theses…"
              className="bg-surface-2 border border-border rounded-xl pl-10 pr-3 py-2 text-sm outline-none focus:border-emerald w-full"
            />
          </div>
          <select value={stage} onChange={(e) => setStage(e.target.value)} className="bg-surface-2 border border-border rounded-xl px-3 py-2 text-sm outline-none focus:border-emerald">
            <option value="">Any stage</option>
            {VALID_STAGES.map((s) => <option key={s} value={s}>{stageLabel(s)}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm cursor-pointer pl-1">
            <input type="checkbox" checked={coldOnly} onChange={(e) => setColdOnly(e.target.checked)} className="accent-emerald" />
            <Mail className="size-3.5 text-emerald" /> Open to cold pitches
          </label>
        </div>
        {sectorChips.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap pt-1">
            <Filter className="size-3 text-muted" />
            <button onClick={() => setSector("")} className={`text-[11px] px-2.5 py-1 rounded-full border transition ${sector === "" ? "border-emerald bg-emerald/10 text-emerald" : "border-border text-muted hover:text-foreground"}`}>
              All sectors
            </button>
            {sectorChips.map(([s, n]) => (
              <button key={s} onClick={() => setSector(sector === s ? "" : s)} className={`text-[11px] px-2.5 py-1 rounded-full border transition ${sector === s ? "border-emerald bg-emerald/10 text-emerald" : "border-border text-muted hover:text-foreground"}`}>
                {s} <span className="text-muted/70 ml-0.5">{n}</span>
              </button>
            ))}
          </div>
        )}
      </Card>

      <div className="text-xs text-muted mb-3">{loading ? "Loading…" : `${total} investor${total === 1 ? "" : "s"}`}</div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="size-6 text-emerald animate-spin" /></div>
      ) : rows.length === 0 ? (
        <Card className="p-10 text-center">
          <Sparkles className="size-8 text-emerald mx-auto mb-3" />
          <p className="text-muted leading-relaxed max-w-md mx-auto">
            No investors match those filters yet. Clear them, or check back as more investors publish their thesis.
          </p>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {rows.map((inv) => <InvestorCardView key={inv.userId} inv={inv} />)}
        </div>
      )}

      <Card className="mt-10 p-6 bg-gradient-to-br from-emerald/5 to-amber/5">
        <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold mb-2">Are you an investor?</h2>
        <p className="text-sm text-muted leading-relaxed mb-4 max-w-2xl">
          Publish your thesis so the right founders find you. It takes a few minutes and you control whether it&apos;s public.
        </p>
        <Link href="/studio/investor/thesis"><Button variant="secondary">Write your thesis <ArrowRight className="size-3.5" /></Button></Link>
      </Card>
    </div>
  );
}

function InvestorCardView({ inv }: { inv: InvestorCard }) {
  const href = inv.slug ? `/investors/${inv.slug}` : "#";
  return (
    <Link href={href} className="block group">
      <Card className="p-5 h-full hover:border-emerald/40 transition flex flex-col">
        <div className="flex items-start gap-3 mb-2">
          <div className="size-10 rounded-full bg-gradient-to-br from-emerald to-amber flex items-center justify-center text-black font-semibold shrink-0">
            {inv.displayName.trim().slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="font-medium text-sm group-hover:text-emerald transition truncate">{inv.displayName}</div>
            {inv.country && <div className="text-[11px] text-muted flex items-center gap-1"><Globe2 className="size-2.5" /> {inv.country}</div>}
          </div>
        </div>
        {inv.headline && <p className="text-sm leading-snug mb-2">{inv.headline}</p>}
        <p className="text-xs text-muted line-clamp-2">{inv.summary}</p>
        <div className="mt-auto pt-3 flex flex-wrap gap-1.5 items-center">
          {inv.checkRange && <Badge color="indigo">{inv.checkRange}</Badge>}
          {inv.acceptsColdPitch && <Badge color="emerald"><Mail className="size-2.5 mr-1" /> Open</Badge>}
        </div>
      </Card>
    </Link>
  );
}
