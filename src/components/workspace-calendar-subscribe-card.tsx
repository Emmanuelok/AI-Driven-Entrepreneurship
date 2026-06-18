"use client";

import { useState } from "react";
import { workspaceApi } from "@/lib/workspace-api";
import { Card, Button } from "@/components/ui";
import { Rss, Copy, Check, RefreshCcw, Loader2 } from "lucide-react";

// Workspace-scoped calendar feed subscription card. Mirrors the
// cross-workspace one on the calendar page but emits a URL that only
// includes THIS workspace's deadlines + task due dates.
//
// Useful when a member belongs to many workspaces but only wants the
// urgent one (a class, a single team) in their personal calendar
// app — instead of all of them mingled into a single feed.

export function WorkspaceCalendarSubscribeCard({ workspaceId }: { workspaceId: string }) {
  const [open, setOpen] = useState(false);
  const [feedUrl, setFeedUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function reveal() {
    setBusy(true);
    const r = await workspaceApi.getWorkspaceCalendarToken(workspaceId);
    setBusy(false);
    if (r.ok) {
      setFeedUrl(`${window.location.origin}/api/calendar/workspace/${r.token}.ics`);
      setOpen(true);
    }
  }

  async function rotate() {
    if (!confirm("Rotate the feed URL? Any calendar app currently subscribed will stop updating until you re-add the new link.")) return;
    setBusy(true);
    const r = await workspaceApi.rotateWorkspaceCalendarToken(workspaceId);
    setBusy(false);
    if (r.ok) setFeedUrl(`${window.location.origin}/api/calendar/workspace/${r.token}.ics`);
  }

  function copy() {
    if (!feedUrl) return;
    navigator.clipboard.writeText(feedUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <Card className="p-5 sm:p-6">
      {!open ? (
        <button onClick={reveal} className="w-full flex items-center justify-between gap-3 text-left" disabled={busy}>
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-xl bg-amber/10 border border-amber/30 flex items-center justify-center shrink-0">
              {busy ? <Loader2 className="size-4 text-amber animate-spin" /> : <Rss className="size-4 text-amber" />}
            </div>
            <div>
              <h3 className="font-medium text-sm">Subscribe this workspace in your calendar app</h3>
              <p className="text-xs text-muted">Just this workspace&apos;s deadlines — no noise from your other projects.</p>
            </div>
          </div>
          <span className="text-xs text-emerald shrink-0">Show link</span>
        </button>
      ) : (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Rss className="size-4 text-amber" />
            <h3 className="font-medium text-sm">Feed for this workspace</h3>
          </div>
          <div className="flex items-center gap-1 mb-3">
            <input value={feedUrl ?? "—"} readOnly className="flex-1 bg-surface-2 border border-border rounded-lg px-3 py-2 text-xs outline-none truncate font-[family-name:var(--font-mono)]" />
            <button
              onClick={copy}
              className="px-3 py-2 rounded-lg border border-border hover:border-emerald/40 hover:bg-emerald/5 transition flex items-center gap-1.5 text-sm shrink-0"
            >
              {copied ? <><Check className="size-3.5 text-emerald" /> Copied</> : <><Copy className="size-3.5" /> Copy</>}
            </button>
          </div>
          <p className="text-xs text-muted leading-relaxed">
            In Google Calendar: <span className="text-foreground">Other calendars → From URL</span> → paste. In Apple Calendar: <span className="text-foreground">File → New Calendar Subscription</span> → paste. Removing you from the workspace silently empties the feed; rotating the link invalidates it immediately.
          </p>
          <div className="mt-4 flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={rotate} disabled={busy}>
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCcw className="size-3.5" />} Rotate link
            </Button>
            <span className="text-[10px] text-muted">Rotating invalidates the old URL everywhere.</span>
          </div>
        </div>
      )}
    </Card>
  );
}
