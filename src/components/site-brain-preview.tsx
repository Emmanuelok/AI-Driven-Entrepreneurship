"use client";

import { useState } from "react";
import { Brain, ChevronDown } from "lucide-react";
import { buildSiteContextSnapshot } from "@/lib/site-brain-snapshot";
import { formatSiteContext } from "@/lib/site-brain";

// "What Sankofa knows about you" — a transparency panel for Settings.
// Shows the exact context block that gets prepended to every AI call.
// This is the user's right to inspect what's being shipped about them.

export function SiteBrainPreview() {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-6 pt-6 border-t border-border">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between text-xs uppercase tracking-widest text-emerald hover:text-amber transition"
      >
        <span className="flex items-center gap-1.5">
          <Brain className="size-3" /> What Sankofa knows about you
        </span>
        <ChevronDown className={`size-3 transition ${open ? "rotate-180" : ""}`} />
      </button>
      <p className="text-[10px] text-muted mt-2 leading-relaxed">
        Every AI call (Sage, coaches, daily brief, brainstorm, build studio, venture synth) starts with the context block below. It&apos;s built from your local stores — Sankofa never sends raw lessons, chat history, or personal notes you didn&apos;t already share.
      </p>

      {open && (
        <SnapshotBlock />
      )}
    </div>
  );
}

function SnapshotBlock() {
  // Build the snapshot lazily — only when the user expands the panel,
  // so we don't pay the (cheap) cost on every Settings render.
  const snapshot = buildSiteContextSnapshot("preview");
  const block = formatSiteContext(snapshot);

  if (!block) {
    return (
      <div className="mt-3 rounded-xl border border-border bg-surface-2/40 p-3 text-xs text-muted">
        No context yet — Sankofa will start sending more once you have a venture, an active genome, or completed lessons.
      </div>
    );
  }

  return (
    <pre className="mt-3 rounded-xl border border-border bg-[#06100d] p-3 text-[10px] font-[family-name:var(--font-mono)] overflow-x-auto whitespace-pre-wrap max-h-96 overflow-y-auto">{block}</pre>
  );
}
