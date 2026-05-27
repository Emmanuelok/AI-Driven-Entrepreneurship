import Link from "next/link";
import {
  Brain,
  Compass,
  FlaskConical,
  Rocket,
  Globe2,
  LayoutDashboard,
  ArrowLeft,
} from "lucide-react";

const NAV = [
  { href: "/studio", label: "Dashboard", icon: LayoutDashboard },
  { href: "/studio/tutor", label: "Sage Tutor", icon: Brain },
  { href: "/studio/learn", label: "Learning Tracks", icon: Compass },
  { href: "/studio/lab", label: "Practice Lab", icon: FlaskConical },
  { href: "/studio/venture", label: "Venture Studio", icon: Rocket },
  { href: "/studio/problems", label: "Problem Hub", icon: Globe2 },
];

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex-1 flex">
      <aside className="hidden md:flex flex-col w-64 border-r border-border bg-surface/40 sticky top-0 h-screen">
        <Link href="/" className="flex items-center gap-2.5 px-5 h-16 border-b border-border">
          <div className="size-8 rounded-lg bg-gradient-to-br from-emerald to-amber flex items-center justify-center text-black font-bold text-sm shadow-lg shadow-emerald/20">
            <span className="font-[family-name:var(--font-display)]">S</span>
          </div>
          <div className="leading-tight">
            <div className="text-[15px] font-semibold font-[family-name:var(--font-display)]">Sankofa Studio</div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted">Learner workspace</div>
          </div>
        </Link>
        <nav className="flex-1 px-3 py-5 space-y-1">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-muted hover:text-foreground hover:bg-surface-2 transition group"
            >
              <n.icon className="size-4 group-hover:text-emerald transition" />
              <span>{n.label}</span>
            </Link>
          ))}
        </nav>
        <div className="px-5 py-4 border-t border-border">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-full bg-gradient-to-br from-amber to-rust flex items-center justify-center text-black font-semibold text-sm">A</div>
            <div className="leading-tight">
              <div className="text-sm font-medium">Ama Mensah</div>
              <div className="text-xs text-muted">Year 2 · BSc Agric. Eng.</div>
            </div>
          </div>
          <Link
            href="/"
            className="mt-4 flex items-center gap-1.5 text-xs text-muted hover:text-foreground transition"
          >
            <ArrowLeft className="size-3" /> Back to landing
          </Link>
        </div>
      </aside>
      <main className="flex-1 min-w-0">
        <div className="md:hidden glass sticky top-0 z-20 flex items-center justify-between px-5 h-14">
          <Link href="/" className="flex items-center gap-2 text-sm">
            <ArrowLeft className="size-4" /> Sankofa
          </Link>
          <div className="text-xs uppercase tracking-widest text-muted">Studio</div>
        </div>
        {children}
      </main>
    </div>
  );
}
