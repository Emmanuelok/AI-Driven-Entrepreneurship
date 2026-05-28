"use client";

import { use } from "react";
import Link from "next/link";
import { usePathname, useRouter, notFound } from "next/navigation";
import { useStore } from "@/store";
import { Lightbulb, Users, Wrench, TrendingUp, Layout as LayoutIcon, FileText, Wallet, Brain, ArrowLeft, Target, FolderLock, Scale, Megaphone, Mic, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { VentureReadonlyBanner } from "@/components/venture-readonly-banner";

const TABS = [
  { slug: "", label: "Overview", icon: LayoutIcon },
  { slug: "ideate", label: "Ideate", icon: Lightbulb },
  { slug: "discover", label: "Discover", icon: Users },
  { slug: "mvp", label: "MVP", icon: Wrench },
  { slug: "pitch", label: "Pitch", icon: FileText },
  { slug: "rehearse", label: "Rehearse", icon: Mic },
  { slug: "fundraise", label: "Fundraise", icon: Wallet },
  { slug: "growth", label: "Growth", icon: TrendingUp },
  { slug: "hire", label: "Hire", icon: UserPlus },
  { slug: "okrs", label: "OKRs", icon: Target },
  { slug: "dataroom", label: "Data Room", icon: FolderLock },
  { slug: "legal", label: "Legal", icon: Scale },
  { slug: "launch", label: "Launch", icon: Megaphone },
  { slug: "coach", label: "Akili Coach", icon: Brain },
];

export default function VentureLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const pathname = usePathname();
  const { ventures } = useStore();
  const v = ventures.find((x) => x.id === id);
  if (!v) { notFound(); return null; }

  return (
    <div>
      <div className="border-b border-border bg-surface/30 sticky top-14 z-10">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 py-4">
          <Link href="/studio/venture" className="text-xs text-muted hover:text-foreground inline-flex items-center gap-1.5 mb-2">
            <ArrowLeft className="size-3" /> All ventures
          </Link>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold leading-tight">{v.name}</h1>
              <p className="text-sm text-muted">{v.tagline}</p>
            </div>
            <div className="flex items-center gap-1 overflow-x-auto pb-1">
              {TABS.map((t) => {
                const href = t.slug ? `/studio/venture/${id}/${t.slug}` : `/studio/venture/${id}`;
                const active = pathname === href || (t.slug && pathname?.endsWith(`/${t.slug}`));
                return (
                  <Link
                    key={t.slug}
                    href={href}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs whitespace-nowrap transition border",
                      active ? "bg-emerald/10 border-emerald/30 text-emerald" : "border-transparent text-muted hover:text-foreground",
                    )}
                  >
                    <t.icon className="size-3.5" />
                    {t.label}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      <VentureReadonlyBanner ventureId={id} />
      {children}
    </div>
  );
}
