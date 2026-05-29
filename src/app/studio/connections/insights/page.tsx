"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase";
import { useStore } from "@/store";
import { useBuild } from "@/store/build";
import { useSketch } from "@/store/sketch";
import { useLetters } from "@/store/letters";
import { Card } from "@/components/ui";
import { ArrowLeft, Network, TrendingUp, Sprout, Unplug, Loader2 } from "lucide-react";
import { KIND_LABEL, hrefForEntity, type ConnectionRow, type ConnectionKind } from "@/lib/connections";

// Patterns surfaced from the user's connection graph. Useful only for
// users who've drawn a non-trivial number of edges — small graphs get
// empty-state cards instead of confusing single-data-point claims.

type Insight = {
  title: string;
  icon: typeof Network;
  body: React.ReactNode;
  empty?: boolean;
};

export default function ConnectionInsightsPage() {
  const [rows, setRows] = useState<ConnectionRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Local-store titles so insights name things, not nanoids.
  const ventures = useStore((s) => s.ventures);
  const builds = useBuild((s) => s.projects);
  const sketches = useSketch((s) => s.boards);
  const letters = useLetters((s) => s.letters);

  useEffect(() => {
    (async () => {
      try {
        const sb = supabaseBrowser();
        if (!sb) { setLoading(false); return; }
        const { data: { session } } = await sb.auth.getSession();
        if (!session) { setLoading(false); return; }
        const res = await fetch("/api/v2/connections?all=1", { headers: { Authorization: `Bearer ${session.access_token}` } });
        const data = await res.json();
        if (data.ok) setRows(data.results ?? []);
      } finally { setLoading(false); }
    })();
  }, []);

  const titleFor = (kind: string, id: string): string | null => {
    switch (kind) {
      case "venture": return ventures.find((v) => v.id === id)?.name ?? null;
      case "build": return builds.find((p) => p.id === id)?.name ?? null;
      case "sketch": return sketches.find((s) => s.id === id)?.title ?? null;
      case "letter": return letters.find((l) => l.id === id)?.title ?? null;
      default: return null;
    }
  };

  const insights = useMemo<Insight[]>(() => {
    if (rows.length === 0) return [];

    // ── Most-connected problem ────────────────────────────────────────
    const problemDegree = new Map<string, number>();
    for (const r of rows) {
      if (r.from_kind === "problem") problemDegree.set(r.from_id, (problemDegree.get(r.from_id) ?? 0) + 1);
      if (r.to_kind === "problem") problemDegree.set(r.to_id, (problemDegree.get(r.to_id) ?? 0) + 1);
    }
    const topProblem = Array.from(problemDegree.entries()).sort((a, b) => b[1] - a[1])[0];

    // ── Sketches that became ventures (sketch → venture edges) ────────
    const sketchToVenture = rows.filter((r) =>
      (r.from_kind === "sketch" && r.to_kind === "venture") ||
      (r.from_kind === "venture" && r.to_kind === "sketch")
    );
    const seededVentures = new Set<string>();
    for (const r of sketchToVenture) {
      const vid = r.from_kind === "venture" ? r.from_id : r.to_id;
      seededVentures.add(vid);
    }

    // ── Builds without any connections ───────────────────────────────
    const connectedBuildIds = new Set<string>();
    for (const r of rows) {
      if (r.from_kind === "build") connectedBuildIds.add(r.from_id);
      if (r.to_kind === "build") connectedBuildIds.add(r.to_id);
    }
    const orphanBuilds = builds.filter((b) => !connectedBuildIds.has(b.id));

    return [
      {
        title: "Most-connected problem",
        icon: TrendingUp,
        empty: !topProblem,
        body: topProblem ? (
          <p className="text-sm text-foreground/95 leading-relaxed">
            <Link href={hrefForEntity("problem", topProblem[0]) ?? "#"} className="font-mono text-emerald hover:text-amber">{topProblem[0]}</Link> has <strong>{topProblem[1]}</strong> edges pointing at it from your work. That&apos;s where you keep coming back — worth a serious wedge.
          </p>
        ) : (
          <p className="text-sm text-muted italic">No problem has more than one connection yet. As you tie ventures and builds to Atlas problems, this pattern emerges.</p>
        ),
      },
      {
        title: "Sketches that became ventures",
        icon: Sprout,
        empty: seededVentures.size === 0,
        body: seededVentures.size > 0 ? (
          <ul className="text-sm text-foreground/95 space-y-1.5">
            {Array.from(seededVentures).slice(0, 5).map((vid) => {
              const name = titleFor("venture", vid) ?? vid.slice(0, 12);
              const href = hrefForEntity("venture", vid);
              return (
                <li key={vid} className="flex items-center gap-2">
                  <Sprout className="size-3 text-emerald shrink-0" />
                  {href ? <Link href={href} className="hover:text-emerald transition">{name}</Link> : <span>{name}</span>}
                  <span className="text-[10px] text-muted">seeded from a sketch</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted italic">No ventures with sketch ancestry yet. Try shipping a brainstorm canvas into a venture — that link shows up here.</p>
        ),
      },
      {
        title: "Builds without connections",
        icon: Unplug,
        empty: orphanBuilds.length === 0,
        body: orphanBuilds.length > 0 ? (
          <>
            <p className="text-sm text-foreground/95 leading-relaxed mb-2">
              {orphanBuilds.length} {orphanBuilds.length === 1 ? "build is" : "builds are"} sitting alone — no link to a problem, venture, or cohort. Connecting them feeds Sage&apos;s context.
            </p>
            <ul className="text-xs text-muted space-y-1">
              {orphanBuilds.slice(0, 5).map((b) => (
                <li key={b.id} className="flex items-center gap-2">
                  <Unplug className="size-3 shrink-0" />
                  <Link href={`/studio/build/${b.id}`} className="hover:text-emerald transition">{b.name}</Link>
                </li>
              ))}
              {orphanBuilds.length > 5 && <li className="text-[10px]">+{orphanBuilds.length - 5} more</li>}
            </ul>
          </>
        ) : (
          <p className="text-sm text-muted italic">Every build is connected to something. Clean.</p>
        ),
      },
    ];
  }, [rows, builds, ventures, sketches, letters]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── kind tallies for the header strip ─────────────────────────────
  const tallies = useMemo(() => {
    const m = new Map<ConnectionKind, number>();
    for (const r of rows) {
      m.set(r.from_kind as ConnectionKind, (m.get(r.from_kind as ConnectionKind) ?? 0) + 1);
      m.set(r.to_kind as ConnectionKind, (m.get(r.to_kind as ConnectionKind) ?? 0) + 1);
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [rows]);

  return (
    <div className="max-w-5xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <Link href="/studio/connections" className="text-sm text-muted hover:text-foreground inline-flex items-center gap-1.5 mb-6">
        <ArrowLeft className="size-3.5" /> Connection graph
      </Link>

      <header className="mb-8">
        <p className="text-xs uppercase tracking-[0.22em] text-emerald mb-2 flex items-center gap-1.5">
          <Network className="size-3.5" /> Connection insights
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight">Patterns in your web of work.</h1>
        <p className="mt-3 text-muted max-w-2xl">
          Three lenses on the edges you&apos;ve drawn: where you keep coming back, where ideas matured, and where work sits unconnected. Sage uses all three when it gives advice.
        </p>
      </header>

      {loading ? (
        <div className="text-sm text-muted italic inline-flex items-center gap-2"><Loader2 className="size-3.5 animate-spin" /> Loading…</div>
      ) : rows.length === 0 ? (
        <Card className="p-8 text-center">
          <Network className="size-8 text-muted mx-auto mb-3" />
          <p className="text-sm text-muted leading-relaxed max-w-md mx-auto">
            No connections yet — patterns need edges to form. Start linking artifacts from any detail page&apos;s <strong className="text-foreground">Connect</strong> panel.
          </p>
        </Card>
      ) : (
        <>
          <Card className="p-4 mb-6">
            <div className="text-[10px] uppercase tracking-widest text-muted mb-2">Coverage by kind</div>
            <div className="flex gap-2 flex-wrap">
              {tallies.map(([k, n]) => (
                <span key={k} className="text-xs px-2.5 py-1 rounded-full border border-border bg-surface-2/40 inline-flex items-center gap-1.5">
                  <span className="text-muted uppercase tracking-widest text-[10px]">{KIND_LABEL[k]}</span>
                  <span className="text-emerald font-mono">{n}</span>
                </span>
              ))}
            </div>
          </Card>

          <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {insights.map((i) => (
              <li key={i.title}>
                <Card className={`p-5 h-full ${i.empty ? "opacity-70" : ""}`}>
                  <h3 className="text-xs uppercase tracking-widest text-emerald mb-3 flex items-center gap-1.5">
                    <i.icon className="size-3" /> {i.title}
                  </h3>
                  {i.body}
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
