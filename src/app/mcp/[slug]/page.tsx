import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { Server, ArrowLeft, ExternalLink, Wrench, ShieldCheck, BookOpen } from "lucide-react";
import { McpInstallSnippets } from "@/components/mcp-install-snippets";
import { McpPlayground } from "@/components/mcp-playground";

// Public MCP server detail page. SSR + no-auth so it's shareable +
// SEO-able. Pulls the manifest from /api/mcp/[slug] and renders the
// tools + install snippets. Anyone with the URL can see what tools
// the server exposes; calling them still requires a Bearer token.

type Manifest = {
  ok: boolean;
  error?: string;
  server?: { name: string; description: string; version: string; endpoint: string };
  tools?: { name: string; description: string; inputSchema?: Record<string, unknown> }[];
};

async function fetchManifest(slug: string): Promise<Manifest | null> {
  const h = await headers();
  const host = h.get("host");
  const proto = h.get("x-forwarded-proto") || "https";
  const origin = host ? `${proto}://${host}` : "https://sankofa.studio";
  try {
    const res = await fetch(`${origin}/api/mcp/${encodeURIComponent(slug)}`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    return data;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const m = await fetchManifest(slug);
  if (!m?.ok) return { title: "Sankofa MCP — not found" };
  return {
    title: `${m.server?.name} — Sankofa MCP`,
    description: m.server?.description || "An MCP server published on Sankofa Studio.",
  };
}

export default async function McpDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await fetchManifest(slug);
  if (!m?.ok || !m.server) notFound();

  const tools = m.tools ?? [];
  const url = m.server.endpoint;

  return (
    <div className="min-h-screen bg-[#0a0f0d] text-[#e7efe9]">
      <div className="max-w-3xl mx-auto px-6 sm:px-8 py-10 sm:py-14">
        <Link href="/mcp" className="text-xs text-[#8aa39a] hover:text-[#e7efe9] inline-flex items-center gap-1.5 mb-6">
          <ArrowLeft className="size-3" /> MCP catalog
        </Link>

        <header className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <Server className="size-4 text-[#2cc295]" />
            <span className="text-xs uppercase tracking-[0.22em] text-[#2cc295]">MCP server</span>
          </div>
          <h1 className="font-[family-name:var(--font-display)] text-3xl sm:text-4xl font-semibold leading-tight">
            {m.server.name}
          </h1>
          {m.server.description && (
            <p className="mt-3 text-[#cfe0d8] leading-relaxed">{m.server.description}</p>
          )}
          <div className="mt-4 flex items-center gap-3 text-[10px] uppercase tracking-widest text-[#8aa39a]">
            <span className="inline-flex items-center gap-1"><Wrench className="size-2.5" /> {tools.length} tool{tools.length === 1 ? "" : "s"}</span>
            <span className="inline-flex items-center gap-1"><ShieldCheck className="size-2.5 text-emerald" /> Bearer auth</span>
            <span className="text-[#6b8079]">v{m.server.version}</span>
          </div>
        </header>

        <section className="mb-10">
          <h2 className="text-xs uppercase tracking-widest text-[#2cc295] mb-3">Tools</h2>
          <ul className="space-y-2">
            {tools.map((t) => (
              <li key={t.name} className="rounded-2xl border border-[#2a3a35] bg-[#141d1a] p-4">
                <div className="font-mono text-sm text-[#2cc295]">{t.name}</div>
                {t.description && <p className="text-xs text-[#cfe0d8] mt-1 leading-relaxed">{t.description}</p>}
                {t.inputSchema && Object.keys((t.inputSchema as { properties?: Record<string, unknown> }).properties ?? {}).length > 0 && (
                  <details className="mt-2">
                    <summary className="text-[10px] uppercase tracking-widest text-[#8aa39a] cursor-pointer hover:text-[#e7efe9]">Input schema</summary>
                    <pre className="mt-2 text-[10px] font-mono bg-[#06100d] border border-[#1f2c28] rounded p-2 overflow-x-auto">{JSON.stringify(t.inputSchema, null, 2)}</pre>
                  </details>
                )}
              </li>
            ))}
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="text-xs uppercase tracking-widest text-[#2cc295] mb-3">Playground</h2>
          <McpPlayground slug={slug} serverName={m.server.name} tools={tools} />
        </section>

        <section className="mb-10">
          <h2 className="text-xs uppercase tracking-widest text-[#2cc295] mb-3">Install</h2>
          <McpInstallSnippets serverName={m.server.name} url={url} />
          <p className="mt-3 text-[10px] text-[#6b8079] leading-relaxed">
            Replace <code>YOUR_SMCP_TOKEN</code> with a token from your <Link href="/studio/settings" className="text-[#2cc295] hover:text-[#f4a949]">Sankofa Settings → MCP tokens</Link>. Tokens are scoped to your account; revoke any time without breaking other clients.
          </p>
        </section>

        <footer className="border-t border-[#1f2c28] pt-6 flex items-center justify-between text-[10px] text-[#6b8079]">
          <a href={url} target="_blank" rel="noopener" className="inline-flex items-center gap-1 hover:text-[#2cc295] font-mono">
            {url} <ExternalLink className="size-2.5" />
          </a>
          <a href="https://modelcontextprotocol.io" target="_blank" rel="noopener" className="inline-flex items-center gap-1 hover:text-[#2cc295]">
            <BookOpen className="size-2.5" /> MCP spec
          </a>
        </footer>
      </div>
    </div>
  );
}
