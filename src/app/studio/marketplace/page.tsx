"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useBuild } from "@/store/build";
import { Card, Button, Input, Badge, EmptyState } from "@/components/ui";
import { Store, Search, GitFork, Eye, ArrowRight, Sparkles } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type Listing = {
  slug: string;
  title: string;
  description?: string;
  template_id?: string;
  tags: string[];
  forks: number;
  views: number;
  updated_at: string;
};

type Sort = "recent" | "forks" | "views";

const SUGGESTED_TAGS = ["agritech", "fintech", "health", "education", "voice", "rag", "tools", "vision"];

export default function MarketplacePage() {
  const router = useRouter();
  const { createProject } = useBuild();
  const [q, setQ] = useState("");
  const [tag, setTag] = useState("");
  const [sort, setSort] = useState<Sort>("recent");
  const [listings, setListings] = useState<Listing[]>([]);
  const [busy, setBusy] = useState(true);
  const [forking, setForking] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, tag, sort]);

  async function load() {
    setBusy(true);
    try {
      const params = new URLSearchParams({ sort });
      if (q.trim()) params.set("q", q.trim());
      if (tag) params.set("tag", tag);
      const res = await fetch(`/api/marketplace/browse?${params}`);
      const data = await res.json();
      setListings(data.ok ? data.results : []);
    } finally {
      setBusy(false);
    }
  }

  async function fork(slug: string) {
    setForking(slug);
    try {
      const res = await fetch("/api/marketplace/fork", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      const data = await res.json();
      if (!data.ok) { alert(data.error || "Couldn't fork."); return; }
      const pid = createProject(
        `${data.build.title} (fork)`,
        data.build.description || `Forked from /studio/marketplace/${slug}`,
        data.build.templateId || "blank-canvas",
        data.build.code,
      );
      router.push(`/studio/build/${pid}`);
    } finally {
      setForking(null);
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <div className="mb-8">
        <p className="text-xs uppercase tracking-[0.22em] text-emerald mb-2 flex items-center gap-1.5">
          <Store className="size-3.5" /> Build Marketplace
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight">
          Other students&apos; AI products. <span className="text-emerald">Fork the ones that fit.</span>
        </h1>
        <p className="mt-3 text-muted max-w-2xl leading-relaxed">
          Every build here is a runnable HTML file. Open the preview, like what you see, fork it
          into your studio, and remix from there. Authors keep credit; you keep momentum.
        </p>
      </div>

      <Card className="p-4 mb-6">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2 flex-1 min-w-[200px] bg-surface-2 rounded-xl px-3 py-2 border border-border">
            <Search className="size-4 text-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search marketplace…" className="flex-1 bg-transparent outline-none text-sm" />
          </div>
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="bg-surface-2 border border-border rounded-xl px-3 py-2 text-sm outline-none focus:border-emerald">
            <option value="recent">Most recent</option>
            <option value="forks">Most forked</option>
            <option value="views">Most viewed</option>
          </select>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <button onClick={() => setTag("")} className={`text-xs px-3 py-1 rounded-full border transition ${tag === "" ? "bg-emerald text-black border-emerald" : "text-muted border-border hover:border-muted"}`}>
            All
          </button>
          {SUGGESTED_TAGS.map((t) => (
            <button key={t} onClick={() => setTag(t === tag ? "" : t)} className={`text-xs px-3 py-1 rounded-full border transition ${tag === t ? "bg-emerald text-black border-emerald" : "text-muted border-border hover:border-muted"}`}>
              {t}
            </button>
          ))}
        </div>
      </Card>

      {busy ? (
        <div className="py-16 text-center text-sm text-muted italic">Loading…</div>
      ) : listings.length === 0 ? (
        <EmptyState
          icon={Store}
          title="Nothing here yet"
          body="Be the first to publish — open one of your builds and hit Publish from the studio header."
          action={<Link href="/studio/build"><Button><Sparkles className="size-4" /> Open AI Build Studio</Button></Link>}
        />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {listings.map((l) => (
            <Card key={l.slug} className="p-5 hover:border-emerald/40 transition group flex flex-col">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="font-medium leading-snug">{l.title}</div>
                {l.template_id && <Badge color="muted">{l.template_id}</Badge>}
              </div>
              <p className="text-xs text-muted line-clamp-3 mb-3 flex-1">{l.description || "—"}</p>
              {l.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {l.tags.slice(0, 3).map((t) => (
                    <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-surface-2 border border-border text-muted">{t}</span>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between text-[10px] text-muted mb-3">
                <div className="flex gap-2">
                  <span className="flex items-center gap-1"><GitFork className="size-3" /> {l.forks}</span>
                  <span className="flex items-center gap-1"><Eye className="size-3" /> {l.views}</span>
                </div>
                <span>{formatDistanceToNow(new Date(l.updated_at), { addSuffix: true })}</span>
              </div>
              <div className="flex gap-2">
                <Link href={`/studio/marketplace/${l.slug}`} className="flex-1">
                  <Button size="sm" variant="secondary" className="w-full">View <ArrowRight className="size-3" /></Button>
                </Link>
                <Button size="sm" onClick={() => fork(l.slug)} disabled={forking === l.slug}>
                  <GitFork className="size-3" /> {forking === l.slug ? "…" : "Fork"}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
