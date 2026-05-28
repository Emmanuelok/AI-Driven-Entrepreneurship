"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStore } from "@/store";
import { supabaseBrowser } from "@/lib/supabase";
import { Settings, LogOut, Cloud, CloudOff, ChevronUp, Trophy, Shield } from "lucide-react";

// Avatar pill in the sidebar footer. Click to open a menu with profile
// info, sign-out, settings, and a status line about whether the
// account is signed in to cloud sync.

export function UserMenu() {
  const router = useRouter();
  const { user, streak, signOut: signOutLocal } = useStore();
  const [open, setOpen] = useState(false);
  const [signedInCloud, setSignedInCloud] = useState<boolean | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Check Supabase session once on mount.
  useEffect(() => {
    (async () => {
      try {
        const sb = supabaseBrowser();
        if (!sb) { setSignedInCloud(false); return; }
        const { data: { session } } = await sb.auth.getSession();
        setSignedInCloud(!!session);
      } catch {
        setSignedInCloud(false);
      }
    })();
  }, []);

  if (!user) return null;

  async function handleSignOut() {
    // Sign out of Supabase first (if configured), then clear the local
    // session. Local state stays — the user can sign back in later and
    // their localStorage will sync up.
    if (!confirm("Sign out of this device? Your local work stays — you can sign back in anytime.")) return;
    try {
      const sb = supabaseBrowser();
      if (sb) {
        const { data: { session } } = await sb.auth.getSession();
        if (session) {
          await fetch("/api/auth/signout", {
            method: "POST",
            headers: { Authorization: `Bearer ${session.access_token}` },
          }).catch(() => undefined);
          await sb.auth.signOut();
        }
      }
    } catch { /* swallow */ }
    signOutLocal();
    router.push("/");
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label="Open user menu"
        className="w-full flex items-center gap-3 hover:bg-surface-2 -m-1 p-1 rounded-xl transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald"
      >
        <div className="size-8 rounded-full bg-gradient-to-br from-amber to-rust flex items-center justify-center text-black font-semibold text-xs shrink-0">
          {user.name?.[0] ?? "?"}
        </div>
        <div className="leading-tight flex-1 min-w-0 text-left">
          <div className="text-xs font-medium truncate">{user.name}</div>
          <div className="text-[10px] text-muted truncate">🔥 {streak}d streak</div>
        </div>
        <ChevronUp className={`size-3.5 text-muted shrink-0 transition ${open ? "" : "rotate-180"}`} />
      </button>

      {open && (
        <div className="absolute bottom-12 left-0 right-0 glass rounded-xl overflow-hidden z-30 shadow-2xl border border-border">
          <div className="px-4 py-3 border-b border-border">
            <div className="text-sm font-medium truncate">{user.name}</div>
            <div className="text-[10px] text-muted truncate">{user.email}</div>
            <div className="mt-2 text-[10px] uppercase tracking-widest flex items-center gap-1">
              {signedInCloud === true ? (
                <span className="text-emerald inline-flex items-center gap-1"><Cloud className="size-2.5" /> Synced</span>
              ) : signedInCloud === false ? (
                <span className="text-muted inline-flex items-center gap-1"><CloudOff className="size-2.5" /> Local-only</span>
              ) : (
                <span className="text-muted">…</span>
              )}
            </div>
          </div>
          <div className="py-1">
            <MenuLink href="/studio/settings" icon={Settings} onClick={() => setOpen(false)}>Settings</MenuLink>
            <MenuLink href="/leaderboard" icon={Trophy} onClick={() => setOpen(false)}>Leaderboard</MenuLink>
            <MenuLink href="/admin" icon={Shield} onClick={() => setOpen(false)}>Admin (operators only)</MenuLink>
          </div>
          <div className="border-t border-border py-1">
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-rust hover:bg-rust/10 transition"
            >
              <LogOut className="size-3.5" /> Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MenuLink({ href, icon: Icon, onClick, children }: { href: string; icon: typeof Settings; onClick: () => void; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-surface-2 transition"
    >
      <Icon className="size-3.5 text-muted" />
      <span>{children}</span>
    </Link>
  );
}
