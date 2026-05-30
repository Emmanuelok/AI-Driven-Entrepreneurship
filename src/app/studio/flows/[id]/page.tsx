"use client";

import { use, useState } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { useFlow } from "@/store/flow";
import { FlowCanvas } from "@/components/flow-canvas";
import { ArrowLeft, Pencil, Check } from "lucide-react";

export default function FlowDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { flows, renameFlow, hydrated } = useFlow();
  const flow = flows.find((f) => f.id === id);
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState("");

  if (!hydrated) return <div className="p-8 text-sm text-muted">Loading…</div>;
  if (!flow) { notFound(); return null; }

  return (
    <div>
      {/* Header */}
      <header className="border-b border-border px-4 sm:px-6 py-2.5 flex items-center gap-3 flex-wrap shrink-0">
        <Link href="/studio/flows" className="text-xs text-muted hover:text-foreground inline-flex items-center gap-1.5 shrink-0">
          <ArrowLeft className="size-3" /> Flows
        </Link>
        <div className="flex-1 min-w-0 flex items-center gap-2">
          {editingName ? (
            <>
              <input
                autoFocus
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { renameFlow(flow.id, draftName.trim() || flow.name); setEditingName(false); }
                  if (e.key === "Escape") setEditingName(false);
                }}
                className="bg-transparent outline-none text-sm font-medium border-b border-emerald min-w-0"
              />
              <button onClick={() => { renameFlow(flow.id, draftName.trim() || flow.name); setEditingName(false); }} className="text-emerald hover:text-amber">
                <Check className="size-3.5" />
              </button>
            </>
          ) : (
            <button
              onClick={() => { setDraftName(flow.name); setEditingName(true); }}
              className="font-medium text-sm truncate hover:text-emerald transition inline-flex items-center gap-1.5"
              title="Rename flow"
            >
              {flow.name}
              <Pencil className="size-3 opacity-0 group-hover:opacity-100" />
            </button>
          )}
        </div>
      </header>

      <FlowCanvas flow={flow} />
    </div>
  );
}
