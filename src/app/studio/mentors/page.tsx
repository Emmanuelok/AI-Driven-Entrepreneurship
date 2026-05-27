"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { MENTORS } from "@/lib/mentors";
import { Card, Badge, Button, Input } from "@/components/ui";
import { Search, Star, Clock, ArrowRight, Filter } from "lucide-react";

const EXPERTISE = ["All", "Fundraising", "Fintech", "Agribusiness", "Healthtech", "Climate", "Edtech", "Marketplace", "Engineering culture"];

export default function MentorsPage() {
  const [q, setQ] = useState("");
  const [exp, setExp] = useState("All");
  const [proBono, setProBono] = useState(false);

  const filtered = useMemo(() => {
    return MENTORS.filter((m) => {
      if (exp !== "All" && !m.expertise.some((e) => e.toLowerCase().includes(exp.toLowerCase()))) return false;
      if (proBono && m.pricePerHour > 0) return false;
      if (q && !`${m.name} ${m.role} ${m.org} ${m.city} ${m.country} ${m.bio} ${m.expertise.join(" ")}`.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [q, exp, proBono]);

  return (
    <div className="max-w-6xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <div className="mb-8">
        <p className="text-xs uppercase tracking-[0.22em] text-emerald mb-2">Mentor marketplace</p>
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight max-w-3xl">
          Africa's most respected operators. Bookable today.
        </h1>
        <p className="mt-3 text-muted max-w-2xl">
          Founders who built and exited. Investors who write the checks. Operators who scaled across borders. Most pro-bono for Sankofa students.
        </p>
      </div>

      <Card className="p-4 mb-6 flex flex-wrap gap-3 items-center">
        <div className="flex-1 min-w-[240px] flex items-center gap-2 bg-surface-2 border border-border rounded-xl px-3 py-2">
          <Search className="size-4 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search mentors…" className="flex-1 bg-transparent outline-none text-sm" />
        </div>
        <select value={exp} onChange={(e) => setExp(e.target.value)} className="bg-surface-2 border border-border rounded-xl px-3 py-2 text-sm outline-none focus:border-emerald">
          {EXPERTISE.map((x) => <option key={x}>{x}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={proBono} onChange={(e) => setProBono(e.target.checked)} className="accent-emerald" />
          Pro-bono only
        </label>
        <div className="text-xs text-muted">{filtered.length} mentors</div>
      </Card>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((m) => (
          <Link key={m.id} href={`/studio/mentors/${m.id}`} className="glass rounded-2xl p-5 hover:border-emerald/40 transition group">
            <div className="flex items-start gap-3">
              <div className="size-14 rounded-2xl bg-gradient-to-br from-emerald to-amber flex items-center justify-center text-black font-bold shadow-lg shadow-emerald/20 shrink-0">
                {m.initials}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-medium leading-tight">{m.name}</h3>
                <div className="text-xs text-muted mt-0.5 truncate">{m.role}</div>
                <div className="text-xs text-emerald mt-0.5 truncate">{m.org}</div>
              </div>
            </div>
            <p className="mt-3 text-sm text-muted line-clamp-3">{m.bio}</p>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {m.expertise.slice(0, 3).map((e) => (
                <span key={e} className="text-[10px] px-2 py-0.5 rounded-full bg-surface-2 border border-border text-muted">{e}</span>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between text-xs">
              <span className="flex items-center gap-1 text-amber"><Star className="size-3 fill-amber" /> {m.rating}</span>
              <span className="text-muted flex items-center gap-1"><Clock className="size-3" /> ~{m.responseHrs}h response</span>
              <span className={m.pricePerHour === 0 ? "text-emerald font-medium" : "text-foreground"}>{m.pricePerHour === 0 ? "Pro-bono" : `$${m.pricePerHour}/hr`}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
