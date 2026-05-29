"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Trophy, ArrowLeft, DollarSign, ShoppingCart, Hand } from "lucide-react";

type Row = {
  seller_id: string;
  display_name: string | null;
  revenue_cents: number;
  sales_count: number;
  currency: string;
};

type Range = "7" | "30" | "all";

export default function TopSellersPage() {
  const [range, setRange] = useState<Range>("30");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/leaderboard/sellers?range=${range}&limit=50`)
      .then((r) => r.json())
      .then((data) => { if (data.ok) setRows(data.results || []); })
      .finally(() => setLoading(false));
  }, [range]);

  return (
    <div className="min-h-screen bg-[#0a0f0d] text-[#e7efe9]">
      <div className="max-w-5xl mx-auto px-6 sm:px-8 py-10 sm:py-14">
        <Link href="/leaderboard" className="text-xs text-[#8aa39a] hover:text-[#e7efe9] inline-flex items-center gap-1.5 mb-6">
          <ArrowLeft className="size-3" /> Back to leaderboard
        </Link>

        <header className="mb-8">
          <p className="text-xs uppercase tracking-[0.22em] text-[#f4a949] mb-2 flex items-center gap-1.5">
            <Trophy className="size-3.5" /> Top sellers
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-4xl sm:text-5xl font-semibold leading-tight">
            Who&apos;s earning on Sankofa.
          </h1>
          <p className="mt-3 text-[#8aa39a] max-w-2xl">
            Students, instructors, and creators making money on the platform — combined revenue from paid cohorts and paid builds, ranked by gross sales in the selected window. Payouts go straight to their Stripe accounts; the platform takes a transparent application fee.
          </p>
        </header>

        <div className="flex items-center gap-2 mb-8">
          {(["7", "30", "all"] as Range[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`text-xs px-3 py-1.5 rounded-full border transition ${range === r ? "border-[#f4a949] bg-[#f4a949]/10 text-[#f4a949]" : "border-[#2a3a35] text-[#8aa39a] hover:text-[#e7efe9]"}`}
            >
              {r === "7" ? "Past 7 days" : r === "30" ? "Past 30 days" : "All time"}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-sm text-[#8aa39a] italic">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-[#2a3a35] bg-[#141d1a] p-6 text-sm text-[#8aa39a]">
            No sales in this window yet. Be the first — set a price on your cohort or marketplace build.
          </div>
        ) : (
          <ol className="space-y-2">
            {rows.map((s, i) => (
              <li key={s.seller_id} className="rounded-2xl border border-[#2a3a35] bg-[#141d1a] p-4">
                <div className="flex items-start gap-4">
                  <div className="font-[family-name:var(--font-display)] text-2xl font-semibold w-10 text-right" style={{ color: i < 3 ? "#f4a949" : "#3d5048" }}>
                    {String(i + 1).padStart(2, "0")}
                  </div>
                  <div className="size-9 rounded-full bg-gradient-to-br from-[#2cc295] to-[#f4a949] flex items-center justify-center text-black font-semibold text-xs shrink-0">
                    {(s.display_name || "?")[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{s.display_name || "Anonymous"}</div>
                    <div className="text-[10px] text-[#8aa39a] mt-1 flex items-center gap-3 flex-wrap">
                      <span className="inline-flex items-center gap-1">
                        <DollarSign className="size-2.5" /> {(s.revenue_cents / 100).toFixed(2)} {s.currency.toUpperCase()}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <ShoppingCart className="size-2.5" /> {s.sales_count} sale{s.sales_count === 1 ? "" : "s"}
                      </span>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}

        <p className="mt-12 text-[10px] text-[#6b8079] text-center">
          Revenue = gross sales (Stripe charges) before the platform application fee. Refunds reduce the totals. Personally identifying details aren&apos;t shown beyond the display name the seller chose.
        </p>
      </div>
    </div>
  );
}
