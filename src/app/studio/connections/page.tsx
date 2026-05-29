"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase";
import { Card } from "@/components/ui";
import { Link2, ArrowLeft, Network, Loader2 } from "lucide-react";
import { KIND_LABEL, hrefForEntity, type ConnectionRow, type ConnectionKind } from "@/lib/connections";

// User's entire connection graph — every edge they've drawn between
// artifacts. Rendered as a node-link diagram (SVG) so they can see
// the shape of their work at a glance: which ventures pull from
// which sketches, which builds address which problems.
//
// Layout is a simple two-column bipartite: kinds on the left side
// (ventures, builds, sketches, …) with edges flowing right. We
// deliberately do NOT use a force-directed layout — at this scale
// (≤ 100 nodes typical) explicit columns read faster than a hairball.

export default function ConnectionGraphPage() {
  const [rows, setRows] = useState<ConnectionRow[]>([]);
  const [loading, setLoading] = useState(true);

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

  // Group nodes by kind. Each (kind, id) pair is one node.
  const { nodes, edges, byKind } = useMemo(() => {
    const nodeMap = new Map<string, { kind: ConnectionKind; id: string }>();
    for (const r of rows) {
      nodeMap.set(`${r.from_kind}:${r.from_id}`, { kind: r.from_kind as ConnectionKind, id: r.from_id });
      nodeMap.set(`${r.to_kind}:${r.to_id}`, { kind: r.to_kind as ConnectionKind, id: r.to_id });
    }
    const nodes = Array.from(nodeMap.values());
    const byKind = new Map<ConnectionKind, typeof nodes>();
    for (const n of nodes) {
      const arr = byKind.get(n.kind) ?? [];
      arr.push(n);
      byKind.set(n.kind, arr);
    }
    return { nodes, edges: rows, byKind };
  }, [rows]);

  return (
    <div className="max-w-7xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <Link href="/studio" className="text-sm text-muted hover:text-foreground inline-flex items-center gap-1.5 mb-6">
        <ArrowLeft className="size-3.5" /> Dashboard
      </Link>

      <header className="mb-8">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-emerald mb-2 flex items-center gap-1.5">
              <Network className="size-3.5" /> Connection graph
            </p>
            <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight">Your web of work.</h1>
            <p className="mt-3 text-muted max-w-2xl">
              Every link you&apos;ve drawn across Sankofa — sketches into ventures, builds into problems, letters into venture pitches. Sage uses this graph as context on every AI call.
            </p>
          </div>
          <Link href="/studio/connections/insights" className="text-xs text-emerald hover:text-amber inline-flex items-center gap-1.5 shrink-0">
            <Network className="size-3" /> Insights →
          </Link>
        </div>
      </header>

      {loading ? (
        <div className="text-sm text-muted italic inline-flex items-center gap-2"><Loader2 className="size-3.5 animate-spin" /> Loading your graph…</div>
      ) : nodes.length === 0 ? (
        <Card className="p-8 text-center">
          <Link2 className="size-8 text-muted mx-auto mb-3" />
          <p className="text-sm text-muted leading-relaxed max-w-md mx-auto">
            No connections yet. Open any venture, build, sketch, or letter and hit <strong className="text-foreground">Connect</strong> on the panel — links show up here and inside Sage&apos;s memory.
          </p>
        </Card>
      ) : (
        <>
          <div className="text-xs text-muted mb-4">{nodes.length} nodes · {edges.length} edges across {byKind.size} kinds</div>
          <BipartiteGraph nodes={nodes} edges={edges} byKind={byKind} />

          {/* Edge list — accessible fallback + the actual readable surface */}
          <div className="mt-10">
            <h2 className="text-xs uppercase tracking-widest text-emerald mb-3">All edges</h2>
            <Card className="p-3 overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-[10px] uppercase tracking-widest text-muted">
                  <tr>
                    <th className="text-left py-1.5 px-2">From</th>
                    <th className="text-left py-1.5 px-2">→</th>
                    <th className="text-left py-1.5 px-2">To</th>
                    <th className="text-left py-1.5 px-2">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {edges.map((e) => (
                    <tr key={e.id} className="border-t border-border hover:bg-surface-2/40">
                      <td className="py-1.5 px-2">
                        <EdgeEnd kind={e.from_kind as ConnectionKind} id={e.from_id} />
                      </td>
                      <td className="py-1.5 px-2 text-emerald italic">{e.label || "→"}</td>
                      <td className="py-1.5 px-2">
                        <EdgeEnd kind={e.to_kind as ConnectionKind} id={e.to_id} />
                      </td>
                      <td className="py-1.5 px-2 text-muted text-[10px]">{new Date(e.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function EdgeEnd({ kind, id }: { kind: ConnectionKind; id: string }) {
  const href = hrefForEntity(kind, id);
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-[10px] uppercase tracking-widest text-muted">{KIND_LABEL[kind]}</span>
      {href ? (
        <Link href={href} className="font-mono text-emerald hover:text-amber">{id.slice(0, 16)}{id.length > 16 ? "…" : ""}</Link>
      ) : (
        <span className="font-mono text-muted">{id.slice(0, 16)}</span>
      )}
    </span>
  );
}

// ─── Bipartite-ish SVG renderer ─────────────────────────────────────────
function BipartiteGraph({
  nodes, edges, byKind,
}: {
  nodes: { kind: ConnectionKind; id: string }[];
  edges: ConnectionRow[];
  byKind: Map<ConnectionKind, { kind: ConnectionKind; id: string }[]>;
}) {
  // Lay each kind out as a column; nodes stacked vertically.
  const kinds = Array.from(byKind.keys());
  const colWidth = 220;
  const rowHeight = 32;
  const colCount = kinds.length;
  const maxRows = Math.max(...kinds.map((k) => byKind.get(k)!.length));
  const width = Math.max(640, colCount * colWidth);
  const height = Math.max(280, maxRows * rowHeight + 80);

  // Position lookup: nodeKey → { x, y }
  const pos = new Map<string, { x: number; y: number; label: string }>();
  kinds.forEach((kind, ci) => {
    const list = byKind.get(kind)!;
    const x = ci * colWidth + 80;
    list.forEach((n, ri) => {
      pos.set(`${n.kind}:${n.id}`, {
        x,
        y: 60 + ri * rowHeight,
        label: n.id.slice(0, 14) + (n.id.length > 14 ? "…" : ""),
      });
    });
  });

  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-surface-2/30 p-4">
      <svg width={width} height={height} className="block">
        {/* Column headers */}
        {kinds.map((k, i) => (
          <text key={k} x={i * colWidth + 80} y={28} className="fill-emerald" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.18em", fontFamily: "var(--font-mono)" }}>
            {KIND_LABEL[k]} ({byKind.get(k)!.length})
          </text>
        ))}

        {/* Edges as bezier curves so crossings are readable */}
        {edges.map((e) => {
          const from = pos.get(`${e.from_kind}:${e.from_id}`);
          const to = pos.get(`${e.to_kind}:${e.to_id}`);
          if (!from || !to) return null;
          const dx = (to.x - from.x) / 2;
          const path = `M ${from.x + 130} ${from.y} C ${from.x + 130 + dx} ${from.y}, ${to.x - dx} ${to.y}, ${to.x} ${to.y}`;
          return <path key={e.id} d={path} stroke="#2cc295" strokeOpacity="0.35" strokeWidth={1} fill="none" />;
        })}

        {/* Node chips */}
        {Array.from(pos.entries()).map(([key, p]) => (
          <g key={key} transform={`translate(${p.x}, ${p.y - 10})`}>
            <rect x={0} y={0} width={140} height={20} rx={10} className="fill-surface stroke-border" strokeWidth={1} />
            <text x={8} y={14} className="fill-foreground" style={{ fontSize: 10, fontFamily: "var(--font-mono)" }}>{p.label}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}
