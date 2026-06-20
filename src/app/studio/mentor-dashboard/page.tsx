"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { profileApi } from "@/lib/profile-api";
import type { MentorEarnings } from "@/lib/mentor-earnings";
import type { MentorReputation } from "@/lib/mentor-reviews";
import { formatUsd, monthLabel, momNetDeltaPct } from "@/lib/mentor-earnings";
import { reputationSummary } from "@/lib/mentor-reviews";
import { Card, Badge, Button } from "@/components/ui";
import {
  Wallet, ArrowLeft, Loader2, TrendingUp, TrendingDown, Calendar, Clock,
  Users, GraduationCap, Star, AlertCircle, ArrowRight, Sparkles, CreditCard,
} from "lucide-react";
import { format } from "date-fns";

type Upcoming = { kind: "session" | "office_hours"; id: string; title: string; at: string; status: string; filled?: number };

export default function MentorDashboardPage() {
  const [earnings, setEarnings] = useState<MentorEarnings | null>(null);
  const [reputation, setReputation] = useState<MentorReputation | null>(null);
  const [upcoming, setUpcoming] = useState<Upcoming[]>([]);
  const [sellerReady, setSellerReady] = useState(false);
  const [counts, setCounts] = useState<{ sessions: number; offerings: number; seats: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const r = await profileApi.getMentorDashboard();
      if (!r.ok) { setErr(r.error || "Failed to load"); setLoading(false); return; }
      setEarnings(r.earnings);
      setReputation(r.reputation);
      setUpcoming(r.upcoming);
      setSellerReady(r.sellerReady);
      setCounts(r.counts);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return <div className="min-h-[60vh] flex items-center justify-center"><Loader2 className="size-6 text-emerald animate-spin" /></div>;
  }

  if (err || !earnings || !reputation) {
    return (
      <div className="max-w-2xl mx-auto px-5 sm:px-8 py-12">
        <Card className="p-6 border-rust/40 flex items-start gap-2">
          <AlertCircle className="size-4 text-rust mt-0.5" />
          <span className="text-sm text-rust">{err || "No data"}</span>
        </Card>
      </div>
    );
  }

  const hasActivity = (counts?.sessions ?? 0) + (counts?.offerings ?? 0) > 0;
  const delta = momNetDeltaPct(earnings.trend);
  const repSummary = reputationSummary(reputation);
  const maxNet = Math.max(1, ...earnings.trend.map((b) => b.netCents));

  return (
    <div className="max-w-5xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <Link href="/studio" className="text-xs text-muted hover:text-foreground inline-flex items-center gap-1.5 mb-4">
        <ArrowLeft className="size-3" /> Studio
      </Link>

      <header className="mb-8 flex items-end justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-emerald mb-2 flex items-center gap-1.5">
            <Wallet className="size-3.5" /> Mentor dashboard
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight">
            Your earnings, both rails.
          </h1>
          <p className="mt-3 text-muted max-w-2xl leading-relaxed">
            Money from 1:1 sessions and group office hours, net of Sankofa&apos;s fee — plus what&apos;s locked in for sessions you haven&apos;t held yet.
          </p>
        </div>
        <Link href="/studio/payouts">
          <Button variant="secondary">Payouts &amp; ledger</Button>
        </Link>
      </header>

      {!sellerReady && (
        <Card className="p-4 border-amber/40 mb-6 flex items-start gap-3">
          <CreditCard className="size-5 text-amber mt-0.5" />
          <div className="flex-1">
            <div className="text-sm font-medium">Payments aren&apos;t live yet</div>
            <p className="text-xs text-muted mt-0.5">Connect Stripe to receive payouts. Until then founders can&apos;t book paid sessions with you.</p>
          </div>
          <Link href="/studio/settings"><Button size="sm" variant="secondary">Set up payouts</Button></Link>
        </Card>
      )}

      {!hasActivity ? (
        <Card className="p-10 text-center">
          <Sparkles className="size-8 text-emerald mx-auto mb-3" />
          <p className="text-muted leading-relaxed max-w-md mx-auto mb-4">
            No mentoring activity yet. Set your hourly rate on your profile to take 1:1 bookings, or publish office hours for group sessions.
          </p>
          <div className="flex items-center justify-center gap-2">
            <Link href="/studio/office-hours"><Button><Users className="size-4" /> Publish office hours</Button></Link>
            <Link href="/studio/profile"><Button variant="secondary">Edit profile</Button></Link>
          </div>
        </Card>
      ) : (
        <>
          {/* Headline stat cards */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <StatCard
              label="Net earned"
              value={formatUsd(earnings.netCents)}
              sub={`${earnings.paidCount} paid · ${formatUsd(earnings.feeCents)} fees`}
              accent="emerald"
              delta={delta}
            />
            <StatCard
              label="Locked in (upcoming)"
              value={formatUsd(earnings.upcomingNetCents)}
              sub={`${earnings.upcomingCount} session${earnings.upcomingCount === 1 ? "" : "s"} ahead`}
              accent="amber"
            />
            <StatCard
              label="1:1 sessions"
              value={formatUsd(earnings.bySource.session.netCents)}
              sub={`${earnings.bySource.session.count} paid`}
              accent="indigo"
              icon={<GraduationCap className="size-4" />}
            />
            <StatCard
              label="Office hours"
              value={formatUsd(earnings.bySource.office_hours.netCents)}
              sub={`${earnings.bySource.office_hours.count} seats`}
              accent="emerald"
              icon={<Users className="size-4" />}
            />
          </div>

          {/* Trend bar chart */}
          <Card className="p-5 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium flex items-center gap-2"><TrendingUp className="size-4 text-emerald" /> Net earnings, last 6 months</h3>
              {repSummary && (
                <div className="text-xs text-amber flex items-center gap-1"><Star className="size-3 fill-current" /> {repSummary}</div>
              )}
            </div>
            <div className="flex items-end justify-between gap-2 h-40">
              {earnings.trend.map((b) => {
                const pct = (b.netCents / maxNet) * 100;
                return (
                  <div key={b.month} className="flex-1 flex flex-col items-center gap-2 group">
                    <div className="w-full flex items-end justify-center h-full">
                      <div
                        className="w-full max-w-[48px] rounded-t-lg bg-gradient-to-t from-emerald/40 to-emerald transition-all group-hover:from-emerald/60 relative"
                        style={{ height: `${Math.max(pct, b.netCents > 0 ? 4 : 0)}%` }}
                      >
                        {b.netCents > 0 && (
                          <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] text-muted whitespace-nowrap opacity-0 group-hover:opacity-100 transition">
                            {formatUsd(b.netCents)}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-[10px] text-muted">{monthLabel(b.month)}</span>
                  </div>
                );
              })}
            </div>
            {earnings.refundedCents > 0 && (
              <p className="text-[11px] text-muted mt-3 flex items-center gap-1">
                <TrendingDown className="size-3 text-rust" /> {formatUsd(earnings.refundedCents)} refunded across {earnings.refundedCount} transaction{earnings.refundedCount === 1 ? "" : "s"} (excluded from net).
              </p>
            )}
          </Card>

          {/* Upcoming */}
          <Card className="p-5">
            <h3 className="font-medium mb-3 flex items-center gap-2"><Calendar className="size-4 text-emerald" /> Upcoming</h3>
            {upcoming.length === 0 ? (
              <p className="text-sm text-muted">Nothing scheduled. Publish office hours or accept a session request to fill your calendar.</p>
            ) : (
              <div className="space-y-2">
                {upcoming.map((u) => (
                  <Link
                    key={`${u.kind}-${u.id}`}
                    href={u.kind === "session" ? `/studio/mentor-sessions/${u.id}` : `/studio/office-hours/${u.id}`}
                    className="block"
                  >
                    <div className="rounded-xl border border-border hover:border-emerald/40 p-3 transition flex items-center gap-3">
                      <div className={`rounded-lg p-2 ${u.kind === "session" ? "bg-indigo/15 text-indigo" : "bg-emerald/15 text-emerald"}`}>
                        {u.kind === "session" ? <GraduationCap className="size-4" /> : <Users className="size-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{u.title}</div>
                        <div className="text-[11px] text-muted flex items-center gap-2 mt-0.5">
                          <span className="flex items-center gap-1"><Clock className="size-3" /> {format(new Date(u.at), "PP, p")}</span>
                          {u.kind === "office_hours" && typeof u.filled === "number" && (
                            <span className="flex items-center gap-1"><Users className="size-3" /> {u.filled} booked</span>
                          )}
                          <Badge color={u.status === "paid" ? "emerald" : "amber"}>{u.status}</Badge>
                        </div>
                      </div>
                      <ArrowRight className="size-3.5 text-muted" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function StatCard({
  label, value, sub, accent, delta, icon,
}: {
  label: string;
  value: string;
  sub: string;
  accent: "emerald" | "amber" | "indigo";
  delta?: number | null;
  icon?: React.ReactNode;
}) {
  const color = { emerald: "text-emerald", amber: "text-amber", indigo: "text-indigo" }[accent];
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-widest text-muted">{label}</div>
        {icon && <span className={color}>{icon}</span>}
      </div>
      <div className={`font-[family-name:var(--font-display)] text-2xl font-semibold mt-1 ${color}`}>{value}</div>
      <div className="text-[11px] text-muted mt-1 flex items-center gap-1.5">
        {sub}
        {typeof delta === "number" && (
          <span className={`inline-flex items-center gap-0.5 ${delta >= 0 ? "text-emerald" : "text-rust"}`}>
            {delta >= 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
            {Math.abs(delta)}%
          </span>
        )}
      </div>
    </Card>
  );
}
