"use client";

import { useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase";
import { Search, X } from "lucide-react";

type Hit = { kind: string; ref_id: string; ref_url: string | null; title: string | null; body: string; similarity: number };

// Drop-in "Find similar" trigger usable on any artifact card.
// Calls /api/search/query with the artifact's own body as the seed;
// shows a popover with the top matches. Silent no-op when local-only
// or signed out (search infrastructure is cloud-side).

export function SimilarButton({ seedTitle, seedBody, kind, excludeRefId }: { seedTitle: string; seedBody: string; kind?: string; excludeRefId?: string }) {
  const [open, setOpen] = useState(false);
  const [hits, setHits] = useState<Hit[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setOpen(true);
    if (hits.length > 0) return;
    setBusy(true);
    setError(null);
    try {
      const sb = supabaseBrowser();
      if (!sb) { setError("Cloud sync isn't configured."); return; }
      const { data: { session } } = await sb.auth.getSession();
      if (!session) { setError("Sign in to enable cross-artifact search."); return; }
      const res = await fetch("/api/search/query", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ q: `${seedTitle} — ${seedBody}`, kind, limit: 6 }),
      });
      const data = await res.json();
      if (data.ok) setHits((data.results || []).filter((r: Hit) => r.ref_id !== excludeRefId).slice(0, 5));
      else setError(data.error || "Search failed.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="relative">
      <button
        onClick={() => open ? setOpen(false) : load()}
        className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted hover:text-emerald transition"
        title="Find semantically similar work"
        aria-label="Find similar items"
      >
        <Search className="size-2.5" /> Similar
      </button>
      {open && (
        <div className="absolute right-0 top-6 w-80 glass rounded-xl overflow-hidden z-20 shadow-2xl border border-emerald/20">
          <div className="px-3 py-2 border-b border-border flex items-center justify-between">
            <div className="text-[10px] uppercase tracking-widest text-emerald">Similar to this</div>
            <button onClick={() => setOpen(false)} className="text-muted hover:text-foreground"><X className="size-3" /></button>
          </div>
          <div className="max-h-72 overflow-y-auto p-2">
            {busy && <div className="px-2 py-3 text-xs text-muted italic">Searching…</div>}
            {error && <div className="px-2 py-3 text-xs text-rust">{error}</div>}
            {!busy && !error && hits.length === 0 && (
              <div className="px-2 py-3 text-xs text-muted italic">No close matches yet. Log more work and try again.</div>
            )}
            <div className="space-y-1">
              {hits.map((h) => (
                <Link
                  key={h.ref_id}
                  href={h.ref_url ?? "#"}
                  onClick={() => setOpen(false)}
                  className="block px-2 py-2 rounded-lg hover:bg-surface-2 transition"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-medium truncate flex-1">{h.title}</div>
                    <span className="text-[10px] text-emerald font-mono shrink-0">{(h.similarity * 100).toFixed(0)}%</span>
                  </div>
                  <div className="text-[10px] text-muted truncate">{h.kind} · {h.body.slice(0, 80)}</div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </span>
  );
}
