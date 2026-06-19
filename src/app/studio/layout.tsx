"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Brain, Compass, FlaskConical, Rocket, Globe2, LayoutDashboard, ArrowLeft,
  Users, Wallet, Award, BookMarked, Building2, Settings, Menu,
  TrendingUp, Folder, MessageSquare, Map, Lightbulb, Bot, Trophy, Network,
  FileText, Notebook, Target, Paintbrush, Briefcase, Search, GraduationCap,
  User, Timer, Zap, Dna, Mail, Hammer, Workflow, Contact, IdCard, Inbox, Sparkles,
} from "lucide-react";
import { useStore } from "@/store";
import { useInboxUnread } from "@/lib/use-inbox-unread";
import { cn } from "@/lib/utils";
import { CommandPalette } from "@/components/command-palette";
import { Companion } from "@/components/companion";
import { WelcomeCeremony } from "@/components/welcome-ceremony";
import { AiUsageBadge } from "@/components/ai-usage-badge";
import { AiUsageWatcher } from "@/components/ai-usage-watcher";
import { LangSwitcher } from "@/components/lang-switcher";
import { SyncProvider } from "@/components/sync-provider";
import { SyncStatus } from "@/components/sync-status";
import { OnboardingTour } from "@/components/onboarding-tour";
import { ServiceWorker } from "@/components/service-worker";
import { HelpOverlay } from "@/components/help-overlay";
import { SearchIndexer } from "@/components/search-indexer";
import { ErrorReporter } from "@/components/error-reporter";
import { PersonalTheme } from "@/components/personal-theme";
import { NotificationsBell } from "@/components/notifications-bell";
import { UserMenu } from "@/components/user-menu";
import { useT } from "@/lib/i18n";

type NavItem = { href: string; label: string; icon: typeof Brain; group?: string };

const NAV: NavItem[] = [
  { href: "/studio", label: "Dashboard", icon: LayoutDashboard, group: "Workspace" },
  { href: "/studio/ship", label: "Ship Hour", icon: Zap, group: "Workspace" },
  { href: "/studio/me", label: "Me", icon: User, group: "Workspace" },
  { href: "/studio/genome", label: "Studio Genome", icon: Dna, group: "Workspace" },
  { href: "/studio/path", label: "Your Path", icon: GraduationCap, group: "Workspace" },
  { href: "/studio/focus", label: "Focus mode", icon: Timer, group: "Workspace" },
  { href: "/studio/sage", label: "Sit with Sage", icon: Brain, group: "Workspace" },
  { href: "/studio/letters", label: "Letters from Sage", icon: Mail, group: "Workspace" },
  { href: "/studio/tutor", label: "Quick chat", icon: MessageSquare, group: "Workspace" },
  { href: "/studio/coaches", label: "AI Coaches", icon: MessageSquare, group: "Workspace" },
  { href: "/studio/agents", label: "AI Agents", icon: Bot, group: "Workspace" },
  { href: "/studio/agent-runs", label: "Sage runs", icon: Sparkles, group: "Workspace" },

  { href: "/studio/learn", label: "Learning Tracks", icon: Compass, group: "Learn" },
  { href: "/studio/lab", label: "Practice Lab", icon: FlaskConical, group: "Learn" },
  { href: "/studio/srs", label: "Daily Review", icon: BookMarked, group: "Learn" },
  { href: "/studio/ship-it", label: "Ship-it Lessons", icon: Rocket, group: "Learn" },

  { href: "/studio/flows", label: "Flow Studio", icon: Workflow, group: "Build" },
  { href: "/studio/build", label: "AI Build Studio", icon: Hammer, group: "Build" },

  { href: "/studio/venture", label: "Ventures", icon: Rocket, group: "Build" },
  { href: "/studio/conglomerate", label: "Conglomerate", icon: Network, group: "Build" },
  { href: "/studio/arena", label: "Pitch Arena", icon: Trophy, group: "Build" },
  { href: "/studio/atlas", label: "Atlas", icon: Map, group: "Build" },
  { href: "/studio/problems", label: "Problem Hub", icon: Globe2, group: "Build" },

  { href: "/search", label: "Search everything", icon: Search, group: "Network" },
  { href: "/people", label: "People directory", icon: Contact, group: "Network" },
  { href: "/studio/mentors", label: "Mentors", icon: Users, group: "Network" },
  { href: "/studio/funding", label: "Funding", icon: Wallet, group: "Network" },
  { href: "/studio/workspaces", label: "Workspaces", icon: Users, group: "Network" },
  { href: "/studio/community", label: "Community", icon: Users, group: "Network" },
  { href: "/studio/investor", label: "Investor Portal", icon: Briefcase, group: "Network" },

  { href: "/studio/brainstorm", label: "Sketch (classic)", icon: Lightbulb, group: "Tools" },
  { href: "/studio/documents", label: "Document Studio", icon: FileText, group: "Tools" },
  { href: "/studio/brand", label: "Brand Studio", icon: Paintbrush, group: "Tools" },
  { href: "/studio/okrs", label: "OKRs", icon: Target, group: "Tools" },
  { href: "/studio/notebook", label: "Notebook", icon: Notebook, group: "Tools" },

  { href: "/studio/profile", label: "My Profile", icon: IdCard, group: "You" },
  { href: "/studio/inbox", label: "Inbox", icon: Inbox, group: "You" },
  { href: "/studio/portfolio", label: "Portfolio", icon: Folder, group: "You" },
  { href: "/studio/credentials", label: "Credentials", icon: Award, group: "You" },
  { href: "/studio/connections", label: "Connections", icon: Network, group: "You" },
  { href: "/studio/analytics", label: "Analytics", icon: TrendingUp, group: "You" },
  { href: "/studio/settings", label: "Settings", icon: Settings, group: "You" },

  { href: "/institution", label: "Institution View", icon: Building2, group: "Admin" },
  { href: "/institution/cohorts", label: "Cohort Manager", icon: Users, group: "Admin" },
];

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { user, hydrated, streak } = useStore();
  const t = useT();
  // Live unread badge for the Inbox nav item. Keyed on pathname so it
  // refreshes as the user moves around (and clears after /studio/inbox
  // marks everything read).
  const inboxUnread = useInboxUnread(pathname ?? undefined);

  // Mount-once gate to avoid SSR/CSR hydration mismatches caused by
  // zustand-persist reading localStorage synchronously on the client.
  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (mounted && hydrated && !user && pathname !== "/studio/onboarding") {
      router.replace("/studio/onboarding");
    }
  }, [mounted, hydrated, user, pathname, router]);

  useEffect(() => { setMobileOpen(false); }, [pathname]);

  // Skip the studio shell on onboarding (let it own the whole viewport)
  if (pathname === "/studio/onboarding") {
    return <>{children}</>;
  }

  // Render a stable skeleton until the client has mounted AND the persisted
  // store has rehydrated. This makes SSR HTML match first client render.
  if (!mounted || !hydrated) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="size-12 rounded-full bg-emerald/20 mx-auto mb-3 animate-pulse" />
          <div className="text-xs uppercase tracking-[0.25em] text-muted">Loading your studio…</div>
        </div>
      </div>
    );
  }

  const groups = Array.from(new Set(NAV.map((n) => n.group)));

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
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-4">
          {groups.map((g) => (
            <div key={g}>
              <div className="px-3 text-[10px] uppercase tracking-widest text-muted/70 mb-1">{g}</div>
              <div className="space-y-0.5">
                {NAV.filter((n) => n.group === g).map((n) => {
                  const active = pathname === n.href || (n.href !== "/studio" && n.href !== "/institution" && pathname?.startsWith(n.href));
                  return (
                    <Link
                      key={n.href}
                      href={n.href}
                      className={cn(
                        "flex items-center gap-3 px-3 py-1.5 rounded-lg text-sm transition group relative",
                        active ? "bg-emerald/10 text-foreground border border-emerald/20" : "text-muted hover:text-foreground hover:bg-surface-2 border border-transparent",
                      )}
                    >
                      <n.icon className={cn("size-4 transition", active ? "text-emerald" : "group-hover:text-emerald")} />
                      <span>{n.label}</span>
                      {n.href === "/studio/inbox" && inboxUnread > 0 && (
                        <span className="ml-auto inline-flex items-center justify-center text-[10px] font-bold rounded-full bg-rust text-white min-w-[18px] h-[18px] px-1" aria-label={`${inboxUnread} unread`}>
                          {inboxUnread > 99 ? "99+" : inboxUnread}
                        </span>
                      )}
                      {active && n.href !== "/studio/inbox" && <span className="absolute right-3 size-1.5 rounded-full bg-emerald" />}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        <div className="px-4 py-3 border-t border-border shrink-0">
          <UserMenu />
        </div>
      </>
    );
  }

  return (
    <div className="flex-1 flex">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[300] focus:bg-emerald focus:text-black focus:px-4 focus:py-2 focus:rounded-full focus:font-medium focus:shadow-lg">
        Skip to content
      </a>
      <PersonalTheme />
      <CommandPalette />
      <Companion />
      <WelcomeCeremony />
      <AiUsageWatcher />
      <SyncProvider />
      <OnboardingTour />
      <ServiceWorker />
      <HelpOverlay />
      <SearchIndexer />
      <ErrorReporter />

      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-60 border-r border-border bg-surface/40 sticky top-0 h-screen">
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

      <main id="main" className="flex-1 min-w-0 flex flex-col">
        <div className="glass sticky top-0 z-20 flex items-center justify-between px-4 sm:px-6 h-14 border-b border-border">
          <div className="flex items-center gap-3">
            <button onClick={() => setMobileOpen(true)} className="md:hidden size-8 flex items-center justify-center -ml-2">
              <Menu className="size-5" />
            </button>
            <Link href="/" className="md:hidden flex items-center gap-2">
              <Logo />
            </Link>
          </div>
          <button
            onClick={() => {
              const e = new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true });
              document.dispatchEvent(e);
            }}
            className="hidden md:flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-surface-2 border border-border hover:border-emerald/40 text-sm text-muted transition w-72"
          >
            <Search className="size-3.5" />
            <span className="flex-1 text-left">{t("search.placeholder", "Search, jump, run anything…")}</span>
            <kbd className="text-[10px] uppercase tracking-widest text-muted px-1.5 py-0.5 border border-border rounded">⌘K</kbd>
          </button>
          <div className="flex items-center gap-2">
            <SyncStatus />
            <LangSwitcher />
            <AiUsageBadge />
            <div className="hidden sm:flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-surface-2 border border-border">
              <span className="size-1.5 rounded-full bg-emerald pulse-dot" /> Live
            </div>
            <button
              onClick={() => {
                const ev = new KeyboardEvent("keydown", { key: "?", bubbles: true });
                document.dispatchEvent(ev);
              }}
              title="Help & shortcuts (?)"
              aria-label="Open help and keyboard shortcuts"
              className="hidden sm:flex size-9 rounded-xl border border-border bg-surface hover:bg-surface-2 transition items-center justify-center text-xs font-semibold text-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-emerald focus:ring-offset-2 focus:ring-offset-surface"
            >
              ?
            </button>
            <NotificationsBell />
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
