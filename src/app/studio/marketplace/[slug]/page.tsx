"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useBuild } from "@/store/build";
import { Card, Button, Badge } from "@/components/ui";
import { GitFork, Eye, ArrowLeft, ExternalLink, Smartphone, Monitor, Tablet } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { injectConsoleBridge } from "@/components/build-tools";
import { Claps, Comments } from "@/components/social";

type Build = {
  slug: string;
  title: string;
  description?: string;
  code: string;
  template_id?: string;
  tags: string[];
  forks: number;
  views: number;
  updated_at: string;
};

type Device = "phone" | "tablet" | "desktop";

export default function MarketplaceDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const router = useRouter();
  const { createProject } = useBuild();
  const [build, setBuild] = useState<Build | null>(null);
  const [busy, setBusy] = useState(true);
  const [forking, setForking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [device, setDevice] = useState<Device>("desktop");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/marketplace/build/${encodeURIComponent(slug)}`);
        const data = await res.json();
        if (data.ok) setBuild(data.build);
        else setError(data.error || "Couldn't load build.");
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    })();
  }, [slug]);

  async function fork() {
    if (!build) return;
    setForking(true);
    try {
      const res = await fetch("/api/marketplace/fork", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      const data = await res.json();
      if (!data.ok) { alert(data.error || "Couldn't fork."); return; }
      const pid = createProject(
        `${build.title} (fork)`,
        build.description || `Forked from /studio/marketplace/${slug}`,
        data.build.templateId || "blank-canvas",
        data.build.code,
      );
      router.push(`/studio/build/${pid}`);
    } finally {
      setForking(false);
    }
  }

  if (busy) return <div className="max-w-5xl mx-auto px-5 py-12 text-sm text-muted">Loading…</div>;
  if (error || !build) {
    return (
      <div className="max-w-5xl mx-auto px-5 py-12">
        <Link href="/studio/marketplace" className="text-sm text-muted hover:text-foreground inline-flex items-center gap-1.5 mb-4">
          <ArrowLeft className="size-3.5" /> Marketplace
        </Link>
        <p className="text-sm text-rust">{error || "Not found."}</p>
      </div>
    );
  }

  const deviceWidth = device === "phone" ? 390 : device === "tablet" ? 768 : "100%";
  const deviceHeight = device === "phone" ? 780 : device === "tablet" ? 900 : 700;

  return (
    <div className="max-w-7xl mx-auto px-5 sm:px-8 py-10 space-y-5">
      <Link href="/studio/marketplace" className="text-sm text-muted hover:text-foreground inline-flex items-center gap-1.5">
        <ArrowLeft className="size-3.5" /> Marketplace
      </Link>

      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            {build.template_id && <Badge color="muted">{build.template_id}</Badge>}
            {build.tags.map((t) => (
              <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-surface-2 border border-border text-muted">{t}</span>
            ))}
          </div>
          <h1 className="font-[family-name:var(--font-display)] text-3xl sm:text-4xl font-semibold leading-tight">{build.title}</h1>
          {build.description && <p className="mt-2 text-muted max-w-2xl">{build.description}</p>}
          <div className="mt-3 flex items-center gap-3 text-xs text-muted">
            <span className="flex items-center gap-1"><GitFork className="size-3" /> {build.forks} forks</span>
            <span className="flex items-center gap-1"><Eye className="size-3" /> {build.views} views</span>
            <span>Updated {formatDistanceToNow(new Date(build.updated_at), { addSuffix: true })}</span>
          </div>
        </div>
        <div className="flex gap-2 items-center">
          <Claps kind="build" slug={slug} />
          <Button onClick={fork} disabled={forking} size="lg">
            <GitFork className="size-4" /> {forking ? "Forking…" : "Fork to my studio"}
          </Button>
        </div>
      </header>

      <Card className="p-0 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 border-b border-border">
          <div className="text-xs text-muted">Live preview</div>
          <div className="flex items-center gap-1">
            <button onClick={() => setDevice("phone")} className={`size-7 rounded-md flex items-center justify-center transition ${device === "phone" ? "bg-emerald/15 text-emerald" : "text-muted hover:text-foreground"}`} aria-label="Phone width">
              <Smartphone className="size-3.5" />
            </button>
            <button onClick={() => setDevice("tablet")} className={`size-7 rounded-md flex items-center justify-center transition ${device === "tablet" ? "bg-emerald/15 text-emerald" : "text-muted hover:text-foreground"}`} aria-label="Tablet width">
              <Tablet className="size-3.5" />
            </button>
            <button onClick={() => setDevice("desktop")} className={`size-7 rounded-md flex items-center justify-center transition ${device === "desktop" ? "bg-emerald/15 text-emerald" : "text-muted hover:text-foreground"}`} aria-label="Desktop width">
              <Monitor className="size-3.5" />
            </button>
          </div>
        </div>
        <div className={`bg-black ${device === "desktop" ? "p-0" : "p-6 flex items-start justify-center"}`}>
          <div className="bg-white shadow-2xl overflow-hidden" style={{ width: deviceWidth, maxWidth: "100%", height: deviceHeight, borderRadius: device === "desktop" ? 0 : 8 }}>
            <iframe
              title="preview"
              srcDoc={injectConsoleBridge(build.code)}
              sandbox="allow-scripts allow-forms allow-modals allow-popups"
              className="w-full h-full border-0"
            />
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <Comments kind="build" slug={slug} />
      </Card>

      <Card className="p-5">
        <div className="text-xs text-muted">
          Forks are independent copies. After forking, the original author won&apos;t see your changes
          unless you publish them as a new build. Be a good neighbor: credit the original in your
          description if your fork is heavily derived.
        </div>
        <div className="mt-3">
          <a href={`/api/marketplace/build/${slug}`} target="_blank" rel="noopener" className="text-xs text-emerald hover:text-amber inline-flex items-center gap-1">
            Raw JSON <ExternalLink className="size-3" />
          </a>
        </div>
      </Card>
    </div>
  );
}
