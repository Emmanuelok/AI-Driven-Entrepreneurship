"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { profileApi, type InvestorDealroomRow } from "@/lib/profile-api";
import { Card, Badge, Button } from "@/components/ui";
import {
  Briefcase, ShieldCheck, Loader2, ArrowLeft, ArrowRight, ExternalLink,
  Flame, Globe2, Clock, Lock, Eye, AlertCircle, Sparkles,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

// /studio/investor/datarooms — investor-side counterpart to Phase 66.
// Every venture dataroom the signed-in user has been granted access
// to, grouped by access state.

export default function InvestorDataroomsPage() {
  const [rows, setRows] = useState<InvestorDealroomRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const r = await profileApi.myDatarooms();
      if (!r.ok) { setErr(r.error || "Failed to load"); setLoading(false); return; }
      setRows(r.results);
      setLoading(false);
    })();
  }, []);

  const active = rows.filter((r) => r.access.state === "granted");
  const expired = rows.filter((r) => r.access.state === "expired");
  const revoked = rows.filter((r) => r.access.state === "revoked");

  const raising = active.filter((r) => r.isRaising).length;

  return (
    <div className="max-w-5xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <Link href="/studio/investor" className="text-xs text-muted hover:text-foreground inline-flex items-center gap-1.5 mb-4">
        <ArrowLeft className="size-3" /> Investor portal
      </Link>

      <header className="mb-8">
        <p className="text-xs uppercase tracking-[0.22em] text-emerald mb-2 flex items-center gap-1.5">
          <ShieldCheck className="size-3.5" /> Deal room
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight">
          Ventures sharing their data with you.
        </h1>
        <p className="mt-3 text-muted max-w-2xl leading-relaxed">
          Every founder who&apos;s granted you dataroom access shows up here. Open a room to see their cap table, financials, contracts, and anything else they&apos;ve put behind the gate.
        </p>
        {active.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <Badge color="emerald">{active.length} active</Badge>
            {raising > 0 && <Badge color="amber"><Flame className="size-3 mr-1" /> {raising} raising now</Badge>}
            {expired.length > 0 && <Badge color="muted">{expired.length} expired</Badge>}
            {revoked.length > 0 && <Badge color="rust">{revoked.length} revoked</Badge>}
          </div>
        )}
      </header>

      {err && (
        <Card className="p-4 border-rust/40 mb-4 flex items-start gap-2">
          <AlertCircle className="size-4 text-rust mt-0.5" />
          <span className="text-sm text-rust">{err}</span>
        </Card>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="size-6 text-emerald animate-spin" /></div>
      ) : rows.length === 0 ? (
        <Card className="p-10 text-center">
          <Sparkles className="size-8 text-emerald mx-auto mb-3" />
          <p className="text-muted leading-relaxed max-w-md mx-auto mb-4">
            No deal rooms yet. When a founder grants you dataroom access, the venture will appear here.
          </p>
          <Link href="/studio/investor"><Button variant="secondary">Browse ventures <ArrowRight className="size-3.5" /></Button></Link>
        </Card>
      ) : (
        <div className="space-y-6">
          {active.length > 0 && (
            <Section title="Active" hint="You can open these rooms now.">
              {active.map((r) => <DealroomRow key={r.grantId} row={r} />)}
            </Section>
          )}
          {expired.length > 0 && (
            <Section title="Expired" hint="Ask the founder to renew if you still need access.">
              {expired.map((r) => <DealroomRow key={r.grantId} row={r} />)}
            </Section>
          )}
          {revoked.length > 0 && (
            <Section title="Revoked" hint="The founder cut off access. Public items are still visible.">
              {revoked.map((r) => <DealroomRow key={r.grantId} row={r} />)}
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2">
        <h2 className="font-medium text-sm">{title}</h2>
        <p className="text-xs text-muted">{hint}</p>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function DealroomRow({ row }: { row: InvestorDealroomRow }) {
  const expiresSoon = row.access.state === "granted"
    && row.expiresAt
    && new Date(row.expiresAt).getTime() - Date.now() < 14 * 86_400_000;

  return (
    <Card className="p-5 hover:border-emerald/40 transition">
      <div className="flex items-start gap-4">
        <div className="size-12 rounded-2xl bg-gradient-to-br from-emerald to-amber flex items-center justify-center text-black font-semibold shrink-0">
          {row.title.trim().slice(0, 1).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link href={`/v/${row.ventureSlug}/dataroom`} className="font-medium hover:text-emerald">
              {row.title}
            </Link>
            {row.isRaising && <Badge color="amber"><Flame className="size-3 mr-1" /> Raising</Badge>}
            {row.stage && <Badge color="emerald">{row.stage}</Badge>}
            {expiresSoon && <Badge color="amber"><Clock className="size-3 mr-1" /> Expires soon</Badge>}
          </div>
          {row.tagline && <p className="text-sm text-muted mt-1 line-clamp-2">{row.tagline}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted">
            <span>From <Link href={row.founder.slug ? `/p/${row.founder.slug}` : "#"} className="hover:text-emerald">{row.founder.display_name}</Link></span>
            {row.region && <span className="flex items-center gap-1"><Globe2 className="size-3" /> {row.region}</span>}
            {row.gatedItemCount > 0 && (
              <span className="flex items-center gap-1"><Lock className="size-3" /> {row.gatedItemCount} gated item{row.gatedItemCount === 1 ? "" : "s"}</span>
            )}
            {row.isRaising && row.raisingAmountUsd && (
              <span className="text-amber font-mono">${(row.raisingAmountUsd / 1000).toFixed(0)}k ask</span>
            )}
          </div>
          {row.reason && (
            <p className="mt-2 text-xs text-muted italic">&ldquo;{row.reason}&rdquo;</p>
          )}
          <p className="text-[10px] text-muted mt-2 flex items-center gap-1">
            <Eye className="size-3" /> Granted {formatDistanceToNow(new Date(row.grantedAt), { addSuffix: true })}
            {row.expiresAt && (
              <span> · Expires {new Date(row.expiresAt).toLocaleDateString()}</span>
            )}
          </p>
        </div>
        <div className="flex flex-col gap-2 shrink-0">
          <Link href={`/v/${row.ventureSlug}/dataroom`}>
            <Button size="sm" disabled={row.access.state !== "granted"}>
              {row.access.state === "granted" ? <>Open <ExternalLink className="size-3.5" /></> : "View public"}
            </Button>
          </Link>
          <Link href={`/v/${row.ventureSlug}`}>
            <Button size="sm" variant="ghost">Pitch page</Button>
          </Link>
        </div>
      </div>
    </Card>
  );
}
