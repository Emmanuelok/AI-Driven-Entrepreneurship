"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { LEGAL_DOCS } from "@/lib/legal-templates";
import { Card, Badge, Input } from "@/components/ui";
import { FileText, Search, Clock, ArrowRight, ShieldAlert } from "lucide-react";

const CATS = ["All", "Founders", "Hiring", "Customers", "Investors", "IP", "Governance"] as const;

export default function DocumentsPage() {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<(typeof CATS)[number]>("All");

  const docs = useMemo(() => {
    return LEGAL_DOCS.filter((d) => {
      if (cat !== "All" && d.category !== cat) return false;
      if (q && !`${d.name} ${d.description} ${d.category}`.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [q, cat]);

  return (
    <div className="max-w-6xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <div className="mb-8">
        <p className="text-xs uppercase tracking-[0.22em] text-emerald mb-2 flex items-center gap-1.5">
          <FileText className="size-3.5" /> Document Studio
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight max-w-3xl">
          Founder paperwork. Pre-drafted. Pre-fillable. <span className="text-emerald">In your jurisdiction.</span>
        </h1>
        <p className="mt-3 text-muted max-w-2xl">
          NDAs, founders agreements, SAFEs, term sheets, employment letters, IP assignments. Adapted for Nigeria, Ghana, Kenya, South Africa. Always lawyer-review before signing.
        </p>
      </div>

      <Card className="p-4 mb-6 flex flex-wrap gap-3 items-center">
        <div className="flex-1 min-w-[240px] flex items-center gap-2 bg-surface-2 border border-border rounded-xl px-3 py-2">
          <Search className="size-4 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search documents…" className="flex-1 bg-transparent outline-none text-sm" />
        </div>
        <div className="flex gap-1 overflow-x-auto">
          {CATS.map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition ${
                cat === c ? "bg-emerald text-black font-medium" : "border border-border text-muted hover:text-foreground"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </Card>

      <Card className="p-4 mb-6 bg-amber/5 border-amber/30">
        <div className="flex items-start gap-3">
          <ShieldAlert className="size-5 text-amber shrink-0 mt-0.5" />
          <div className="text-sm text-muted">
            These are <span className="text-foreground">templates</span>, not legal advice. Always have a qualified lawyer in your jurisdiction review before signing anything that creates real obligations. Sankofa partners with local counsel in NG, GH, KE, SA — book through the <Link href="/studio/mentors" className="text-emerald hover:underline">mentor marketplace</Link>.
          </div>
        </div>
      </Card>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {docs.map((d) => (
          <Link key={d.id} href={`/studio/documents/${d.id}`} className="glass rounded-2xl p-5 hover:border-emerald/40 transition group">
            <div className="flex items-start justify-between gap-3 mb-3">
              <FileText className="size-5 text-emerald" />
              <Badge color="muted">{d.category}</Badge>
            </div>
            <h3 className="font-[family-name:var(--font-display)] text-xl font-semibold leading-tight group-hover:text-emerald transition">{d.name}</h3>
            <p className="mt-2 text-sm text-muted line-clamp-3 leading-relaxed">{d.description}</p>
            <div className="mt-4 flex items-center justify-between text-xs">
              <span className="flex items-center gap-1 text-muted"><Clock className="size-3" /> {d.estReadingMinutes} min read</span>
              <span className="text-emerald flex items-center gap-1">Generate <ArrowRight className="size-3.5 group-hover:translate-x-0.5 transition" /></span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
