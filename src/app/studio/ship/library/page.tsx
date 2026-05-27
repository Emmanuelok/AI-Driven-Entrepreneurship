"use client";

import Link from "next/link";
import { useState } from "react";
import { useMe } from "@/store/me";
import { Card, Badge, Button, EmptyState } from "@/components/ui";
import { Markdown } from "@/components/markdown";
import { ArrowLeft, Rocket, Copy, Check, Download, Trash2, Sparkles } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const KIND_LABEL: Record<string, string> = {
  "problem-brief": "Problem Brief",
  "interview-script": "Discovery Script",
  "loi": "Letter of Intent",
  "pricing-page": "Pricing Page",
  "outreach-script": "Outreach Scripts",
  "pitch-summary": "60-Second Pitch",
  "landing-copy": "Landing Page Copy",
};

export default function ShipLibraryPage() {
  const { artifacts, removeArtifact } = useMe();
  const [selectedId, setSelectedId] = useState<string | null>(artifacts[0]?.id ?? null);
  const [copied, setCopied] = useState(false);
  const selected = artifacts.find((a) => a.id === selectedId);

  function copy() { if (selected) { navigator.clipboard.writeText(selected.body); setCopied(true); setTimeout(() => setCopied(false), 1500); } }
  function download() {
    if (!selected) return;
    const blob = new Blob([selected.body], { type: "text/markdown;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${selected.title.replace(/[^a-z0-9]+/gi, "-")}-${Date.now()}.md`; a.click(); URL.revokeObjectURL(a.href);
  }

  return (
    <div className="max-w-7xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <Link href="/studio/ship" className="text-sm text-muted hover:text-foreground inline-flex items-center gap-1.5 mb-6"><ArrowLeft className="size-3.5" /> Ship Hour</Link>

      <div className="mb-8 flex items-end justify-between flex-wrap gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-emerald mb-2 flex items-center gap-1.5"><Rocket className="size-3.5" /> Shipped library</p>
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight">{artifacts.length} real artifact{artifacts.length === 1 ? "" : "s"} shipped.</h1>
          <p className="mt-2 text-muted max-w-xl">Everything you've drafted in Ship Hour lives here forever. Copy, edit, send.</p>
        </div>
        <Link href="/studio/ship"><Button><Sparkles className="size-4" /> Run another Ship Hour</Button></Link>
      </div>

      {artifacts.length === 0 ? (
        <EmptyState
          icon={Rocket}
          title="No artifacts yet"
          body="Run your first Ship Hour. In 60 minutes you'll walk out with 5+ takeable artifacts."
          action={<Link href="/studio/ship"><Button>Start Ship Hour</Button></Link>}
        />
      ) : (
        <div className="grid lg:grid-cols-[320px_1fr] gap-4">
          <div className="space-y-2">
            {artifacts.map((a) => (
              <button
                key={a.id}
                onClick={() => setSelectedId(a.id)}
                className={`block w-full text-left p-3 rounded-xl border transition ${selectedId === a.id ? "border-emerald bg-emerald/10" : "border-border hover:border-muted hover:bg-surface-2"}`}
              >
                <Badge color="emerald">{KIND_LABEL[a.kind] ?? a.kind}</Badge>
                <div className="font-medium text-sm mt-2">{a.title}</div>
                <div className="text-xs text-muted mt-1">{a.ventureName} · {formatDistanceToNow(a.ts, { addSuffix: true })}</div>
              </button>
            ))}
          </div>

          {selected && (
            <Card className="overflow-hidden">
              <div className="px-5 py-3 border-b border-border bg-surface-2/40 flex items-center justify-between flex-wrap gap-2">
                <div>
                  <div className="text-xs uppercase tracking-widest text-muted">{KIND_LABEL[selected.kind] ?? selected.kind}</div>
                  <div className="font-medium">{selected.title}</div>
                </div>
                <div className="flex gap-1.5">
                  <button onClick={copy} className="text-xs px-3 py-1 rounded-full border border-border hover:bg-surface flex items-center gap-1 transition">
                    {copied ? <><Check className="size-3 text-emerald" /> Copied</> : <><Copy className="size-3" /> Copy</>}
                  </button>
                  <button onClick={download} className="text-xs px-3 py-1 rounded-full border border-border hover:bg-surface flex items-center gap-1 transition">
                    <Download className="size-3" /> Download
                  </button>
                  <button onClick={() => { if (confirm("Delete this artifact?")) { removeArtifact(selected.id); setSelectedId(artifacts.find((a) => a.id !== selected.id)?.id ?? null); } }} className="text-xs px-3 py-1 rounded-full border border-border text-rust hover:bg-rust/10 flex items-center gap-1 transition">
                    <Trash2 className="size-3" /> Delete
                  </button>
                </div>
              </div>
              <div className="p-6 max-h-[70vh] overflow-y-auto">
                <Markdown src={selected.body} />
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
