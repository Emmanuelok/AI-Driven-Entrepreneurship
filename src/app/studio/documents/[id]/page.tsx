"use client";

import { use, useState } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLegalDoc, renderDoc } from "@/lib/legal-templates";
import { Card, Button, Input, Badge, Textarea } from "@/components/ui";
import { ArrowLeft, Download, Copy, Check, ShieldAlert, Sparkles } from "lucide-react";

export default function DocumentBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const found = getLegalDoc(id);
  if (!found) { notFound(); return null; }
  const doc = found;

  const [vars, setVars] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);
  const filled = renderDoc(doc, vars);

  function copy() {
    navigator.clipboard.writeText(filled);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function download() {
    const blob = new Blob([filled], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${doc.id}-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="max-w-6xl mx-auto px-5 sm:px-8 py-10">
      <Link href="/studio/documents" className="text-sm text-muted hover:text-foreground inline-flex items-center gap-1.5 mb-6">
        <ArrowLeft className="size-3.5" /> All documents
      </Link>

      <div className="flex items-start justify-between flex-wrap gap-3 mb-6">
        <div>
          <Badge color="emerald">{doc.category}</Badge>
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold leading-tight mt-2">{doc.name}</h1>
          <p className="text-muted mt-1">{doc.description}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {doc.jurisdictions.map((j) => <Badge key={j} color="muted">{j}</Badge>)}
          </div>
        </div>
      </div>

      <Card className="p-4 mb-6 bg-amber/5 border-amber/30">
        <div className="flex items-start gap-3">
          <ShieldAlert className="size-5 text-amber shrink-0 mt-0.5" />
          <div className="text-sm text-muted">Templates, not legal advice. Have a lawyer review before signing. <Link href="/studio/mentors" className="text-emerald hover:underline">Book local counsel →</Link></div>
        </div>
      </Card>

      <div className="grid lg:grid-cols-[360px_1fr] gap-4">
        <Card className="p-5 h-fit lg:sticky lg:top-20">
          <h2 className="font-medium mb-4 flex items-center gap-2"><Sparkles className="size-4 text-amber" /> Fill the fields</h2>
          <div className="space-y-3">
            {doc.vars.map((v) => (
              <label key={v.key} className="block">
                <div className="text-xs uppercase tracking-widest text-muted mb-1">{v.label}</div>
                <Input placeholder={v.placeholder} value={vars[v.key] ?? ""} onChange={(e) => setVars({ ...vars, [v.key]: e.target.value })} />
              </label>
            ))}
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-surface-2/50">
            <div className="text-xs text-muted">Live preview</div>
            <div className="flex gap-2">
              <button onClick={copy} className="text-xs px-3 py-1 rounded-full border border-border hover:bg-surface flex items-center gap-1 transition">
                {copied ? <><Check className="size-3 text-emerald" /> Copied</> : <><Copy className="size-3" /> Copy</>}
              </button>
              <button onClick={download} className="text-xs px-3 py-1 rounded-full bg-emerald text-black flex items-center gap-1 hover:bg-amber transition">
                <Download className="size-3" /> Download
              </button>
            </div>
          </div>
          <pre className="p-6 font-[family-name:var(--font-mono)] text-xs leading-relaxed whitespace-pre-wrap text-foreground/95 max-h-[80vh] overflow-y-auto">
            {filled}
          </pre>
        </Card>
      </div>
    </div>
  );
}
