"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Brain,
  Compass,
  FlaskConical,
  Rocket,
  Globe2,
  LayoutDashboard,
  ArrowLeft,
  Users,
  Wallet,
  Award,
  BookMarked,
  Building2,
  Settings,
  Bell,
  Menu,
  X,
  TrendingUp,
  Folder,
  MessageSquare,
} from "lucide-react";
import { useStore, level, xpInLevel, xpToNextLevel } from "@/store";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: typeof Brain; group?: string };

const NAV: NavItem[] = [
  { href: "/studio", label: "Dashboard", icon: LayoutDashboard, group: "Workspace" },
  { href: "/studio/tutor", label: "Sage Tutor", icon: Brain, group: "Workspace" },
  { href: "/studio/coaches", label: "AI Coaches", icon: MessageSquare, group: "Workspace" },

  { href: "/studio/learn", label: "Learning Tracks", icon: Compass, group: "Learn" },
  { href: "/studio/lab", label: "Practice Lab", icon: FlaskConical, group: "Learn" },
  { href: "/studio/srs", label: "Daily Review", icon: BookMarked, group: "Learn" },

  { href: "/studio/venture", label: "Ventures", icon: Rocket, group: "Build" },
  { href: "/studio/problems", label: "Problem Hub", icon: Globe2, group: "Build" },
  { href: "/studio/mentors", label: "Mentors", icon: Users, group: "Build" },
  { href: "/studio/funding", label: "Funding", icon: Wallet, group: "Build" },
  { href: "/studio/community", label: "Community", icon: Users, group: "Build" },

  { href: "/studio/portfolio", label: "Portfolio", icon: Folder, group: "You" },
  { href: "/studio/credentials", label: "Credentials", icon: Award, group: "You" },
  { href: "/studio/analytics", label: "Analytics", icon: TrendingUp, group: "You" },
  { href: "/studio/settings", label: "Settings", icon: Settings, group: "You" },

  { href: "/institution", label: "Institution View", icon: Building2, group: "Admin" },
];

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const { user, xp, streak, hydrated, notifications, markAllRead, signIn } = useStore();

  useEffect(() => {
    if (hydrated && !user && pathname !== "/studio/onboarding") {
      router.replace("/studio/onboarding");
    }
  }, [hydrated, user, pathname, router]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Skip the shell on the onboarding screen
  if (pathname === "/studio/onboarding") {
    return <>{children}</>;
  }

  if (!hydrated) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="size-12 rounded-full bg-emerald/20 animate-pulse" />
      </div>
    );
  }

  const groups = Array.from(new Set(NAV.map((n) => n.group)));
  const unread = notifications.filter((n) => !n.read).length;
  const lvl = level(xp);
  const inLvl = xpInLevel(xp);
  const toNext = xpToNextLevel();

  function Logo() {
    return (
      <div className="size-8 rounded-lg bg-gradient-to-br from-emerald to-amber flex items-center justify-center text-black font-bold text-sm shadow-lg shadow-emerald/20 shrink-0">
        <span className="font-[family-name:var(--font-display)]">S</span>
      </div>
    );
  }

  function Sidebar() {
    return (
      <>
        <Link href="/" className="flex items-center gap-2.5 px-5 h-16 border-b border-border shrink-0">
          <Logo />
          <div className="leading-tight">
            <div className="text-[15px] font-semibold font-[family-name:var(--font-display)]">Sankofa Studio</div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted">Learner workspace</div>
          </div>
        </Link>
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
          {groups.map((g) => (
            <div key={g}>
              <div className="px-3 text-[10px] uppercase tracking-widest text-muted/70 mb-1.5">{g}</div>
              <div className="space-y-0.5">
                {NAV.filter((n) => n.group === g).map((n) => {
                  const active = pathname === n.href || (n.href !== "/studio" && pathname?.startsWith(n.href));
                  return (
                    <Link
                      key={n.href}
                      href={n.href}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition group relative",
                        active
                          ? "bg-emerald/10 text-foreground border border-emerald/20"
                          : "text-muted hover:text-foreground hover:bg-surface-2 border border-transparent",
                      )}
                    >
                      <n.icon className={cn("size-4 transition", active ? "text-emerald" : "group-hover:text-emerald")} />
                      <span>{n.label}</span>
                      {active && <span className="absolute right-3 size-1.5 rounded-full bg-emerald" />}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        <div className="px-4 py-4 border-t border-border shrink-0">
          {user && (
            <Link href="/studio/settings" className="flex items-center gap-3 hover:bg-surface-2 -m-1 p-1 rounded-xl transition">
              <div className="size-9 rounded-full bg-gradient-to-br from-amber to-rust flex items-center justify-center text-black font-semibold text-sm">
                {user.name?.[0] ?? "?"}
              </div>
              <div className="leading-tight flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{user.name}</div>
                <div className="text-xs text-muted truncate">Lv {lvl} · {inLvl}/{toNext} XP</div>
              </div>
            </Link>
          )}
          <div className="mt-3 h-1.5 bg-surface-2 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald to-amber rounded-full"
              style={{ width: `${(inLvl / toNext) * 100}%` }}
            />
          </div>
          <div className="mt-3 flex items-center justify-between text-xs">
            <span className="text-muted">🔥 {streak} day streak</span>
            <button
              onClick={() => {
                useStore.getState().signOut();
                router.push("/studio/onboarding");
              }}
              className="text-muted hover:text-rust transition"
            >
              Sign out
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="flex-1 flex">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-64 border-r border-border bg-surface/40 sticky top-0 h-screen">
        <Sidebar />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-72 max-w-[80vw] bg-surface border-r border-border flex flex-col h-full">
            <Sidebar />
          </aside>
        </div>
      )}

      <main className="flex-1 min-w-0 flex flex-col">
        {/* Top bar */}
        <div className="glass sticky top-0 z-20 flex items-center justify-between px-4 sm:px-6 h-14 border-b border-border">
          <div className="flex items-center gap-3">
            <button onClick={() => setMobileOpen(true)} className="md:hidden size-8 flex items-center justify-center -ml-2">
              <Menu className="size-5" />
            </button>
            <Link href="/" className="md:hidden flex items-center gap-2">
              <Logo />
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-surface-2 border border-border">
              <span className="size-1.5 rounded-full bg-emerald pulse-dot" /> Live
            </div>
            <div className="relative">
              <button
                onClick={() => {
                  setNotifOpen(!notifOpen);
                  if (!notifOpen) markAllRead();
                }}
                className="relative size-9 rounded-xl border border-border bg-surface hover:bg-surface-2 transition flex items-center justify-center"
              >
                <Bell className="size-4" />
                {unread > 0 && (
                  <span className="absolute -top-1 -right-1 size-4 text-[10px] bg-rust text-white rounded-full flex items-center justify-center">
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </button>
              {notifOpen && (
                <div className="absolute right-0 top-12 w-80 glass rounded-xl overflow-hidden z-30">
                  <div className="px-4 py-3 border-b border-border text-xs uppercase tracking-widest text-muted">Notifications</div>
                  <div className="max-h-96 overflow-y-auto divide-y divide-border">
                    {notifications.length === 0 && (
                      <div className="px-4 py-6 text-sm text-muted text-center">All caught up.</div>
                    )}
                    {notifications.map((n) => (
                      <div key={n.id} className="px-4 py-3 text-sm hover:bg-surface-2 transition">
                        <div className="font-medium">{n.title}</div>
                        <div className="text-muted text-xs mt-0.5">{n.body}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <Link href="/" className="hidden sm:flex items-center gap-1 text-xs text-muted hover:text-foreground transition px-3 py-2 rounded-xl">
              <ArrowLeft className="size-3" /> Landing
            </Link>
          </div>
        </div>
        <div className="flex-1">{children}</div>
      </main>
    </div>
  );
}
