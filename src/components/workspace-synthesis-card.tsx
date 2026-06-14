"use client";

import { useState } from "react";
import { workspaceApi } from "@/lib/workspace-api";
import { buildSiteContextSnapshotAsync } from "@/lib/site-brain-snapshot";
import { Markdown } from "@/components/markdown";
import { Card, Button } from "@/components/ui";
import { Brain, Sparkles, Loader2, Share2, RefreshCcw } from "lucide-react";

// One-click "state of the workspace" — Sage reads the discussion,
// notes, and deadlines and writes an actionable brief. Optionally posts
// it into the discussion so the whole team gets the same read.

export function WorkspaceSynthesisCard({ workspaceId, accent }: { workspaceId: string; accent: string }) {
  const [brief, setBrief] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [shared, setShared] = useState(false);

  async function run(postToDiscussion: boolean) {
    if (postToDiscussion) setSharing(true); else setBusy(true);
    setErr(null);
    const siteContext = await buildSiteContextSnapshotAsync("workspace-synth");
    const r = await workspaceApi.synthesize(workspaceId, postToDiscussion, siteContext);
    setBusy(false); setSharing(false);
    if (!r.ok) { setErr(r.error); return; }
    setBrief(r.brief);
    if (postToDiscussion) { setShared(true); setTimeout(() => setShared(false), 2500); }
  }

  return (
    <Card className="p-6 relative overflow-hidden">
      <div className="absolute -top-16 -right-16 size-40 rounded-full blur-3xl opacity-15" style={{ background: accent }} />
      <div className="relative">
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold flex items-center gap-2">
            <Brain className="size-5 text-emerald" /> Sage&apos;s read
          </h2>
          {brief ? (
            <div className="flex items-center gap-2">
              <button onClick={() => run(false)} disabled={busy} className="text-xs text-muted hover:text-foreground flex items-center gap-1 transition">
                <RefreshCcw className={`size-3 ${busy ? "animate-spin" : ""}`} /> Re-synthesize
              </button>
              <Button size="sm" variant="secondary" onClick={() => run(true)} disabled={sharing}>
                {sharing ? <Loader2 className="size-3.5 animate-spin" /> : <Share2 className="size-3.5" />}
                {shared ? "Shared!" : "Share to discussion"}
              </Button>
            </div>
          ) : null}
        </div>

        {brief ? (
          <div className="prose-chat text-sm leading-relaxed">
            <Markdown src={brief} />
          </div>
        ) : (
          <div className="text-center py-6">
            <p className="text-sm text-muted max-w-md mx-auto mb-4">
              Let Sage read the whole workspace — the discussion, the shared notes, and the open deadlines — and write you a status brief: where you stand, what&apos;s at risk, and the three next moves.
            </p>
            <Button onClick={() => run(false)} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              Synthesize the workspace
            </Button>
          </div>
        )}
        {err && <p className="mt-3 text-xs text-rust">Couldn&apos;t synthesize: {err}</p>}
      </div>
    </Card>
  );
}
