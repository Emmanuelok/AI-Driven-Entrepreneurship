"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { profileApi } from "@/lib/profile-api";
import type { InvestorThesis } from "@/lib/investor-thesis";
import { stageLabel } from "@/lib/saved-search";
import { Card, Badge, Button } from "@/components/ui";
import {
  Target, ArrowLeft, Loader2, Globe2, Mail, MapPin, Sparkles, Search,
  Banknote, Layers, ExternalLink,
} from "lucide-react";

type Investor = {
  userId: string; slug: string | null; displayName: string; avatarUrl: string | null;
  country: string; city: string; profileHeadline: string; bio: string; contactPolicy: string;
};

// /investors/[slug] — an investor's public thesis page. Founders read
// the mandate, see active searches ("looking for"), and pitch via the
// existing contact flow on the profile.

export default function InvestorThesisPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [investor, setInvestor] = useState<Investor | null>(null);
  const [thesis, setThesis] = useState<InvestorThesis | null>(null);
  const [summary, setSummary] = useState("");
  const [checkRange, setCheckRange] = useState<string | null>(null);
  const [mandates, setMandates] = useState<Array<{ id: string; title: string; summary: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    (async () => {
      const r = await profileApi.getInvestorThesis(slug);
      if (!r.ok) { setMissing(true); setLoading(false); return; }
      setInvestor(r.investor);
      setThesis(r.thesis);
      setSummary(r.summary);
      setCheckRange(r.checkRange);
      setMandates(r.publicMandates);
      setLoading(false);
    })();
  }, [slug]);

  if (loading) {
    return <div className="min-h-[60vh] flex items-center justify-center"><Loader2 className="size-6 text-emerald animate-spin" /></div>;
  }
  if (missing || !investor || !thesis) { notFound(); return null; }

  return (
    <div className="max-w-3xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <Link href="/investors" className="text-xs text-muted hover:text-foreground inline-flex items-center gap-1.5 mb-4">
        <ArrowLeft className="size-3" /> All investors
      </Link>

      {/* Header */}
      <div className="flex items-start gap-4 mb-6">
        <div className="size-16 rounded-2xl bg-gradient-to-br from-emerald to-amber flex items-center justify-center text-black text-2xl font-semibold shrink-0">
          {investor.displayName.trim().slice(0, 1).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs uppercase tracking-[0.22em] text-emerald mb-1 flex items-center gap-1.5">
            <Target className="size-3.5" /> Investor thesis
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold leading-tight">{investor.displayName}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted">
            {(investor.city || investor.country) && (
              <span className="flex items-center gap-1"><MapPin className="size-3" /> {[investor.city, investor.country].filter(Boolean).join(", ")}</span>
            )}
            {investor.slug && (
              <Link href={`/people/${investor.slug}`} className="hover:text-emerald inline-flex items-center gap-1">
                Full profile <ExternalLink className="size-3" />
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Headline + summary */}
      <Card className="p-6 mb-5">
        {thesis.headline && <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold mb-2">{thesis.headline}</h2>}
        <p className="text-sm text-muted">{summary}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {checkRange && <Badge color="indigo"><Banknote className="size-3 mr-1" /> {checkRange}</Badge>}
          {thesis.stages.map((s) => <Badge key={s} color="emerald"><Layers className="size-3 mr-1" /> {stageLabel(s)}</Badge>)}
          {thesis.acceptsColdPitch && <Badge color="amber"><Mail className="size-3 mr-1" /> Open to cold pitches</Badge>}
        </div>
      </Card>

      {/* Statement */}
      {thesis.statement && (
        <Card className="p-6 mb-5">
          <h3 className="text-xs uppercase tracking-widest text-muted mb-2">Thesis</h3>
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{thesis.statement}</p>
        </Card>
      )}

      {/* Sectors + regions */}
      <div className="grid sm:grid-cols-2 gap-3 mb-5">
        {thesis.sectors.length > 0 && (
          <Card className="p-5">
            <h3 className="text-xs uppercase tracking-widest text-muted mb-2">Sectors</h3>
            <div className="flex flex-wrap gap-1.5">
              {thesis.sectors.map((s) => <span key={s} className="text-[11px] px-2.5 py-1 rounded-full border border-border bg-surface-2 text-muted capitalize">{s}</span>)}
            </div>
          </Card>
        )}
        {thesis.regions.length > 0 && (
          <Card className="p-5">
            <h3 className="text-xs uppercase tracking-widest text-muted mb-2 flex items-center gap-1"><Globe2 className="size-3" /> Regions</h3>
            <div className="flex flex-wrap gap-1.5">
              {thesis.regions.map((r) => <span key={r} className="text-[11px] px-2.5 py-1 rounded-full border border-border bg-surface-2 text-muted">{r}</span>)}
            </div>
          </Card>
        )}
      </div>

      {/* Active mandates */}
      {mandates.length > 0 && (
        <Card className="p-6 mb-5">
          <h3 className="text-xs uppercase tracking-widest text-muted mb-3 flex items-center gap-1.5">
            <Search className="size-3.5 text-emerald" /> Actively looking for
          </h3>
          <div className="space-y-2">
            {mandates.map((m) => (
              <div key={m.id} className="rounded-xl border border-border p-3">
                <div className="text-sm font-medium">{m.title}</div>
                <div className="text-xs text-muted mt-0.5">{m.summary}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Pitch CTA */}
      <Card className="p-6 bg-gradient-to-br from-emerald/5 to-amber/5 text-center">
        <Sparkles className="size-7 text-emerald mx-auto mb-2" />
        <h3 className="font-[family-name:var(--font-display)] text-lg font-semibold">
          {thesis.acceptsColdPitch ? "Think you're a fit?" : "Want to reach out?"}
        </h3>
        <p className="text-sm text-muted max-w-md mx-auto mt-1 mb-4">
          {thesis.acceptsColdPitch
            ? `${investor.displayName} is open to cold pitches. Send a concise note with your venture and the ask.`
            : `Reach ${investor.displayName} through their profile, respecting their contact preferences.`}
        </p>
        {investor.slug && (
          <Link href={`/people/${investor.slug}`}>
            <Button><Mail className="size-4" /> Pitch {investor.displayName.split(" ")[0]}</Button>
          </Link>
        )}
      </Card>
    </div>
  );
}
