"use client";

import { useState } from "react";
import Link from "next/link";
import { useAiUsage } from "@/store/ai-usage";
import { Zap } from "lucide-react";

// Compact top-bar badge showing today's AI spend. Click to open a quick
// breakdown panel. Goes amber at 60% of budget, rust at 100%.

export function AiUsageBadge() {
  const { totalToday, budgetDailyUsd, calls, hydrated } = useAiUsage();
  const [open, setOpen] = useState(false);
  if (!hydrated) return null;
  const t = totalToday();
  const pct = budgetDailyUsd > 0 ? Math.min(100, (t.usd / budgetDailyUsd) * 100) : 0;
  const tone = pct >= 100 ? "rust" : pct >= 60 ? "amber" : "emerald";
  const color = tone === "rust" ? "text-rust border-rust/40 bg-rust/10" : tone === "amber" ? "text-amber border-amber/40 bg-amber/10" : "text-emerald border-emerald/40 bg-emerald/5";

  // Group last 30 calls by scope for breakdown
  const lastCalls = calls.slice(0, 30);
  const byScope = new Map<string, { calls: number; usd: number }>();
  for (const c of lastCalls) {
    const prev = byScope.get(c.scope) ?? { calls: 0, usd: 0 };
    byScope.set(c.scope, { calls: prev.calls + 1, usd: prev.usd + c.estCostUsd });
  }
  const breakdown = Array.from(byScope.entries()).sort((a, b) => b[1].usd - a[1].usd).slice(0, 6);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`hidden sm:flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition ${color}`}
        title="AI usage today"
      >
        <Zap className="size-3" />
        ${t.usd.toFixed(2)} <span className="opacity-60">/ ${budgetDailyUsd}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-10 w-80 glass rounded-xl overflow-hidden z-30 shadow-2xl">
          <div className="px-4 py-3 border-b border-border">
            <div className="text-xs uppercase tracking-widest text-muted">AI usage today</div>
            <div className="mt-1.5 flex items-baseline gap-2">
              <span className={`font-[family-name:var(--font-display)] text-2xl font-semibold text-${tone}`}>${t.usd.toFixed(2)}</span>
              <span className="text-xs text-muted">of ${budgetDailyUsd} budget</span>
            </div>
            <div className="mt-2 h-1.5 bg-surface-2 rounded-full overflow-hidden">
              <div className={`h-full rounded-full bg-${tone}`} style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-2 text-[10px] text-muted">
              {t.calls} calls · {(t.tokensIn / 1000).toFixed(1)}k in · {(t.tokensOut / 1000).toFixed(1)}k out
            </div>
          </div>
          {breakdown.length > 0 && (
            <div className="px-4 py-3 max-h-64 overflow-y-auto">
              <div className="text-[10px] uppercase tracking-widest text-muted mb-2">Recent activity</div>
              <div className="space-y-1.5">
                {breakdown.map(([scope, v]) => (
                  <div key={scope} className="flex items-center justify-between text-xs">
                    <span className="text-foreground/90 font-mono truncate">{scope}</span>
                    <span className="text-muted font-mono shrink-0 ml-2">${v.usd.toFixed(3)} · {v.calls}x</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="px-4 py-2.5 border-t border-border flex items-center justify-between">
            <Link href="/studio/settings" onClick={() => setOpen(false)} className="text-[10px] text-muted hover:text-emerald uppercase tracking-widest">
              Adjust budget →
            </Link>
            <span className="text-[10px] text-muted">resets at midnight</span>
          </div>
        </div>
      )}
    </div>
  );
}
