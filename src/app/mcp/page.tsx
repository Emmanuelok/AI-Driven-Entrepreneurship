"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Server, ArrowLeft, ExternalLink, Wrench, ShieldCheck, Hash } from "lucide-react";

type Entry = {
  slug: string;
  name: string;
  description: string;
  toolCount: number;
  tools: { name: string; description: string }[];
  ownerName: string;
  calls30d: number;
  updatedAt: string;
};

// Public MCP catalog. No auth required — browse every Sankofa-published
// MCP server. Each card links to /mcp/[slug] (server detail with install
// snippets), which falls back to the public manifest API for actual
// runtime info.

export default function McpCatalogPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQ = searchParams.get("q") ?? "";

  const [rows, setRows] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState(initialQ);

  // Server-side search: debounce 200ms then refetch with ?q=. Also
  // mirror the query into the URL so /mcp?q=tomato is a shareable
  // deep link. We use replace (not push) so back-button history
  // doesn't fill up with intermediate keystroke states.
  useEffect(() => {
    const handle = setTimeout(() => {
      setLoading(true);
      const params = new URLSearchParams({ limit: "100" });
      if (q.trim()) params.set("q", q.trim());
      fetch(`/api/mcp/catalog?${params.toString()}`)
        .then((r) => r.json())
        .then((data) => { if (data.ok) setRows(data.results || []); })
        .finally(() => setLoading(false));

      const url = q.trim() ? `/mcp?q=${encodeURIComponent(q.trim())}` : "/mcp";
      router.replace(url, { scroll: false });
    }, q ? 200 : 0);
    return () => clearTimeout(handle);
  }, [q, router]);

  const filtered = rows;

  return (
    <div className="min-h-screen bg-[#0a0f0d] text-[#e7efe9]">
      <div className="max-w-6xl mx-auto px-6 sm:px-8 py-10 sm:py-14">
        <Link href="/" className="text-xs text-[#8aa39a] hover:text-[#e7efe9] inline-flex items-center gap-1.5 mb-6">
          <ArrowLeft className="size-3" /> Sankofa
        </Link>

        <header className="mb-8">
          <p className="text-xs uppercase tracking-[0.22em] text-[#2cc295] mb-2 flex items-center gap-1.5">
            <Server className="size-3.5" /> MCP catalog
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-4xl sm:text-5xl font-semibold leading-tight">
            Tools, built by students, for any AI.
          </h1>
          <p className="mt-3 text-[#8aa39a] max-w-2xl leading-relaxed">
            Every server here was published by a Sankofa builder. They speak Model Context Protocol — install
            them in Claude Desktop, Cursor, or any MCP-aware client and the tools show up alongside Claude&apos;s
            built-ins. Authentication is per-user via tokens minted in Settings.
          </p>
          <div className="mt-5 flex items-center gap-3 text-[10px] uppercase tracking-widest text-[#8aa39a]">
            <span className="inline-flex items-center gap-1"><ShieldCheck className="size-2.5 text-emerald" /> Sandboxed</span>
            <span className="inline-flex items-center gap-1"><Hash className="size-2.5" /> Rate-limited</span>
            <span className="inline-flex items-center gap-1"><Server className="size-2.5" /> JSON-RPC 2.0 over HTTP</span>
          </div>
        </header>

        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter by name, description, or tool…"
          className="w-full bg-[#141d1a] border border-[#2a3a35] rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[#2cc295] mb-6"
        />

        {loading ? (
          <div className="text-sm text-[#8aa39a] italic">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-[#2a3a35] bg-[#141d1a] p-6 text-sm text-[#8aa39a]">
            {q ? "No servers match that query." : "No MCP servers published yet. Be the first — promote a build to the cloud, add tools in its MCP tab."}
          </div>
        ) : (
          <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map((r) => (
              <li key={r.slug}>
                <Link
                  href={`/mcp/${r.slug}`}
                  className="block h-full rounded-2xl border border-[#2a3a35] bg-[#141d1a] hover:border-[#2cc295]/40 transition p-5"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <Server className="size-4 text-[#2cc295] shrink-0" />
                    {r.calls30d > 0 && (
                      <span className="text-[10px] text-[#8aa39a]">{r.calls30d.toLocaleString()} call{r.calls30d === 1 ? "" : "s"} · 30d</span>
                    )}
                  </div>
                  <div className="font-medium text-sm leading-snug">{r.name}</div>
                  {r.description && (
                    <p className="text-xs text-[#8aa39a] mt-1 line-clamp-2 leading-relaxed">{r.description}</p>
                  )}
                  <div className="mt-3 flex items-center gap-1.5 flex-wrap">
                    {r.tools.slice(0, 4).map((t) => (
                      <span key={t.name} className="text-[10px] px-1.5 py-0.5 rounded bg-[#2cc295]/10 border border-[#2cc295]/30 text-[#2cc295] font-mono">{t.name}</span>
                    ))}
                    {r.tools.length > 4 && <span className="text-[10px] text-[#8aa39a]">+{r.tools.length - 4}</span>}
                  </div>
                  <div className="mt-3 flex items-center justify-between text-[10px] text-[#8aa39a]">
                    <span>by {r.ownerName}</span>
                    <span className="inline-flex items-center gap-1"><Wrench className="size-2.5" /> {r.toolCount} tool{r.toolCount === 1 ? "" : "s"}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-12 text-[10px] text-[#6b8079] text-center">
          Want to publish your own? Build it in the AI Build Studio, promote to cloud, and toggle the MCP tab on. The catalog updates within seconds.
        </p>
      </div>
    </div>
  );
}
