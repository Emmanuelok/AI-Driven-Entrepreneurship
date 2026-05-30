"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { LEGAL_DOCS } from "@/lib/legal-templates";
import { resolveDepartment } from "@/lib/recommendations";
import { getDepartment } from "@/lib/disciplines";
import { useStore } from "@/store";
import { Card, Badge } from "@/components/ui";
import { FileText, Search, Clock, ArrowRight, ShieldAlert, GraduationCap, Sparkles } from "lucide-react";

const CATS = ["All", "Founders", "Hiring", "Customers", "Investors", "IP", "Governance"] as const;

export default function DocumentsPage() {
  const { user } = useStore();
  const dept = useMemo(() => resolveDepartment(user?.field), [user?.field]);
  // School id is what LegalDoc.disciplines[] points at — derive from the
  // resolved department so we can match without a second lookup downstream.
  const schoolId = useMemo(() => (dept ? getDepartment(dept.id)?.school.id : undefined), [dept]);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<(typeof CATS)[number]>("All");
  const [forMyDiscipline, setForMyDiscipline] = useState<boolean>(!!dept);

  const docs = useMemo(() => {
    const base = LEGAL_DOCS.filter((d) => {
      if (cat !== "All" && d.category !== cat) return false;
      if (q && !`${d.name} ${d.description} ${d.category}`.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
    // When the discipline toggle is on, sort: universal first → discipline
    // matches → everything else (stable).
    if (forMyDiscipline && schoolId) {
      const rank = (id: string, universal: boolean, disciplines: string[] | undefined) => {
        if (universal) return 0;
        if (disciplines?.includes(schoolId)) return 1;
        return 2;
      };
      return [...base].sort((a, b) => rank(a.id, !!a.universal, a.disciplines) - rank(b.id, !!b.universal, b.disciplines));
    }
    return base;
  }, [q, cat, forMyDiscipline, schoolId]);

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
        {dept && (
          <label className="flex items-center gap-2 text-sm cursor-pointer" title={`Surface docs commonly needed in ${dept.name}`}>
            <input type="checkbox" checked={forMyDiscipline} onChange={(e) => setForMyDiscipline(e.target.checked)} className="accent-emerald" />
            <GraduationCap className="size-3.5 text-emerald" />
            For {dept.name.split(" ")[0]}
          </label>
        )}
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
        {docs.map((d) => {
          const isUniversal = forMyDiscipline && !!d.universal;
          const isDeptMatch = forMyDiscipline && !!schoolId && !d.universal && !!d.disciplines?.includes(schoolId);
          const highlight = isUniversal || isDeptMatch;
          return (
            <Link key={d.id} href={`/studio/documents/${d.id}`} className={`glass rounded-2xl p-5 transition group ${highlight ? "border-emerald/40 ring-1 ring-emerald/20" : "hover:border-emerald/40"}`}>
              <div className="flex items-start justify-between gap-3 mb-3">
                <FileText className="size-5 text-emerald" />
                <Badge color="muted">{d.category}</Badge>
              </div>
              {isUniversal && (
                <div className="mb-2 inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-emerald">
                  <Sparkles className="size-2.5" /> Every founder needs this
                </div>
              )}
              {isDeptMatch && (
                <div className="mb-2 inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-emerald">
                  <GraduationCap className="size-2.5" /> For your discipline
                </div>
              )}
              <h3 className="font-[family-name:var(--font-display)] text-xl font-semibold leading-tight group-hover:text-emerald transition">{d.name}</h3>
              <p className="mt-2 text-sm text-muted line-clamp-3 leading-relaxed">{d.description}</p>
              <div className="mt-4 flex items-center justify-between text-xs">
                <span className="flex items-center gap-1 text-muted"><Clock className="size-3" /> {d.estReadingMinutes} min read</span>
                <span className="text-emerald flex items-center gap-1">Generate <ArrowRight className="size-3.5 group-hover:translate-x-0.5 transition" /></span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
