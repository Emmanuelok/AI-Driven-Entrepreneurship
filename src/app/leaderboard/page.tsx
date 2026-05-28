"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Hand, Eye, GitFork, Hammer, Rocket, Trophy, ArrowLeft } from "lucide-react";

type Row = {
  kind: "build" | "venture";
  slug: string;
  title: string;
  description: string | null;
  claps: number;
  views: number;
  forks?: number;
  updated_at: string;
};

type Range = "7" | "30" | "all";

export default function LeaderboardPage() {
  const [range, setRange] = useState<Range>("30");
  const [builds, setBuilds] = useState<Row[]>([]);
  const [ventures, setVentures] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/leaderboard?range=${range}&limit=20`)
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) {
          setBuilds(data.builds || []);
          setVentures(data.ventures || []);
        }
      })
      .finally(() => setLoading(false));
  }, [range]);

  return (
    <div className="min-h-screen bg-[#0a0f0d] text-[#e7efe9]">
      <div className="max-w-6xl mx-auto px-6 sm:px-8 py-10 sm:py-14">
        <Link href="/studio" className="text-xs text-[#8aa39a] hover:text-[#e7efe9] inline-flex items-center gap-1.5 mb-6">
          <ArrowLeft className="size-3" /> Back to studio
        </Link>

        <header className="mb-8">
          <p className="text-xs uppercase tracking-[0.22em] text-[#2cc295] mb-2 flex items-center gap-1.5">
            <Trophy className="size-3.5" /> Leaderboard
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-4xl sm:text-5xl font-semibold leading-tight">
            What the community is building.
          </h1>
          <p className="mt-3 text-[#8aa39a] max-w-2xl">
            Top-clapped public builds and venture profiles, refreshed live. Open one to see how it&apos;s wired — fork what works, learn what doesn&apos;t.
          </p>
        </header>

        <div className="flex items-center gap-2 mb-8">
          {(["7", "30", "all"] as Range[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`text-xs px-3 py-1.5 rounded-full border transition ${range === r ? "border-[#2cc295] bg-[#2cc295]/10 text-[#2cc295]" : "border-[#2a3a35] text-[#8aa39a] hover:text-[#e7efe9]"}`}
            >
              {r === "7" ? "Past 7 days" : r === "30" ? "Past 30 days" : "All time"}
            </button>
          ))}
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          <Section title="Top builds" tone="emerald" icon={Hammer} rows={builds} loading={loading} hrefBase="/studio/marketplace" />
          <Section title="Top ventures" tone="amber" icon={Rocket} rows={ventures} loading={loading} hrefBase="/v" />
        </div>

        <p className="mt-12 text-[10px] text-[#6b8079] text-center">
          Ranking = unique claps in the selected window. Ties broken by recency. Self-claps and removed claps don&apos;t count.
        </p>
      </div>
    </div>
  );
}

function Section({ title, tone, icon: Icon, rows, loading, hrefBase }: { title: string; tone: "emerald" | "amber"; icon: typeof Hammer; rows: Row[]; loading: boolean; hrefBase: string }) {
  const accent = tone === "emerald" ? "#2cc295" : "#f4a949";
  return (
    <section>
      <h2 className="font-medium flex items-center gap-2 mb-4">
        <Icon className="size-4" style={{ color: accent }} /> {title}
      </h2>
      {loading ? (
        <div className="text-sm text-[#8aa39a] italic">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-[#2a3a35] bg-[#141d1a] p-6 text-sm text-[#8aa39a]">
          No data yet for this window. Be the first to publish.
        </div>
      ) : (
        <ol className="space-y-2">
          {rows.map((r, i) => (
            <li key={r.slug}>
              <Link href={`${hrefBase}/${r.slug}`} className="block rounded-2xl border border-[#2a3a35] bg-[#141d1a] hover:border-[#2cc295]/40 hover:bg-[#141d1a]/80 transition p-4">
                <div className="flex items-start gap-4">
                  <div className="font-[family-name:var(--font-display)] text-2xl font-semibold w-10 text-right" style={{ color: i < 3 ? accent : "#3d5048" }}>
                    {String(i + 1).padStart(2, "0")}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm leading-snug">{r.title}</div>
                    {r.description && <p className="text-xs text-[#8aa39a] mt-1 line-clamp-2">{r.description}</p>}
                    <div className="mt-2 flex items-center gap-3 text-[10px] text-[#8aa39a]">
                      <span className="flex items-center gap-1" style={{ color: accent }}>
                        <Hand className="size-2.5" /> {r.claps}
                      </span>
                      <span className="flex items-center gap-1"><Eye className="size-2.5" /> {r.views}</span>
                      {typeof r.forks === "number" && (
                        <span className="flex items-center gap-1"><GitFork className="size-2.5" /> {r.forks}</span>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
