"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFlow } from "@/store/flow";
import { Card, Button, EmptyState } from "@/components/ui";
import { Network, Plus, Trash2, ChevronRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

// Flow Studio index page. Lists every local flow + a "new flow" CTA.
// Local-first via the zustand persist store; cloud sync arrives in
// Phase 2 along with multi-user collaboration on flows.

export default function FlowStudioIndex() {
  const router = useRouter();
  const { flows, createFlow, deleteFlow } = useFlow();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  function create() {
    const id = createFlow(name.trim() || undefined);
    setName(""); setCreating(false);
    router.push(`/studio/flows/${id}`);
  }

  const sorted = [...flows].sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <div className="max-w-5xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <div className="flex items-end justify-between flex-wrap gap-4 mb-8">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-emerald mb-2 flex items-center gap-1.5">
            <Network className="size-3.5" /> Flow Studio
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight">From idea to shipped venture, as a graph.</h1>
          <p className="mt-3 text-muted max-w-2xl">
            Chain together problem framing, persona, wedge, interviews, pitch, landing copy, and a working HTML prototype — all in one canvas. When the graph is ready, ship it to your Venture Studio or AI Build Studio in one click.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}><Plus className="size-4" /> New flow</Button>
      </div>

      {creating && (
        <Card className="p-4 mb-6 flex items-center gap-2">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") create(); if (e.key === "Escape") setCreating(false); }}
            placeholder="Flow name (e.g. Maize cold-chain v1)"
            className="flex-1 bg-transparent outline-none text-sm"
          />
          <Button size="sm" onClick={create}>Create</Button>
          <Button size="sm" variant="ghost" onClick={() => setCreating(false)}>Cancel</Button>
        </Card>
      )}

      {sorted.length === 0 ? (
        <EmptyState
          icon={Network}
          title="No flows yet"
          body="A flow is a working graph for a single venture idea — problem framing, persona, wedge, interview script, pitch, prototype. Build one and ship it in one click."
          action={<Button onClick={() => setCreating(true)}><Plus className="size-4" /> Create your first flow</Button>}
        />
      ) : (
        <ul className="space-y-2">
          {sorted.map((f) => (
            <li key={f.id}>
              <Link href={`/studio/flows/${f.id}`} className="group block">
                <Card className="p-4 hover:border-emerald/40 transition">
                  <div className="flex items-center gap-3">
                    <Network className="size-4 text-emerald shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{f.name}</div>
                      <div className="text-[10px] text-muted">
                        {f.nodes.length} node{f.nodes.length === 1 ? "" : "s"} · {f.edges.length} edge{f.edges.length === 1 ? "" : "s"} · updated {formatDistanceToNow(f.updatedAt, { addSuffix: true })}
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.preventDefault(); if (confirm(`Delete "${f.name}"?`)) deleteFlow(f.id); }}
                      className="opacity-0 group-hover:opacity-100 text-muted hover:text-rust transition"
                      aria-label="Delete flow"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                    <ChevronRight className="size-4 text-muted" />
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-10 text-[10px] text-muted leading-relaxed">
        Flows live in your browser. Multi-user collaboration + cloud sync arrives in Phase 2; the Brainstorm canvas is still available at <Link href="/studio/brainstorm" className="text-emerald hover:text-amber">/studio/brainstorm</Link> while flows graduates from beta.
      </p>
    </div>
  );
}
