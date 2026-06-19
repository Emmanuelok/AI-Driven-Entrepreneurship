"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Bell, Hand, MessageCircle, GitFork, Sparkles, Check, Trash2, Mail, MailCheck, Users, BadgeCheck, Bot, AtSign } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase";
import { useStore } from "@/store";
import { formatDistanceToNow } from "date-fns";

// Kinds the bell knows how to icon. The server's NotificationKind
// union (lib/notifications-server.ts) is the source of truth — keep
// these in sync when adding a new event type. Unknown kinds fall
// back to Bell.
type NotifKind =
  | "clap" | "comment" | "fork" | "system"
  | "contact_request" | "contact_response" | "workspace_invite"
  | "verification" | "agent_complete" | "mention";

type CloudNotif = {
  id: string;
  kind: NotifKind;
  actor_name: string | null;
  target_kind: string | null;
  target_slug: string | null;
  title: string;
  body: string | null;
  url: string | null;
  read: boolean;
  created_at: string;
};

type Merged = {
  id: string;
  kind: NotifKind | "local";
  title: string;
  body?: string;
  url?: string;
  read: boolean;
  ts: number;
  source: "cloud" | "local";
  localId?: string;
};

const KIND_ICON: Record<string, typeof Bell> = {
  clap: Hand,
  comment: MessageCircle,
  fork: GitFork,
  system: Sparkles,
  contact_request: Mail,
  contact_response: MailCheck,
  workspace_invite: Users,
  verification: BadgeCheck,
  agent_complete: Bot,
  mention: AtSign,
  local: Bell,
};

// Topbar notifications bell. Merges:
//   - Cloud notifications (forks, claps, comments on the user's published
//     work) from public.notifications
//   - Local zustand notifications (sync errors, lesson reminders,
//     in-product events)
// Cloud takes precedence; local stays as a fallback when offline.

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [cloud, setCloud] = useState<CloudNotif[]>([]);
  const [cloudUnread, setCloudUnread] = useState(0);
  const { notifications: local, markAllRead: markAllLocalRead } = useStore();
  const localUnread = local.filter((n) => !n.read).length;

  const refresh = useCallback(async () => {
    try {
      const sb = supabaseBrowser();
      if (!sb) return;
      const { data: { session } } = await sb.auth.getSession();
      if (!session) return;
      const res = await fetch("/api/notifications", { headers: { Authorization: `Bearer ${session.access_token}` } });
      const data = await res.json();
      if (data.ok) {
        setCloud(data.results || []);
        setCloudUnread(data.unread || 0);
      }
    } catch { /* silent — bell still works in local-only mode */ }
  }, []);

  useEffect(() => {
    refresh();
    // Refresh every 60s while the page is open so background fork/clap
    // events surface without a manual reload.
    const id = setInterval(refresh, 60_000);
    return () => clearInterval(id);
  }, [refresh]);

  const merged: Merged[] = [
    ...cloud.map((c) => ({
      id: `c-${c.id}`,
      kind: c.kind,
      title: c.title,
      body: c.body ?? undefined,
      url: c.url ?? undefined,
      read: c.read,
      ts: new Date(c.created_at).getTime(),
      source: "cloud" as const,
    })),
    ...local.map((l) => ({
      id: `l-${l.id}`,
      kind: "local" as const,
      title: l.title,
      body: l.body,
      url: l.href,
      read: l.read,
      ts: l.ts,
      source: "local" as const,
      localId: l.id,
    })),
  ].sort((a, b) => b.ts - a.ts).slice(0, 40);

  const unread = cloudUnread + localUnread;

  async function markAllRead() {
    markAllLocalRead();
    try {
      const sb = supabaseBrowser();
      if (!sb) return;
      const { data: { session } } = await sb.auth.getSession();
      if (!session) return;
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ allRead: true }),
      });
      setCloud(cloud.map((c) => ({ ...c, read: true })));
      setCloudUnread(0);
    } catch { /* silent */ }
  }

  async function removeOne(id: string) {
    if (id.startsWith("c-")) {
      const cloudId = id.slice(2);
      try {
        const sb = supabaseBrowser();
        if (!sb) return;
        const { data: { session } } = await sb.auth.getSession();
        if (!session) return;
        await fetch(`/api/notifications?id=${encodeURIComponent(cloudId)}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        setCloud(cloud.filter((c) => c.id !== cloudId));
      } catch { /* silent */ }
    }
    // (Local notifications stay in zustand; they expire naturally.)
  }

  return (
    <div className="relative">
      <button
        onClick={() => { setOpen(!open); if (!open && unread > 0) markAllRead(); }}
        aria-label={`Notifications${unread > 0 ? ` — ${unread} unread` : ""}`}
        aria-expanded={open}
        className="relative size-9 rounded-xl border border-border bg-surface hover:bg-surface-2 transition flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
      >
        <Bell className="size-4" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 text-[10px] bg-rust text-white rounded-full flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-12 w-96 max-w-[calc(100vw-2rem)] glass rounded-xl overflow-hidden z-30 shadow-2xl border border-border">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <div className="text-xs uppercase tracking-widest text-muted">Notifications</div>
            <div className="flex items-center gap-3 text-[10px] uppercase tracking-widest">
              {merged.some((m) => !m.read) && (
                <button onClick={markAllRead} className="text-muted hover:text-emerald transition inline-flex items-center gap-1">
                  <Check className="size-2.5" /> Mark all read
                </button>
              )}
            </div>
          </div>
          <div className="max-h-[28rem] overflow-y-auto divide-y divide-border">
            {merged.length === 0 ? (
              <div className="px-4 py-8 text-sm text-muted text-center">All caught up.</div>
            ) : merged.map((n) => {
              const Icon = KIND_ICON[n.kind] ?? Bell;
              const inner = (
                <div className="px-4 py-3 flex items-start gap-3 hover:bg-surface-2/50 transition group">
                  <Icon className={`size-4 shrink-0 mt-0.5 ${n.read ? "text-muted" : "text-emerald"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm leading-snug">{n.title}</div>
                    {n.body && <p className="text-xs text-muted mt-0.5 line-clamp-2">{n.body}</p>}
                    <div className="text-[10px] text-muted mt-1">{formatDistanceToNow(n.ts, { addSuffix: true })} · {n.source}</div>
                  </div>
                  {n.source === "cloud" && (
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeOne(n.id); }}
                      className="opacity-0 group-hover:opacity-100 transition text-muted hover:text-rust"
                      aria-label="Remove this notification"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  )}
                </div>
              );
              return n.url ? (
                <Link key={n.id} href={n.url} onClick={() => setOpen(false)} className="block">{inner}</Link>
              ) : (
                <div key={n.id}>{inner}</div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
