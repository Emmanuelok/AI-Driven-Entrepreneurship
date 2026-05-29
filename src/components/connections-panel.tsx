"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Link2, Plus, X, ArrowRight, ArrowLeft } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase";
import { useStore } from "@/store";
import { useBuild } from "@/store/build";
import { useSketch } from "@/store/sketch";
import { useLetters } from "@/store/letters";
import {
  CONNECTION_KINDS,
  KIND_LABEL,
  hrefForEntity,
  suggestedLabel,
  type ConnectionKind,
  type ConnectionRow,
} from "@/lib/connections";

// Universal "Connected to" panel. Mount on any entity detail page:
//
//   <ConnectionsPanel kind="venture" id={ventureId} title="Lentil Co." />
//
// Shows incoming + outgoing edges, lets the user add a new one via a
// picker that pulls candidate entities from the local stores
// (ventures, builds, sketches, letters) — plus a "paste id" fallback
// for problems / lessons / MCP slugs that live in static catalogs.
//
// Realtime: changes from other tabs show up because the connections
// table is in the supabase_realtime publication.

export function ConnectionsPanel({
  kind,
  id,
  title,
  compact = false,
}: {
  kind: ConnectionKind;
  id: string;
  title?: string;
  compact?: boolean;
}) {
  const [outgoing, setOutgoing] = useState<ConnectionRow[]>([]);
  const [incoming, setIncoming] = useState<ConnectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  const refresh = async () => {
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
        setOutgoing(data.outgoing ?? []);
        setIncoming(data.incoming ?? []);
      }
    } finally { setLoading(false); }
  };

  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [kind, id]);

  // Realtime: any insert/delete on connections where I'm involved → refetch.
  useEffect(() => {
    const sb = supabaseBrowser();
    if (!sb) return;
    const channel = sb.channel(`connections:${kind}:${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "connections" }, refresh)
      .subscribe();
    return () => { sb.removeChannel(channel); };
  /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [kind, id]);

  async function remove(connId: string) {
    const sb = supabaseBrowser();
    if (!sb) return;
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return;
    await fetch(`/api/v2/connections/${connId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    refresh();
  }

  const total = outgoing.length + incoming.length;

  return (
    <div className={compact ? "" : "rounded-2xl border border-border bg-surface-2/40 p-4"}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs uppercase tracking-widest text-emerald flex items-center gap-1.5">
          <Link2 className="size-3" /> Connected ({total})
        </h3>
        <button
          onClick={() => setAdding(true)}
          className="text-[10px] uppercase tracking-widest text-muted hover:text-emerald inline-flex items-center gap-1 transition"
        >
          <Plus className="size-2.5" /> Connect
        </button>
      </div>

      {loading ? (
        <div className="text-[10px] text-muted italic">Loading…</div>
      ) : total === 0 ? (
        <p className="text-[10px] text-muted leading-relaxed">
          Nothing connected yet. Use <strong className="text-foreground">Connect</strong> to link this {KIND_LABEL[kind].toLowerCase()} to a venture, build, sketch, letter, or cohort — Sankofa surfaces those relationships across the site.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {outgoing.map((c) => (
            <ConnectionRowView key={c.id} row={c} direction="out" onRemove={() => remove(c.id)} />
          ))}
          {incoming.map((c) => (
            <ConnectionRowView key={c.id} row={c} direction="in" onRemove={() => remove(c.id)} />
          ))}
        </ul>
      )}

      {adding && (
        <ConnectionPicker
          fromKind={kind}
          fromId={id}
          fromTitle={title}
          onClose={() => setAdding(false)}
          onDone={() => { setAdding(false); refresh(); }}
        />
      )}
    </div>
  );
}

function ConnectionRowView({ row, direction, onRemove }: { row: ConnectionRow; direction: "in" | "out"; onRemove: () => void }) {
  const otherKind = direction === "out" ? row.to_kind : row.from_kind;
  const otherId = direction === "out" ? row.to_id : row.from_id;
  const href = hrefForEntity(otherKind, otherId);
  const Arrow = direction === "out" ? ArrowRight : ArrowLeft;
  return (
    <li className="group flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-surface-2/60">
      <Arrow className="size-2.5 text-muted shrink-0" />
      <span className="text-[10px] uppercase tracking-widest text-muted shrink-0">{KIND_LABEL[otherKind]}</span>
      {row.label && <span className="text-[10px] text-emerald italic shrink-0">{row.label}</span>}
      {href ? (
        <Link href={href} className="text-xs text-foreground hover:text-emerald truncate transition">
          {otherId.slice(0, 32)}{otherId.length > 32 ? "…" : ""}
        </Link>
      ) : (
        <span className="text-xs text-muted truncate">{otherId.slice(0, 32)}</span>
      )}
      <button onClick={onRemove} className="ml-auto opacity-0 group-hover:opacity-100 transition text-muted hover:text-rust" aria-label="Remove connection">
        <X className="size-2.5" />
      </button>
    </li>
  );
}

// ─── Picker ─────────────────────────────────────────────────────────────
function ConnectionPicker({ fromKind, fromId, fromTitle, onClose, onDone }: { fromKind: ConnectionKind; fromId: string; fromTitle?: string; onClose: () => void; onDone: () => void }) {
  const ventures = useStore((s) => s.ventures);
  const builds = useBuild((s) => s.projects);
  const sketches = useSketch((s) => s.boards);
  const letters = useLetters((s) => s.letters);

  const [toKind, setToKind] = useState<ConnectionKind>(fromKind === "venture" ? "build" : "venture");
  const [toId, setToId] = useState<string>("");
  const [label, setLabel] = useState<string>(suggestedLabel(fromKind, toKind) ?? "");
  const [busy, setBusy] = useState(false);

  // Update default label as kind picker changes.
  function pickKind(k: ConnectionKind) {
    setToKind(k);
    setToId("");
    setLabel(suggestedLabel(fromKind, k) ?? "");
  }

  const candidates = useMemo<{ id: string; title: string }[]>(() => {
    switch (toKind) {
      case "venture": return ventures.map((v) => ({ id: v.id, title: v.name }));
      case "build": return builds.map((b) => ({ id: b.id, title: b.name }));
      case "sketch": return sketches.map((s) => ({ id: s.id, title: s.title || "untitled canvas" }));
      case "letter": return letters.map((l) => ({ id: l.id, title: l.title || "untitled letter" }));
      default: return []; // problem / lesson / cohort / mcp → paste-id fallback
    }
  }, [toKind, ventures, builds, sketches, letters]);

  async function save() {
    if (!toId.trim()) return;
    setBusy(true);
    try {
      const sb = supabaseBrowser();
      if (!sb) return;
      const { data: { session } } = await sb.auth.getSession();
      if (!session) return;
      await fetch("/api/v2/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ fromKind, fromId, toKind, toId, label: label || undefined }),
      });
      onDone();
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md bg-surface border border-border rounded-2xl p-5 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium flex items-center gap-2"><Link2 className="size-4 text-emerald" /> Connect</h3>
          <button onClick={onClose} className="text-muted hover:text-foreground" aria-label="Close"><X className="size-4" /></button>
        </div>
        <p className="text-xs text-muted leading-relaxed mb-4">
          Link <strong className="text-foreground">{KIND_LABEL[fromKind]}{fromTitle ? `: ${fromTitle}` : ""}</strong> to another artifact. The link shows up on both pages and feeds the Sankofa Brain so AI knows the relationship.
        </p>

        <div className="space-y-3">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted mb-1.5">Kind</div>
            <div className="flex gap-1 flex-wrap">
              {CONNECTION_KINDS.filter((k) => k !== fromKind || k !== fromKind).map((k) => (
                <button
                  key={k}
                  onClick={() => pickKind(k)}
                  className={`text-[10px] uppercase tracking-widest px-2.5 py-1 rounded-full border transition ${toKind === k ? "border-emerald bg-emerald/10 text-emerald" : "border-border text-muted hover:text-foreground"}`}
                >
                  {KIND_LABEL[k]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted mb-1.5">{KIND_LABEL[toKind]}</div>
            {candidates.length > 0 ? (
              <select
                value={toId}
                onChange={(e) => setToId(e.target.value)}
                className="w-full bg-surface-2 border border-border rounded-xl px-3 py-2 text-sm outline-none focus:border-emerald"
              >
                <option value="">— pick one —</option>
                {candidates.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            ) : (
              <input
                value={toId}
                onChange={(e) => setToId(e.target.value)}
                placeholder={toKind === "mcp" ? "build-slug for the MCP server" : toKind === "problem" ? "problem id (e.g. post-harvest-loss)" : `${toKind} id`}
                className="w-full bg-surface-2 border border-border rounded-xl px-3 py-2 text-sm outline-none focus:border-emerald font-mono text-xs"
              />
            )}
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted mb-1.5">Label (optional)</div>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={suggestedLabel(fromKind, toKind) ?? "uses / addresses / seeded from"}
              className="w-full bg-surface-2 border border-border rounded-xl px-3 py-2 text-sm outline-none focus:border-emerald"
              maxLength={80}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="text-xs text-muted hover:text-foreground px-3 py-1.5">Cancel</button>
            <button
              onClick={save}
              disabled={busy || !toId.trim()}
              className="text-xs bg-emerald text-black font-medium px-3 py-1.5 rounded-full disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy ? "Connecting…" : "Connect"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
