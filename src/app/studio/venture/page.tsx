"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Rocket,
  CheckCircle2,
  Circle,
  Users,
  Lightbulb,
  Wrench,
  Megaphone,
  TrendingUp,
  Send,
  Brain,
  Calendar,
  MapPin,
  Sparkles,
} from "lucide-react";

const PHASES = [
  { id: "problem", label: "Pick problem", icon: Lightbulb, done: true },
  { id: "validate", label: "Customer discovery", icon: Users, done: false, active: true },
  { id: "build", label: "Build MVP", icon: Wrench, done: false },
  { id: "launch", label: "First 10 customers", icon: Megaphone, done: false },
  { id: "scale", label: "Scale", icon: TrendingUp, done: false },
];

const INTERVIEWS = [
  { name: "Mama Adwoa", role: "Tomato seller, Tamale Central Market", date: "Day 2", verdict: "Validated: loses 4 crates/wk to spoilage", color: "emerald" },
  { name: "Kofi Asante", role: "Co-op chairman, Yendi cooperative (28 farmers)", date: "Day 4", verdict: "Validated: co-op pays GHS 1,200/mo in losses", color: "emerald" },
  { name: "Hajia Fatima", role: "Wholesale buyer, Kumasi Central", date: "Day 6", verdict: "Insight: wants verified-quality batches", color: "amber" },
  { name: "Yaw Boateng", role: "Smallholder, 2 acres", date: "Day 7", verdict: "Skeptical: 'who will fix it if it breaks?'", color: "amber" },
  { name: "Akosua Mensah", role: "Tomato seller, Bolgatanga", date: "Day 9", verdict: "Validated: would pay GHS 50/month", color: "emerald" },
  { name: "Mr. Owusu", role: "Bank loan officer, Sahel Microfinance", date: "Day 10", verdict: "Insight: financing model exists — leasing", color: "amber" },
  { name: "Ama Serwaa", role: "Logistics, Tamale-Kumasi route", date: "Day 11", verdict: "Insight: trucks return empty — backhaul opportunity", color: "emerald" },
  { name: "Pastor Mensah", role: "Community elder, Wa", date: "Day 12", verdict: "Validated: introduced us to 4 more co-ops", color: "emerald" },
];

export default function VenturePage() {
  const [coachOpen, setCoachOpen] = useState(false);

  return (
    <div className="max-w-6xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      {/* Header / hero */}
      <div className="glass rounded-3xl p-7 sm:p-10 relative overflow-hidden mb-8">
        <div className="absolute -top-24 -right-24 size-72 rounded-full bg-emerald opacity-15 blur-3xl" />
        <div className="absolute -bottom-24 -left-24 size-72 rounded-full bg-amber opacity-15 blur-3xl" />
        <div className="relative">
          <p className="text-xs uppercase tracking-[0.22em] text-amber mb-3 flex items-center gap-2">
            <Rocket className="size-3.5" /> Active Venture · Day 12 of validation sprint
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-3xl sm:text-5xl font-semibold leading-tight">
            KubaCold
          </h1>
          <p className="mt-2 text-lg text-muted">
            Solar microcold-storage for tomato co-ops in Northern Ghana — pay-per-crate
          </p>
          <div className="flex flex-wrap gap-x-6 gap-y-2 mt-5 text-sm text-muted">
            <span className="flex items-center gap-1.5"><MapPin className="size-3.5 text-emerald" /> Tamale + Yendi + Bolgatanga</span>
            <span className="flex items-center gap-1.5"><Users className="size-3.5 text-emerald" /> 3 co-founders · 1 advisor</span>
            <span className="flex items-center gap-1.5"><Calendar className="size-3.5 text-emerald" /> Started 12 days ago</span>
            <Link href="/studio/problems/post-harvest-loss" className="flex items-center gap-1.5 text-emerald hover:underline">
              ← Problem brief
            </Link>
          </div>
        </div>
      </div>

      {/* Phase tracker */}
      <div className="glass rounded-2xl p-6 mb-8">
        <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold mb-5">Venture pipeline</h2>
        <div className="flex items-start justify-between relative gap-2">
          <div className="absolute top-5 left-[5%] right-[5%] h-px bg-border" />
          <div
            className="absolute top-5 left-[5%] h-px bg-emerald"
            style={{ width: `${(PHASES.findIndex((p) => p.active) / (PHASES.length - 1)) * 90}%` }}
          />
          {PHASES.map((p, i) => {
            const Icon = p.icon;
            return (
              <div key={p.id} className="flex flex-col items-center text-center relative z-10 flex-1 min-w-0">
                <div
                  className={`size-11 rounded-full flex items-center justify-center border-2 ${
                    p.done
                      ? "bg-emerald border-emerald text-black"
                      : p.active
                      ? "bg-amber border-amber text-black pulse-dot"
                      : "bg-surface-2 border-border text-muted"
                  }`}
                >
                  {p.done ? <CheckCircle2 className="size-5" /> : <Icon className="size-5" />}
                </div>
                <div className={`mt-3 text-xs ${p.active ? "text-amber font-medium" : "text-muted"}`}>
                  {String(i + 1).padStart(2, "0")}
                </div>
                <div className={`text-xs sm:text-sm mt-1 ${p.done || p.active ? "text-foreground" : "text-muted"}`}>{p.label}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Validation board */}
      <div className="grid lg:grid-cols-3 gap-4 mb-8">
        <div className="glass rounded-2xl p-5">
          <div className="text-xs uppercase tracking-widest text-muted">Interviews logged</div>
          <div className="font-[family-name:var(--font-display)] text-4xl font-semibold text-emerald mt-1">
            {INTERVIEWS.length}<span className="text-muted text-2xl"> / 20</span>
          </div>
          <p className="text-xs text-muted mt-2">
            Sage scheduled the next 4 in Tamale this Thursday.
          </p>
        </div>
        <div className="glass rounded-2xl p-5">
          <div className="text-xs uppercase tracking-widest text-muted">Pain validated</div>
          <div className="font-[family-name:var(--font-display)] text-4xl font-semibold text-emerald mt-1">
            5<span className="text-muted text-2xl"> /8</span>
          </div>
          <p className="text-xs text-muted mt-2">
            62.5% strong-yes rate. Above the 50% threshold to move to MVP.
          </p>
        </div>
        <div className="glass rounded-2xl p-5">
          <div className="text-xs uppercase tracking-widest text-muted">Willingness to pay</div>
          <div className="font-[family-name:var(--font-display)] text-4xl font-semibold text-amber mt-1">
            GHS 50<span className="text-muted text-2xl">/mo</span>
          </div>
          <p className="text-xs text-muted mt-2">
            Median verbal commit. Test signed letters next.
          </p>
        </div>
      </div>

      {/* Interview log */}
      <div className="glass rounded-2xl overflow-hidden mb-8">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <h3 className="font-semibold flex items-center gap-2">
            <Users className="size-4 text-emerald" /> Discovery interviews
          </h3>
          <button className="text-xs text-emerald hover:underline">+ Log new interview</button>
        </div>
        <div className="divide-y divide-border">
          {INTERVIEWS.map((iv) => (
            <div key={iv.name} className="px-6 py-4 grid sm:grid-cols-[1fr_2fr_auto] gap-3 items-center hover:bg-surface-2 transition">
              <div className="min-w-0">
                <div className="font-medium truncate">{iv.name}</div>
                <div className="text-xs text-muted truncate">{iv.role}</div>
              </div>
              <div className="text-sm text-muted">{iv.verdict}</div>
              <div className="flex items-center gap-3">
                <span className={`text-[10px] uppercase tracking-widest px-2 py-1 rounded-full border ${
                  iv.color === "emerald" ? "text-emerald border-emerald/40 bg-emerald/5" : "text-amber border-amber/40 bg-amber/5"
                }`}>
                  {iv.color === "emerald" ? "Validated" : "Insight"}
                </span>
                <span className="text-xs text-muted shrink-0">{iv.date}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Lean canvas */}
      <div className="glass rounded-2xl p-6 mb-8">
        <h3 className="font-[family-name:var(--font-display)] text-xl font-semibold mb-1">Lean Canvas v0.3</h3>
        <p className="text-xs text-muted mb-5">Updated by Sage after each batch of interviews.</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
          {[
            { t: "Problem", v: "30-40% post-harvest tomato loss = GHS 1,200+/mo per co-op", c: "emerald" },
            { t: "Customer", v: "Tomato-trading co-ops of 20-40 farmers in N. Ghana savannah belt", c: "emerald" },
            { t: "Value prop", v: "GHS 50/mo + per-crate fee = guaranteed buyer + 80% loss reduction", c: "amber" },
            { t: "Solution", v: "Solar-powered 500kg cold cell + vision-based quality grading app", c: "amber" },
            { t: "Channels", v: "Co-op chairmen → Pastor introductions → 12 co-ops mapped", c: "indigo" },
            { t: "Revenue", v: "Subscription + crate fee + premium-buyer takerate", c: "indigo" },
            { t: "Cost", v: "Unit BOM GHS 18k · payback < 14 mo at 22 co-ops", c: "rust" },
            { t: "Metrics", v: "Loss-% reduction, crate throughput, buyer NPS", c: "rust" },
            { t: "Unfair edge", v: "Local trust + Sage-trained co-founder team + AGRA pilot grant pre-LOI", c: "emerald" },
          ].map((b) => (
            <div key={b.t} className="rounded-xl border border-border bg-surface-2/40 p-4">
              <div className="text-[10px] uppercase tracking-widest text-muted mb-1.5">{b.t}</div>
              <div className="text-sm text-foreground/90 leading-snug">{b.v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* AI venture coach */}
      <div className="glass rounded-2xl p-6">
        <div className="flex items-start gap-4">
          <div className="size-11 rounded-2xl bg-gradient-to-br from-emerald to-emerald-deep flex items-center justify-center shrink-0 shadow-lg shadow-emerald/20">
            <Brain className="size-5 text-black" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium">Sage · Venture coach</span>
              <span className="text-[10px] uppercase tracking-widest text-emerald border border-emerald/40 bg-emerald/5 px-2 py-0.5 rounded-full">Today&apos;s nudge</span>
            </div>
            <p className="text-foreground/90 leading-relaxed">
              You&apos;ve got 5/8 strong-yes — that&apos;s above threshold. Before you build the MVP, run <span className="text-amber">2 letters-of-intent</span> with Mama Adwoa and Kofi Asante. A signed letter (even informal) converts a verbal &quot;maybe&quot; into a real commitment. I drafted templates for both — want me to send them?
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button className="bg-emerald text-black font-medium text-sm px-4 py-2 rounded-full hover:bg-amber transition flex items-center gap-1.5">
                <Send className="size-3.5" /> Send LOI drafts
              </button>
              <button
                onClick={() => setCoachOpen(!coachOpen)}
                className="border border-border text-sm px-4 py-2 rounded-full hover:bg-surface-2 transition"
              >
                Ask Sage a follow-up
              </button>
              <Link
                href="/studio/tutor"
                className="text-sm px-4 py-2 rounded-full text-emerald hover:underline flex items-center gap-1.5"
              >
                <Sparkles className="size-3.5" /> Open full Sage
              </Link>
            </div>
            {coachOpen && (
              <textarea
                placeholder="e.g. How aggressive should I be on the LOI commitment terms?"
                className="mt-4 w-full bg-surface-2 border border-border rounded-xl px-4 py-3 outline-none focus:border-emerald text-sm"
                rows={3}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
