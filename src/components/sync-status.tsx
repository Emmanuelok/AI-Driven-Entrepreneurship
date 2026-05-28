"use client";

import { useSync, pushNow } from "@/lib/sync";
import { Cloud, CloudOff, RefreshCw, Check, AlertCircle, User } from "lucide-react";
import { useState } from "react";
import Link from "next/link";

// Compact sync status pill for the topbar. Hidden in local-only mode
// (so it doesn't add visual noise for solo users). Click to force-push.

export function SyncStatus() {
  const { state, lastSyncedAt, error } = useSync();
  const [open, setOpen] = useState(false);

  if (state === "local-only") return null;

  const cfg = {
    idle: { Icon: Cloud, color: "border-border text-muted", label: "Connecting…" },
    syncing: { Icon: RefreshCw, color: "border-amber/40 text-amber bg-amber/5", label: "Syncing", animate: true },
    synced: { Icon: Check, color: "border-emerald/40 text-emerald bg-emerald/5", label: "Synced" },
    error: { Icon: AlertCircle, color: "border-rust/40 text-rust bg-rust/10", label: "Sync error" },
    "signed-out": { Icon: User, color: "border-border text-muted", label: "Sign in to sync" },
  }[state];

  const { Icon, color, label, animate } = cfg;
  const since = lastSyncedAt ? new Date(lastSyncedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`hidden md:flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition ${color}`}
        title={label}
      >
        <Icon className={`size-3 ${animate ? "animate-spin" : ""}`} />
        {label}
      </button>
      {open && (
        <div className="absolute right-0 top-10 w-72 glass rounded-xl overflow-hidden z-30 shadow-2xl">
          <div className="px-4 py-3 border-b border-border">
            <div className="text-xs uppercase tracking-widest text-muted">Cloud sync</div>
            <div className="mt-1 flex items-center gap-2">
              <Icon className={`size-3.5 ${animate ? "animate-spin" : ""}`} />
              <span className="text-sm font-medium">{label}</span>
            </div>
            {since && state === "synced" && (
              <div className="mt-1 text-[10px] text-muted">Last synced at {since}</div>
            )}
            {error && <div className="mt-1 text-[10px] text-rust">{error}</div>}
          </div>
          {state === "signed-out" ? (
            <Link href="/sign-in" onClick={() => setOpen(false)} className="block px-4 py-2.5 text-sm text-emerald hover:bg-surface-2 transition">
              Sign in to sync across devices →
            </Link>
          ) : (
            <button
              onClick={async () => { setOpen(false); await pushNow(); }}
              className="w-full text-left px-4 py-2.5 text-sm text-emerald hover:bg-surface-2 transition flex items-center gap-2"
            >
              <RefreshCw className="size-3.5" /> Push now
            </button>
          )}
          <div className="px-4 py-2 border-t border-border text-[10px] text-muted flex items-center gap-1.5">
            <CloudOff className="size-2.5" />
            Local-first — your work also lives in this browser
          </div>
        </div>
      )}
    </div>
  );
}
