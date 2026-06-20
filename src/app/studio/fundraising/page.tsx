"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { profileApi } from "@/lib/profile-api";
import type { FundraisingVenture } from "@/app/api/v2/me/fundraising/route";
import { temperatureMeta, engagementNudge } from "@/lib/dataroom-engagement";
import { demandNudge } from "@/lib/saved-search";
import { useStore } from "@/store";
import { Card, Badge, Button } from "@/components/ui";
import {
  Flame, ArrowLeft, Loader2, Eye, EyeOff, Users, TrendingUp, Lock,
  AlertCircle, Sparkles, ArrowRight, ShieldCheck, Clock, CheckCircle2, Radar, Bell, Mail,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

// /studio/fundraising — the founder's counterpart to the mentor
// dashboard. Combines server-side dataroom engagement (who viewed,
// how warm) with the client-side diligence checklist readiness from
// the local store, into one "are you fundable" view.

export default function FundraisingPage() {
  const { ventures: localVentures } = useStore();
  const [ventures, setVentures] = useState<FundraisingVenture[]>([]);
  const [totals, setTotals] = useState<{ ventures: number; grants: number; activeGrants: number; views: number; hot: number; cold: number; watching: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const r = await profileApi.getFundraising();
      if (!r.ok) { setErr(r.error || "Failed to load"); setLoading(false); return; }
      setVentures(r.ventures);
      setTotals(r.totals);
      setLoading(false);
    })();
  }, []);

  // Diligence readiness from the local store (the /dataroom checklist),
  // matched to published ventures by their publicLaunch.slug.
  function readinessForSlug(slug: string): { ready: number; total: number } | null {
    const lv = localVentures.find((v) => v.publicLaunch?.slug === slug);
    if (!lv?.dataRoom || lv.dataRoom.length === 0) return null;
    const ready = lv.dataRoom.filter((d) => d.status === "ready").length;
    return { ready, total: lv.dataRoom.length };
  }

  if (loading) {
    return <div className="min-h-[60vh] flex items-center justify-center"><Loader2 className="size-6 text-emerald animate-spin" /></div>;
  }

  if (err) {
    return (
      <div className="max-w-2xl mx-auto px-5 sm:px-8 py-12">
        <Card className="p-6 border-rust/40 flex items-start gap-2">
          <AlertCircle className="size-4 text-rust mt-0.5" />
          <span className="text-sm text-rust">{err}</span>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <Link href="/studio" className="text-xs text-muted hover:text-foreground inline-flex items-center gap-1.5 mb-4">
        <ArrowLeft className="size-3" /> Studio
      </Link>

      <header className="mb-8">
        <p className="text-xs uppercase tracking-[0.22em] text-emerald mb-2 flex items-center gap-1.5">
          <TrendingUp className="size-3.5" /> Fundraising
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight">
          Who&apos;s looking at your raise.
        </h1>
        <p className="mt-3 text-muted max-w-2xl leading-relaxed">
          Every investor you&apos;ve granted dataroom access to, scored by how warm they are — who&apos;s actively reviewing, who hasn&apos;t opened the room yet, and who&apos;s gone cold.
        </p>
      </header>

      {totals && totals.ventures > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
          <MiniStat label="Watching" value={totals.watching} icon={<Radar className="size-4" />} accent="amber" />
          <MiniStat label="Investors" value={totals.grants} icon={<Users className="size-4" />} accent="emerald" />
          <MiniStat label="Active" value={totals.activeGrants} icon={<ShieldCheck className="size-4" />} accent="indigo" />
          <MiniStat label="Hot" value={totals.hot} icon={<Flame className="size-4" />} accent="amber" />
          <MiniStat label="Total views" value={totals.views} icon={<Eye className="size-4" />} accent="emerald" />
        </div>
      )}

      {ventures.length === 0 ? (
        <Card className="p-10 text-center">
          <Sparkles className="size-8 text-emerald mx-auto mb-3" />
          <p className="text-muted leading-relaxed max-w-md mx-auto mb-4">
            No published ventures yet. Publish a venture, add gated dataroom items, then grant access to investors — their engagement will show up here.
          </p>
          <Link href="/studio/venture"><Button>Open my ventures <ArrowRight className="size-3.5" /></Button></Link>
        </Card>
      ) : (
        <div className="space-y-5">
          {ventures.map((v) => (
            <VentureBlock key={v.slug} v={v} readiness={readinessForSlug(v.slug)} />
          ))}
        </div>
      )}
    </div>
  );
}

function VentureBlock({ v, readiness }: { v: FundraisingVenture; readiness: { ready: number; total: number } | null }) {
  const e = v.engagement;
  const score = e.engagementScore;
  const scoreColor = score >= 60 ? "text-emerald" : score >= 30 ? "text-amber" : "text-muted";

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link href={`/v/${v.slug}/dataroom`} className="font-medium hover:text-emerald">{v.title}</Link>
            {v.isRaising && <Badge color="amber"><Flame className="size-3 mr-1" /> Raising</Badge>}
            {v.gatedItemCount > 0 && <Badge color="muted"><Lock className="size-3 mr-1" /> {v.gatedItemCount} gated</Badge>}
          </div>
          <p className="text-xs text-muted mt-1.5">{engagementNudge(e)}</p>
        </div>
        <div className="text-right shrink-0">
          <div className={`font-[family-name:var(--font-display)] text-3xl font-semibold ${scoreColor}`}>{score}</div>
          <div className="text-[10px] uppercase tracking-widest text-muted">engagement</div>
        </div>
      </div>

      {/* Engagement bar */}
      {e.activeGrants > 0 && (
        <div className="mt-3 h-2 bg-surface-2 rounded-full overflow-hidden flex">
          {e.hotCount > 0 && <div className="bg-emerald h-full" style={{ width: `${(e.hotCount / e.activeGrants) * 100}%` }} title={`${e.hotCount} hot`} />}
          {e.warmCount > 0 && <div className="bg-amber h-full" style={{ width: `${(e.warmCount / e.activeGrants) * 100}%` }} title={`${e.warmCount} warm`} />}
          {e.coldCount > 0 && <div className="bg-border h-full" style={{ width: `${(e.coldCount / e.activeGrants) * 100}%` }} title={`${e.coldCount} not opened`} />}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted">
        <span>{e.hotCount} hot · {e.warmCount} warm · {e.coldCount} not opened</span>
        {readiness && (
          <span className="flex items-center gap-1">
            <CheckCircle2 className="size-3 text-emerald" /> Diligence {readiness.ready}/{readiness.total} ready
          </span>
        )}
      </div>

      {/* Investor demand (Phase 76) — aggregate-only, no identities. */}
      {v.demand.investorCount > 0 && (
        <div className="mt-3 rounded-xl border border-amber/30 bg-amber/5 p-3 flex items-start gap-2">
          <Radar className="size-4 text-amber mt-0.5 shrink-0" />
          <div className="text-xs text-fg leading-relaxed">
            {demandNudge(v.demand)}
            {v.demand.alertingInvestorCount > 0 && (
              <span className="inline-flex items-center gap-1 ml-1 text-amber">
                <Bell className="size-3" /> {v.demand.alertingInvestorCount} alerting
              </span>
            )}
          </div>
        </div>
      )}

      {/* Investor list */}
      {v.investors.length > 0 && (
        <div className="mt-4 space-y-1.5">
          {v.investors.map((inv) => {
            const meta = temperatureMeta(inv.temperature);
            return (
              <div key={inv.granteeUserId} className="flex items-center gap-3 rounded-lg border border-border p-2.5">
                <div className="size-7 rounded-full bg-indigo/15 text-indigo flex items-center justify-center text-xs font-semibold shrink-0">
                  {inv.displayName.slice(0, 1).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  {inv.slug ? (
                    <Link href={`/p/${inv.slug}`} className="text-sm hover:text-emerald">{inv.displayName}</Link>
                  ) : (
                    <span className="text-sm">{inv.displayName}</span>
                  )}
                  <div className="text-[10px] text-muted">
                    {inv.everViewed
                      ? <>{inv.viewCount} view{inv.viewCount === 1 ? "" : "s"}{inv.daysSinceLastView != null && <> · last {inv.daysSinceLastView === 0 ? "today" : `${inv.daysSinceLastView}d ago`}</>}</>
                      : <>granted {inv.daysSinceGrant}d ago · never opened</>}
                  </div>
                </div>
                <Badge color={meta.accent}>{meta.label}</Badge>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-4 flex gap-2 flex-wrap">
        <Link href={`/v/${v.slug}/dataroom`}><Button size="sm" variant="secondary"><Eye className="size-3.5" /> View room</Button></Link>
        <MatchingInvestors slug={v.slug} />
      </div>
    </Card>
  );
}

// Lazy "investors to pitch" — fetches matching published theses only
// when the founder expands it (keeps the page load light).
function MatchingInvestors({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [results, setResults] = useState<Array<{ slug: string | null; displayName: string; country: string; headline: string; summary: string; checkRange: string | null; acceptsColdPitch: boolean; score: number }>>([]);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !loaded) {
      setLoading(true);
      const r = await profileApi.matchingInvestors(slug);
      setLoading(false);
      setLoaded(true);
      if (r.ok) setResults(r.results);
    }
  }

  return (
    <div className="w-full">
      <Button size="sm" variant="ghost" onClick={toggle}>
        <Radar className="size-3.5" /> {open ? "Hide" : "Find"} investors to pitch
      </Button>
      {open && (
        <div className="mt-3">
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-muted"><Loader2 className="size-3.5 animate-spin" /> Matching theses…</div>
          ) : results.length === 0 ? (
            <p className="text-xs text-muted">No published investor theses match this venture yet. <Link href="/investors" className="text-emerald hover:underline">Browse all investors</Link>.</p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-2">
              {results.map((inv) => (
                <Link key={inv.slug ?? inv.displayName} href={inv.slug ? `/investors/${inv.slug}` : "#"} className="block">
                  <div className="rounded-lg border border-border p-3 hover:border-emerald/40 transition">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium truncate">{inv.displayName}</span>
                      <Badge color={inv.score >= 60 ? "emerald" : "amber"}>{inv.score}% fit</Badge>
                    </div>
                    {inv.headline && <p className="text-[11px] text-muted line-clamp-1 mt-0.5">{inv.headline}</p>}
                    <div className="text-[10px] text-muted mt-1 flex flex-wrap gap-2">
                      {inv.checkRange && <span>{inv.checkRange}</span>}
                      {inv.acceptsColdPitch && <span className="text-emerald inline-flex items-center gap-0.5"><Mail className="size-2.5" /> open</span>}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value, icon, accent }: { label: string; value: number; icon: React.ReactNode; accent: "emerald" | "amber" | "indigo" }) {
  const color = { emerald: "text-emerald", amber: "text-amber", indigo: "text-indigo" }[accent];
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-widest text-muted">{label}</div>
        <span className={color}>{icon}</span>
      </div>
      <div className={`font-[family-name:var(--font-display)] text-2xl font-semibold mt-1 ${color}`}>{value}</div>
    </Card>
  );
}
