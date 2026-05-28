"use client";

import { use, useEffect, useMemo, useState } from "react";
import { notFound } from "next/navigation";
import { useStore } from "@/store";
import { Card, Button, Input, Badge } from "@/components/ui";
import { FolderLock, CheckCircle2, FileText, AlertCircle, ExternalLink, Plus, Trash2, Save } from "lucide-react";

type DocStatus = "missing" | "draft" | "ready";
type Doc = { id: string; name: string; status: DocStatus; category: string; url?: string };

// Industry-standard data-room checklist used by African + global VCs.
// Grouped by category. Founders can add custom items but the defaults are
// the union of what TLcom, Partech, Norrsken, Sequoia, and YC ask for.
const TEMPLATE: { category: string; items: string[] }[] = [
  {
    category: "Corporate",
    items: [
      "Certificate of incorporation",
      "Memorandum & Articles of Association",
      "Shareholder register / cap table (current)",
      "Board resolutions to date",
      "Trademark / IP registration certificates",
    ],
  },
  {
    category: "Team",
    items: [
      "Co-founder agreement (signed)",
      "IP assignment from all founders",
      "Vesting schedule (4-year, 1-year cliff standard)",
      "Employee NDA / IP template",
      "Employee stock option plan (ESOP) docs",
      "Founder & key-hire CVs",
    ],
  },
  {
    category: "Commercial",
    items: [
      "Pilot / customer contracts (anonymized)",
      "Letters of intent (LOIs) from prospects",
      "Customer references (3 names + permission to contact)",
      "Pricing methodology",
      "Supplier / vendor master list",
    ],
  },
  {
    category: "Financial",
    items: [
      "P&L (last 12 months actual)",
      "Cash flow statement (last 12 months)",
      "12-month financial forecast",
      "Detailed unit-economic model",
      "Bank statements (last 6 months)",
      "Outstanding debt / liabilities",
    ],
  },
  {
    category: "Fundraising",
    items: [
      "Current pitch deck",
      "Investor update template",
      "Existing SAFE / convertible note copies",
      "Previous round closing docs",
      "Pro-forma cap table (post-this-round)",
    ],
  },
  {
    category: "Product & Tech",
    items: [
      "Product roadmap (12 months)",
      "Technical architecture diagram",
      "Security & data-handling policy",
      "Privacy policy (live URL)",
      "Terms of service (live URL)",
      "Source-code repo access (read-only invite)",
    ],
  },
  {
    category: "Regulatory & Compliance",
    items: [
      "Operating licence(s) for jurisdiction",
      "Tax registration (TIN / KRA-PIN / FIRS)",
      "Sector-specific compliance (e.g. health, finance)",
      "GDPR / data-protection registration if applicable",
    ],
  },
];

export default function DataRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { ventures, updateVenture } = useStore();
  const found = ventures.find((x) => x.id === id);

  const [docs, setDocs] = useState<Doc[]>([]);
  const [newName, setNewName] = useState("");
  const [newCat, setNewCat] = useState(TEMPLATE[0].category);

  useEffect(() => {
    if (!found) return;
    if (!found.dataRoom || found.dataRoom.length === 0) {
      // Seed from template
      const seeded: Doc[] = TEMPLATE.flatMap((g) => g.items.map((name) => ({
        id: Math.random().toString(36).slice(2, 8),
        name,
        category: g.category,
        status: "missing" as DocStatus,
      })));
      setDocs(seeded);
    } else {
      setDocs(found.dataRoom);
    }
  }, [found?.id]);

  if (!found) { notFound(); return null; }
  const v = found;

  function save() { updateVenture(v.id, { dataRoom: docs }); }
  function setStatus(did: string, status: DocStatus) { setDocs(docs.map((d) => (d.id === did ? { ...d, status } : d))); }
  function setUrl(did: string, url: string) { setDocs(docs.map((d) => (d.id === did ? { ...d, url } : d))); }
  function add() {
    if (!newName.trim()) return;
    setDocs([...docs, { id: Math.random().toString(36).slice(2, 8), name: newName, category: newCat, status: "missing" }]);
    setNewName("");
  }
  function remove(did: string) { setDocs(docs.filter((d) => d.id !== did)); }

  const ready = docs.filter((d) => d.status === "ready").length;
  const draft = docs.filter((d) => d.status === "draft").length;
  const missing = docs.filter((d) => d.status === "missing").length;
  const pct = docs.length ? (ready / docs.length) * 100 : 0;

  const byCategory = useMemo(() => {
    const map = new Map<string, Doc[]>();
    for (const d of docs) {
      const arr = map.get(d.category) ?? [];
      arr.push(d);
      map.set(d.category, arr);
    }
    return Array.from(map.entries());
  }, [docs]);

  return (
    <div className="max-w-6xl mx-auto px-5 sm:px-8 py-10 space-y-6">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-emerald mb-1 flex items-center gap-1.5">
            <FolderLock className="size-3.5" /> Investor data room
          </p>
          <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold">{ready} of {docs.length} ready</h2>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <Badge color="emerald">{ready} ready</Badge>
            <Badge color="amber">{draft} draft</Badge>
            <Badge color="rust">{missing} missing</Badge>
          </div>
          <div className="mt-3 h-2 bg-surface-2 rounded-full overflow-hidden max-w-md">
            <div className="h-full bg-gradient-to-r from-emerald to-amber" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <Button onClick={save}><Save className="size-4" /> Save</Button>
      </header>

      <Card className="p-4 flex gap-2 items-end flex-wrap">
        <div className="flex-1 min-w-[220px]">
          <div className="text-[10px] uppercase tracking-widest text-muted mb-1">New document</div>
          <Input placeholder="e.g. Customer LOI - Zenith Bank" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted mb-1">Category</div>
          <select value={newCat} onChange={(e) => setNewCat(e.target.value)} className="bg-surface-2 border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-emerald">
            {TEMPLATE.map((g) => (<option key={g.category} value={g.category}>{g.category}</option>))}
          </select>
        </div>
        <Button onClick={add} disabled={!newName.trim()}><Plus className="size-4" /> Add</Button>
      </Card>

      {byCategory.map(([cat, items]) => (
        <Card key={cat} className="p-5">
          <h3 className="font-medium mb-3 flex items-center gap-2">
            <FileText className="size-4 text-emerald" /> {cat}
            <Badge color="muted">{items.filter((d) => d.status === "ready").length}/{items.length}</Badge>
          </h3>
          <div className="space-y-2">
            {items.map((d) => (
              <div key={d.id} className="group grid grid-cols-12 gap-2 items-center rounded-xl border border-border p-3">
                <div className="col-span-12 sm:col-span-5 flex items-center gap-2">
                  {d.status === "ready" ? <CheckCircle2 className="size-4 text-emerald" /> : d.status === "draft" ? <AlertCircle className="size-4 text-amber" /> : <span className="size-4 rounded-full border border-rust" />}
                  <span className="text-sm leading-snug">{d.name}</span>
                </div>
                <div className="col-span-6 sm:col-span-3">
                  <select value={d.status} onChange={(e) => setStatus(d.id, e.target.value as DocStatus)} className="bg-surface-2 border border-border rounded-lg px-2 py-1.5 text-xs w-full outline-none focus:border-emerald">
                    <option value="missing">Missing</option>
                    <option value="draft">Draft / in progress</option>
                    <option value="ready">Ready</option>
                  </select>
                </div>
                <div className="col-span-6 sm:col-span-3">
                  <Input placeholder="Link (Drive, Notion, etc.)" value={d.url ?? ""} onChange={(e) => setUrl(d.id, e.target.value)} className="text-xs" />
                </div>
                <div className="col-span-12 sm:col-span-1 flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition">
                  {d.url && <a href={d.url} target="_blank" rel="noopener" className="text-muted hover:text-emerald"><ExternalLink className="size-3.5" /></a>}
                  <button onClick={() => remove(d.id)} className="text-muted hover:text-rust"><Trash2 className="size-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ))}

      <Card className="p-5">
        <h3 className="text-xs uppercase tracking-[0.22em] text-emerald mb-3">Data-room etiquette</h3>
        <ul className="text-sm text-muted space-y-1.5 leading-relaxed">
          <li>· Don&apos;t send the data room until after a first meeting. It&apos;s an asset, not a foot-in-the-door.</li>
          <li>· Use a service that tracks views (DocSend, BriefLink) — you want to know who looked at what.</li>
          <li>· Anonymize customer contracts. Names matter less than terms.</li>
          <li>· Keep this list <strong>green</strong>. Diligence pauses kill deals.</li>
        </ul>
      </Card>
    </div>
  );
}
