"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { profileApi } from "@/lib/profile-api";
import type {
  BalanceState, PayoutScheduleSummary, PayoutRow, LedgerRow, LedgerSummary,
} from "@/lib/payouts";
import { formatMoney, payoutStatusLabel } from "@/lib/payouts";
import { Card, Badge, Button } from "@/components/ui";
import {
  Wallet, ArrowLeft, Loader2, AlertCircle, ArrowRight, CreditCard,
  CalendarDays, BanknoteIcon, Filter, ChevronDown, ExternalLink,
  TrendingUp, RefreshCw, GraduationCap, Users, Sparkles, Clock, Hourglass, Zap,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

// /studio/payouts — mentor payouts transparency dashboard.
// Two side-by-side concerns:
//   - LIVE Stripe Connect: balance, schedule, payout history
//   - LOCAL ledger: every transaction we generated, filterable
//
// Both arrive in parallel; either side can degrade independently
// (stripe outage → only the ledger; no seller row → only setup CTA).

type Filters = {
  source: "" | "session" | "office_hours";
  status: "" | "earned" | "upcoming" | "refunded";
};

const STATUS_COLOR: Record<LedgerRow["status"], "muted" | "amber" | "emerald" | "rust"> = {
  earned: "emerald",
  upcoming: "amber",
  refunded: "rust",
};

const PAYOUT_COLOR: Record<string, "muted" | "amber" | "emerald" | "rust" | "indigo"> = {
  paid: "emerald",
  in_transit: "indigo",
  pending: "amber",
  canceled: "muted",
  failed: "rust",
};

export default function PayoutsPage() {
  // Stripe-derived state
  const [sellerReady, setSellerReady] = useState(false);
  const [setupRequired, setSetupRequired] = useState(false);
  const [setupInProgress, setSetupInProgress] = useState(false);
  const [balance, setBalance] = useState<BalanceState | null>(null);
  const [schedule, setSchedule] = useState<PayoutScheduleSummary | null>(null);
  const [payouts, setPayouts] = useState<PayoutRow[]>([]);
  const [liveError, setLiveError] = useState<string | null>(null);

  // Local ledger state
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [summary, setSummary] = useState<LedgerSummary | null>(null);
  const [total, setTotal] = useState(0);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>({ source: "", status: "" });

  async function loadStripe() {
    const r = await profileApi.getPayouts(15);
    if (!r.ok) { setErr(r.error || "Failed to load payouts"); return; }
    setSellerReady(r.sellerReady);
    setSetupRequired(r.setupRequired);
    setSetupInProgress(r.setupInProgress);
    setBalance(r.balance);
    setSchedule(r.schedule);
    setPayouts(r.payouts);
    setLiveError(r.liveError);
  }

  async function loadTxns() {
    const r = await profileApi.getTransactions({
      source: filters.source || undefined,
      status: filters.status || undefined,
      limit: 100,
    });
    if (!r.ok) { setErr(r.error || "Failed to load transactions"); return; }
    setRows(r.rows);
    setSummary(r.summary);
    setTotal(r.total);
  }

  async function loadAll() {
    setErr(null);
    await Promise.all([loadStripe(), loadTxns()]);
    setLoading(false);
  }

  useEffect(() => { loadAll(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  // Re-fetch the ledger when filters change (cheap, local-only).
  useEffect(() => { if (!loading) loadTxns(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [filters.source, filters.status]);

  async function refresh() {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  }

  const currency = balance?.currency ?? summary?.primaryCurrency ?? "usd";

  return (
    <div className="max-w-5xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <Link href="/studio/mentor-dashboard" className="text-xs text-muted hover:text-foreground inline-flex items-center gap-1.5 mb-4">
        <ArrowLeft className="size-3" /> Mentor dashboard
      </Link>

      <header className="mb-6 flex items-end justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-emerald mb-2 flex items-center gap-1.5">
            <BanknoteIcon className="size-3.5" /> Payouts
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight">
            Where your money is.
          </h1>
          <p className="mt-3 text-muted max-w-2xl leading-relaxed">
            Live Stripe balance, the schedule your bank receives funds on, and every paid transaction in one ledger. We don&apos;t store your money — Stripe does. This is the same data your Stripe dashboard shows, surfaced where you build.
          </p>
        </div>
        {sellerReady && (
          <Button variant="ghost" onClick={refresh} disabled={refreshing}>
            {refreshing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Refresh
          </Button>
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
      ) : setupRequired ? (
        <SetupRequiredCard />
      ) : setupInProgress ? (
        <SetupInProgressCard />
      ) : (
        <>
          {/* Live Stripe banner if the call failed */}
          {liveError && (
            <Card className="p-4 border-amber/40 mb-4 flex items-start gap-3">
              <AlertCircle className="size-5 text-amber mt-0.5" />
              <div className="flex-1">
                <div className="text-sm font-medium">Stripe is temporarily unreachable</div>
                <p className="text-xs text-muted mt-0.5">
                  Balance + payout history couldn&apos;t be pulled live ({liveError}). Your transaction ledger below is from our records and is unaffected.
                </p>
              </div>
            </Card>
          )}

          {/* Balance + schedule */}
          {balance && (
            <div className="grid sm:grid-cols-3 gap-3 mb-6">
              <BalanceCard
                label="Available now"
                hint="Paid out on schedule"
                amountCents={balance.availableCents}
                currency={balance.currency}
                accent="emerald"
                icon={<Wallet className="size-4" />}
              />
              <BalanceCard
                label="Pending"
                hint="Clearing through Stripe"
                amountCents={balance.pendingCents}
                currency={balance.currency}
                accent="amber"
                icon={<Hourglass className="size-4" />}
              />
              <BalanceCard
                label="Instant available"
                hint="Eligible for instant payout"
                amountCents={balance.instantAvailableCents}
                currency={balance.currency}
                accent="indigo"
                icon={<Zap className="size-4" />}
              />
            </div>
          )}

          {schedule && (
            <Card className="p-5 mb-6">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="text-xs uppercase tracking-widest text-muted mb-1 flex items-center gap-1.5">
                    <CalendarDays className="size-3.5 text-emerald" /> Payout schedule
                  </div>
                  <div className="font-[family-name:var(--font-display)] text-xl font-semibold">{schedule.label}</div>
                  {schedule.delayDays > 0 && (
                    <p className="text-xs text-muted mt-1">
                      Funds clear after a {schedule.delayDays}-day Stripe hold before becoming available.
                    </p>
                  )}
                  {!schedule.isAutomatic && (
                    <p className="text-xs text-muted mt-1">
                      Manual schedule — initiate payouts from the Stripe dashboard.
                    </p>
                  )}
                </div>
                {schedule.nextPayoutAt && (
                  <div className="text-right">
                    <div className="text-xs uppercase tracking-widest text-muted">Next payout</div>
                    <div className="font-[family-name:var(--font-display)] text-xl font-semibold text-emerald mt-1">
                      {format(new Date(schedule.nextPayoutAt), "MMM d")}
                    </div>
                    <div className="text-[10px] text-muted">
                      {formatDistanceToNow(new Date(schedule.nextPayoutAt), { addSuffix: true })}
                    </div>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Payout history */}
          <Card className="p-5 mb-6">
            <h3 className="font-medium mb-3 flex items-center gap-2"><BanknoteIcon className="size-4 text-emerald" /> Payout history</h3>
            {payouts.length === 0 ? (
              <p className="text-sm text-muted">
                No payouts yet. {balance && balance.availableCents > 0 ? "Your next payout will appear here once Stripe processes it." : "Once you earn enough to cover Stripe's first payout, it'll show up here."}
              </p>
            ) : (
              <div className="space-y-2">
                {payouts.map((p) => (
                  <PayoutRowView key={p.id} p={p} />
                ))}
              </div>
            )}
          </Card>

          {/* Local ledger summary stats */}
          {summary && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
              <MiniStat label="Lifetime earned" value={formatMoney(summary.earnedNetCents, currency)} sub={`${summary.earnedCount} paid`} accent="emerald" />
              <MiniStat label="Upcoming" value={formatMoney(summary.upcomingNetCents, currency)} sub={`${summary.upcomingCount} session${summary.upcomingCount === 1 ? "" : "s"}`} accent="amber" />
              <MiniStat label="Platform fees" value={formatMoney(summary.earnedFeeCents, currency)} sub={`${summary.earnedCount} txns`} accent="indigo" />
              <MiniStat label="Refunded" value={formatMoney(summary.refundedNetCents, currency)} sub={`${summary.refundedCount} reversed`} accent="muted" />
            </div>
          )}

          {/* Ledger filters */}
          <Card className="p-3 mb-3 flex flex-wrap items-center gap-2">
            <Filter className="size-3.5 text-muted ml-1" />
            <FilterChip
              label="Source"
              value={filters.source}
              onChange={(v) => setFilters((f) => ({ ...f, source: v as Filters["source"] }))}
              options={[
                { v: "", label: "All sources" },
                { v: "session", label: "1:1 sessions" },
                { v: "office_hours", label: "Office hours" },
              ]}
            />
            <FilterChip
              label="Status"
              value={filters.status}
              onChange={(v) => setFilters((f) => ({ ...f, status: v as Filters["status"] }))}
              options={[
                { v: "", label: "All statuses" },
                { v: "earned", label: "Earned" },
                { v: "upcoming", label: "Upcoming" },
                { v: "refunded", label: "Refunded" },
              ]}
            />
            <div className="ml-auto text-xs text-muted pr-1">{total} match{total === 1 ? "" : "es"}</div>
          </Card>

          {/* Ledger */}
          <Card className="p-5">
            <h3 className="font-medium mb-3 flex items-center gap-2"><TrendingUp className="size-4 text-emerald" /> Transaction ledger</h3>
            {rows.length === 0 ? (
              <p className="text-sm text-muted">Nothing matches these filters yet.</p>
            ) : (
              <div className="space-y-1.5">
                {rows.map((r) => <LedgerRowView key={r.id} r={r} />)}
              </div>
            )}
            {rows.length < total && (
              <p className="text-xs text-muted mt-3">Showing {rows.length} of {total}. Refine filters to narrow.</p>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

// ── Cards ──────────────────────────────────────────────────────────

function BalanceCard({ label, hint, amountCents, currency, accent, icon }: {
  label: string;
  hint: string;
  amountCents: number;
  currency: string;
  accent: "emerald" | "amber" | "indigo";
  icon: React.ReactNode;
}) {
  const color = { emerald: "text-emerald", amber: "text-amber", indigo: "text-indigo" }[accent];
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-widest text-muted">{label}</div>
        <span className={color}>{icon}</span>
      </div>
      <div className={`font-[family-name:var(--font-display)] text-3xl font-semibold mt-1 ${color}`}>
        {formatMoney(amountCents, currency)}
      </div>
      <div className="text-[11px] text-muted mt-1">{hint}</div>
    </Card>
  );
}

function MiniStat({ label, value, sub, accent }: { label: string; value: string; sub: string; accent: "emerald" | "amber" | "indigo" | "muted" }) {
  const color = { emerald: "text-emerald", amber: "text-amber", indigo: "text-indigo", muted: "text-muted" }[accent];
  return (
    <Card className="p-4">
      <div className="text-[10px] uppercase tracking-widest text-muted">{label}</div>
      <div className={`font-[family-name:var(--font-display)] text-2xl font-semibold mt-1 ${color}`}>{value}</div>
      <div className="text-[11px] text-muted mt-1">{sub}</div>
    </Card>
  );
}

function PayoutRowView({ p }: { p: PayoutRow }) {
  const color = PAYOUT_COLOR[p.status] ?? "muted";
  return (
    <div className="rounded-xl border border-border p-3 flex items-center gap-3">
      <div className={`rounded-lg p-2 bg-emerald/10 text-emerald`}>
        <BanknoteIcon className="size-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">{formatMoney(p.amountCents, p.currency)}</span>
          <Badge color={color}>{payoutStatusLabel(p.status)}</Badge>
          {p.method === "instant" && <Badge color="indigo">Instant</Badge>}
          {!p.automatic && <Badge color="muted">Manual</Badge>}
        </div>
        <div className="text-[11px] text-muted mt-0.5 flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1">
            <Clock className="size-3" />
            Arrives {format(new Date(p.arrivalAt), "MMM d, yyyy")} ({formatDistanceToNow(new Date(p.arrivalAt), { addSuffix: true })})
          </span>
          {p.description && <span className="italic">· {p.description}</span>}
        </div>
        {p.failureMessage && <div className="text-xs text-rust mt-1">{p.failureMessage}</div>}
      </div>
    </div>
  );
}

function LedgerRowView({ r }: { r: LedgerRow }) {
  const Icon = r.source === "session" ? GraduationCap : Users;
  return (
    <Link href={r.detailUrl} className="block">
      <div className="rounded-lg border border-border hover:border-emerald/40 px-3 py-2 transition flex items-center gap-3">
        <div className={`rounded-lg p-1.5 ${r.source === "session" ? "bg-indigo/15 text-indigo" : "bg-emerald/15 text-emerald"}`}>
          <Icon className="size-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate flex items-center gap-2">
            {r.label}
            <Badge color={STATUS_COLOR[r.status]}>{r.status}</Badge>
          </div>
          <div className="text-[10px] text-muted truncate">
            {r.counterpartyName} · {format(new Date(r.occurredAt), "MMM d, yyyy")}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className={`text-sm font-semibold ${r.netCents < 0 ? "text-rust" : r.status === "upcoming" ? "text-amber" : "text-emerald"}`}>
            {r.netCents >= 0 ? "+" : ""}{formatMoney(r.netCents, r.currency)}
          </div>
          <div className="text-[10px] text-muted">gross {formatMoney(Math.abs(r.grossCents), r.currency)}</div>
        </div>
        <ArrowRight className="size-3 text-muted shrink-0" />
      </div>
    </Link>
  );
}

function FilterChip<T extends string>({ label, value, onChange, options }: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: Array<{ v: T; label: string }>;
}) {
  return (
    <div className="relative inline-block">
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="appearance-none bg-surface-2 border border-border rounded-full pl-3 pr-7 py-1.5 text-xs outline-none focus:border-emerald cursor-pointer"
      >
        {options.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
      </select>
      <ChevronDown className="size-3 text-muted absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
    </div>
  );
}

// ── Empty states ───────────────────────────────────────────────────

function SetupRequiredCard() {
  return (
    <Card className="p-10 text-center">
      <CreditCard className="size-8 text-emerald mx-auto mb-3" />
      <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">Connect Stripe to receive payouts</h2>
      <p className="text-sm text-muted leading-relaxed max-w-md mx-auto mt-2 mb-4">
        You haven&apos;t connected a Stripe Connect account yet. Stripe holds the funds your students and founders pay you, then deposits them to your bank on schedule. Sankofa never touches the money.
      </p>
      <Link href="/studio/settings">
        <Button>Set up payouts <ArrowRight className="size-3.5" /></Button>
      </Link>
    </Card>
  );
}

function SetupInProgressCard() {
  return (
    <Card className="p-10 text-center">
      <Sparkles className="size-8 text-amber mx-auto mb-3" />
      <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">Almost there — Stripe is verifying you</h2>
      <p className="text-sm text-muted leading-relaxed max-w-md mx-auto mt-2 mb-4">
        Your Stripe Connect onboarding is in progress. Once Stripe verifies your account, charges will be enabled and balance + payout data will appear here. This usually takes a few minutes to a couple of business days.
      </p>
      <Link href="/studio/settings">
        <Button variant="secondary">Continue onboarding <ArrowRight className="size-3.5" /></Button>
      </Link>
    </Card>
  );
}
