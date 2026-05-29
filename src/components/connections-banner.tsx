"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase";
import { Link2, ArrowRight } from "lucide-react";
import { KIND_LABEL, hrefForEntity, type ConnectionKind, type ConnectionRow } from "@/lib/connections";

// Top-of-page callout that summarizes what the user has already
// connected to THIS entity. Renders nothing when there are no edges
// (so it's safe to mount on every entity detail page without
// cluttering empty states).
//
// Counterpart to <ConnectionsPanel>: that one is the full read/write
// surface; this one is the "you already have work here" nudge.

export function ConnectionsBanner({
  kind,
  id,
  title,
}: {
  kind: ConnectionKind;
  id: string;
  title?: string;
}) {
  const [rows, setRows] = useState<ConnectionRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const sb = supabaseBrowser();
        if (!sb) { setLoading(false); return; }
        const { data: { session } } = await sb.auth.getSession();
        if (!session) { setLoading(false); return; }
        const res = await fetch(`/api/v2/connections?kind=${encodeURIComponent(kind)}&id=${encodeURIComponent(id)}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const data = await res.json();
        if (data.ok) {
          // Both directions are interesting: outgoing = things this
          // entity points to; incoming = things pointing here. We
          // surface them together as "things linked to" without
          // distinguishing direction — banner is for noticing, not
          // for editing.
          setRows([...(data.outgoing ?? []), ...(data.incoming ?? [])]);
        }
      } finally { setLoading(false); }
    })();
  }, [kind, id]);

  // Group "other side" entities by kind.
  const byKind = useMemo(() => {
    const m = new Map<ConnectionKind, { id: string; label: string | null }[]>();
    for (const r of rows) {
      const otherKind = (r.from_kind === kind && r.from_id === id) ? r.to_kind : r.from_kind;
      const otherId = (r.from_kind === kind && r.from_id === id) ? r.to_id : r.from_id;
      const arr = m.get(otherKind as ConnectionKind) ?? [];
      // De-dupe — a user could have two edges connecting the same pair
      // with different labels; the banner only needs one chip per
      // other-entity.
      if (!arr.some((x) => x.id === otherId)) {
        arr.push({ id: otherId, label: r.label });
      }
      m.set(otherKind as ConnectionKind, arr);
    }
    return m;
  }, [rows, kind, id]);

  if (loading || rows.length === 0) return null;

  const total = Array.from(byKind.values()).reduce((s, arr) => s + arr.length, 0);

  return (
    <div className="rounded-2xl border border-emerald/30 bg-emerald/5 p-4 sm:p-5 mb-6">
      <div className="flex items-start gap-3">
        <Link2 className="size-4 text-emerald shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="text-xs uppercase tracking-widest text-emerald mb-1.5">Your work on this {KIND_LABEL[kind].toLowerCase()}</div>
          <p className="text-sm text-foreground/95 leading-relaxed">
            You have <strong className="text-emerald">{total}</strong> connected {total === 1 ? "artifact" : "artifacts"}{title ? <> tied to <strong className="text-foreground">{title}</strong></> : null}.
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {Array.from(byKind.entries()).map(([otherKind, entries]) => (
              <KindChips key={otherKind} otherKind={otherKind} entries={entries} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function KindChips({ otherKind, entries }: { otherKind: ConnectionKind; entries: { id: string; label: string | null }[] }) {
  return (
    <>
      {entries.slice(0, 5).map((e) => {
        const href = hrefForEntity(otherKind, e.id);
        const inner = (
          <span className="text-[10px] uppercase tracking-widest px-2 py-1 rounded-full border border-border bg-surface hover:border-emerald/40 inline-flex items-center gap-1 transition">
            <span className="text-muted">{KIND_LABEL[otherKind]}</span>
            <span className="font-mono text-emerald">{e.id.slice(0, 12)}{e.id.length > 12 ? "…" : ""}</span>
            <ArrowRight className="size-2.5 text-muted" />
          </span>
        );
        return href ? <Link key={e.id} href={href}>{inner}</Link> : <span key={e.id}>{inner}</span>;
      })}
      {entries.length > 5 && (
        <span className="text-[10px] text-muted self-center">+{entries.length - 5} more</span>
      )}
    </>
  );
}
