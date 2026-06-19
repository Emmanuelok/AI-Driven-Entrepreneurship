"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Card } from "@/components/ui";
import { Search, Loader2, ArrowRight, Users, Rocket } from "lucide-react";

// Cross-platform semantic search. Natural-language query against the
// public_search_index — currently indexed: public profiles + public
// ventures. The result list highlights the entity kind, the title,
// and a snippet of the indexed body. Similarity scores dim weaker hits.

type SearchResult = {
  id: number;
  entity_kind: "profile" | "venture";
  entity_id: string;
  href: string;
  title: string;
  body: string;
  similarity: number;
};

const KIND_TABS = [
  { id: "", label: "Everything" },
  { id: "profile", label: "People", icon: Users },
  { id: "venture", label: "Ventures", icon: Rocket },
] as const;

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="min-h-[40vh] flex items-center justify-center"><Loader2 className="size-6 text-emerald animate-spin" /></div>}>
      <SearchInner />
    </Suspense>
  );
}

function SearchInner() {
  const router = useRouter();
  const params = useSearchParams();
  const initialQ = params?.get("q") ?? "";
  const initialKind = params?.get("kind") ?? "";
  const [q, setQ] = useState(initialQ);
  const [kind, setKind] = useState<string>(initialKind);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(initialQ.length >= 2);

  // Debounced auto-search. Updates the URL too so results are
  // shareable. 350ms keeps the bounce comfortable.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setResults([]); setSearched(false); return; }
    setLoading(true);
    const t = setTimeout(async () => {
      const u = new URLSearchParams();
      u.set("q", term);
      if (kind) u.set("kind", kind);
      router.replace(`/search?${u.toString()}`, { scroll: false });
      try {
        const res = await fetch(`/api/v2/search?${u.toString()}`);
        const data = (await res.json()) as { ok: boolean; results?: SearchResult[] };
        setResults(data.ok && data.results ? data.results : []);
      } catch { setResults([]); }
      setSearched(true);
      setLoading(false);
    }, 350);
    return () => clearTimeout(t);
  }, [q, kind, router]);

  return (
    <div className="max-w-4xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <div className="mb-7">
        <p className="text-xs uppercase tracking-[0.22em] text-emerald mb-2 flex items-center gap-1.5">
          <Search className="size-3.5" /> Search
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight">
          Find the right person or venture.
        </h1>
        <p className="mt-3 text-muted max-w-2xl leading-relaxed">
          Type what you&apos;re looking for — &quot;a mentor who shipped fintech in Kenya&quot;, &quot;agritech ventures raising in Ghana&quot;, &quot;Hausa-speaking instructors&quot;. Semantic search reads what you mean, not just what you typed.
        </p>
      </div>

      <div className="relative mb-4">
        <Search className="size-5 text-muted absolute left-4 top-1/2 -translate-y-1/2" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="e.g. distribution mentor in Lagos…"
          className="bg-surface-2 border border-border rounded-2xl pl-12 pr-4 py-4 text-lg outline-none focus:border-emerald w-full"
        />
        {loading && <Loader2 className="size-4 text-emerald animate-spin absolute right-4 top-1/2 -translate-y-1/2" />}
      </div>

      <div className="flex items-center gap-1 mb-6">
        {KIND_TABS.map((t) => {
          const active = kind === t.id;
          const Icon = "icon" in t ? t.icon : null;
          return (
            <button
              key={t.id}
              onClick={() => setKind(t.id)}
              className={`px-3.5 py-1.5 rounded-full border text-xs transition inline-flex items-center gap-1.5 ${active ? "border-emerald bg-emerald/10 text-emerald" : "border-border text-muted hover:text-foreground hover:border-muted"}`}
            >
              {Icon && <Icon className="size-3" />} {t.label}
            </button>
          );
        })}
      </div>

      {!searched && q.trim().length < 2 && (
        <Card className="p-8 text-center">
          <p className="text-muted leading-relaxed max-w-md mx-auto">
            Try a query that describes what you actually need — sectors, regions, languages, expertise. The match doesn&apos;t have to be word-for-word.
          </p>
        </Card>
      )}

      {searched && !loading && results.length === 0 && (
        <Card className="p-8 text-center">
          <p className="text-muted">No matches. Try a broader query, or remove the kind filter.</p>
        </Card>
      )}

      {results.length > 0 && (
        <div className="space-y-2.5">
          {results.map((r) => (
            <ResultCard key={`${r.entity_kind}-${r.entity_id}`} r={r} />
          ))}
        </div>
      )}
    </div>
  );
}

function ResultCard({ r }: { r: SearchResult }) {
  // Dim weak matches but always render them — the user can decide.
  const strength = r.similarity > 0.55 ? "strong" : r.similarity > 0.4 ? "ok" : "weak";
  const Icon = r.entity_kind === "profile" ? Users : Rocket;
  return (
    <Link href={r.href} className="block group">
      <Card className={`p-5 hover:border-emerald/40 transition ${strength === "weak" ? "opacity-70" : ""}`}>
        <div className="flex items-start gap-3">
          <div className="size-9 rounded-xl bg-surface-2 border border-border flex items-center justify-center shrink-0">
            <Icon className="size-4 text-emerald" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-medium group-hover:text-emerald transition truncate">{r.title}</h3>
              <span className="text-[10px] uppercase tracking-widest text-muted">{r.entity_kind}</span>
            </div>
            <p className="text-sm text-muted leading-relaxed line-clamp-2 mt-1 whitespace-pre-wrap">{r.body}</p>
            <div className="text-[10px] text-muted mt-1.5">match {Math.round(r.similarity * 100)}%</div>
          </div>
          <ArrowRight className="size-3.5 text-muted shrink-0 opacity-0 group-hover:opacity-100 transition mt-1.5" />
        </div>
      </Card>
    </Link>
  );
}
