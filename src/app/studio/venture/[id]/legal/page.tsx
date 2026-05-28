"use client";

import { use, useEffect, useState } from "react";
import { notFound } from "next/navigation";
import { useStore } from "@/store";
import { Card, Button, Input, Badge } from "@/components/ui";
import { Scale, CheckCircle2, AlertTriangle, ExternalLink, Save, Shield, FileText, Users } from "lucide-react";

type Legal = {
  incorporated?: boolean;
  jurisdiction?: string;
  incorporationDate?: string;
  cofounderAgreement?: boolean;
  ipAssignment?: boolean;
  vestingApplied?: boolean;
  ndaTemplate?: boolean;
  privacyPolicy?: boolean;
  termsOfService?: boolean;
};

// Jurisdiction guides — Africa-first, plus the global standards African
// founders most often choose for international fundraising.
const JURISDICTIONS = [
  {
    code: "GH-LTD",
    name: "Ghana — Limited by Shares",
    registrar: "Registrar General's Department (RGD)",
    costUsd: 100,
    timelineDays: 5,
    pros: ["Cheap, fast", "Domestic operating entity", "Mobile-money friendly"],
    cons: ["VCs often want offshore parent", "Equity transfers slower"],
    when: "MVP & first revenue in Ghana. Pair with a Delaware C-Corp parent later if raising USD.",
    url: "https://rgd.gov.gh",
  },
  {
    code: "KE-LTD",
    name: "Kenya — Private Limited Company",
    registrar: "Business Registration Service (BRS) eCitizen",
    costUsd: 60,
    timelineDays: 3,
    pros: ["Fully online via eCitizen", "Active angel/VC ecosystem", "Same-day reservation"],
    cons: ["KRA-PIN required before launch", "Annual returns mandatory"],
    when: "Operating in East Africa. Solid for Series A on Mauritius/Kenya stack.",
    url: "https://ecitizen.go.ke",
  },
  {
    code: "NG-LTD",
    name: "Nigeria — Private Company Limited by Shares",
    registrar: "Corporate Affairs Commission (CAC)",
    costUsd: 90,
    timelineDays: 7,
    pros: ["Largest African market", "Strong fintech regulator clarity post-2023"],
    cons: ["Forex controls", "Slow tax compliance"],
    when: "Nigerian market focus. Tier-with offshore for international raise.",
    url: "https://cac.gov.ng",
  },
  {
    code: "ZA-PTY",
    name: "South Africa — Private Company (Pty) Ltd",
    registrar: "Companies and Intellectual Property Commission (CIPC)",
    costUsd: 50,
    timelineDays: 7,
    pros: ["Strong contract law", "Mature financial services regulation"],
    cons: ["Exchange controls (SARB approval for offshore parent)", "Tax residency rules tight"],
    when: "SA-focused B2B SaaS or fintech.",
    url: "https://cipc.co.za",
  },
  {
    code: "RW-LTD",
    name: "Rwanda — Domestic Company",
    registrar: "Rwanda Development Board (RDB)",
    costUsd: 0,
    timelineDays: 1,
    pros: ["Free incorporation in 6 hours", "Tax holidays for export-focused startups", "Easy IP regime"],
    cons: ["Smaller domestic market"],
    when: "Pan-African digital startup with low admin overhead.",
    url: "https://rdb.rw",
  },
  {
    code: "MU-GBC",
    name: "Mauritius — Global Business Company (GBC)",
    registrar: "Financial Services Commission",
    costUsd: 2500,
    timelineDays: 30,
    pros: ["Holding company for African operations", "Double-tax treaties with 40+ countries", "VC-friendly"],
    cons: ["Costly", "Substance requirements"],
    when: "Series A+ with multi-country ops. Most common holdco for African VCs.",
    url: "https://fscmauritius.org",
  },
  {
    code: "US-DE",
    name: "United States — Delaware C-Corp",
    registrar: "Delaware Division of Corporations",
    costUsd: 500,
    timelineDays: 2,
    pros: ["Standard for US-style VC", "YC-compatible SAFE", "Familiar to global investors"],
    cons: ["US tax obligations", "Costly annual fees & franchise tax"],
    when: "Raising USD from US/global VCs. Stripe Atlas does the paperwork.",
    url: "https://corp.delaware.gov",
  },
];

export default function LegalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { ventures, updateVenture } = useStore();
  const found = ventures.find((x) => x.id === id);

  const [legal, setLegal] = useState<Legal>({});
  const [picked, setPicked] = useState<string>("GH-LTD");

  useEffect(() => {
    if (!found) return;
    setLegal(found.legal ?? {});
    if (found.legal?.jurisdiction) {
      const m = JURISDICTIONS.find((j) => j.name === found.legal?.jurisdiction);
      if (m) setPicked(m.code);
    }
  }, [found?.id]);

  if (!found) { notFound(); return null; }
  const v = found;

  function save() {
    const j = JURISDICTIONS.find((x) => x.code === picked);
    updateVenture(v.id, { legal: { ...legal, jurisdiction: j?.name } });
  }
  function toggle(key: keyof Legal) { setLegal({ ...legal, [key]: !legal[key] }); }

  const sel = JURISDICTIONS.find((j) => j.code === picked) ?? JURISDICTIONS[0];

  const checklist: { key: keyof Legal; label: string; help: string; icon: typeof Shield }[] = [
    { key: "incorporated", label: "Company incorporated", help: "Picked the jurisdiction. Filed papers. Got the certificate.", icon: FileText },
    { key: "cofounderAgreement", label: "Co-founder agreement signed", help: "Equity split, roles, decision rights, vesting, what happens if someone leaves.", icon: Users },
    { key: "ipAssignment", label: "IP assignment from all founders", help: "Every line of code & every customer relationship belongs to the company, not to individuals.", icon: Shield },
    { key: "vestingApplied", label: "Vesting applied (4yr / 1yr cliff)", help: "Standard. Without it, you lose half the company the day someone walks.", icon: Users },
    { key: "ndaTemplate", label: "NDA template ready", help: "Use sparingly — but have one for hardware specs, customer data, etc.", icon: FileText },
    { key: "privacyPolicy", label: "Privacy policy live on site", help: "Required by law in most jurisdictions. GDPR matters even for African users in some sectors.", icon: Shield },
    { key: "termsOfService", label: "Terms of service live on site", help: "Limits liability, sets dispute resolution, defines what the service is.", icon: FileText },
  ];
  const done = checklist.filter((c) => legal[c.key]).length;

  return (
    <div className="max-w-6xl mx-auto px-5 sm:px-8 py-10 space-y-6">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-emerald mb-1 flex items-center gap-1.5">
            <Scale className="size-3.5" /> Legal & incorporation
          </p>
          <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold">{done} of {checklist.length} legal milestones complete</h2>
          <p className="text-sm text-muted mt-1 max-w-2xl">Pick your jurisdiction, work the checklist, get advice from a lawyer for anything that touches equity.</p>
        </div>
        <Button onClick={save}><Save className="size-4" /> Save</Button>
      </header>

      {/* Jurisdiction picker */}
      <Card className="p-6">
        <h3 className="font-medium mb-3">Where will you incorporate?</h3>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 mb-5">
          {JURISDICTIONS.map((j) => (
            <button
              key={j.code}
              onClick={() => setPicked(j.code)}
              className={`text-left rounded-xl border p-3 transition ${picked === j.code ? "border-emerald bg-emerald/10" : "border-border hover:border-muted bg-surface-2/40"}`}
            >
              <div className="font-medium text-sm">{j.name}</div>
              <div className="text-[10px] text-muted mt-0.5">{j.registrar}</div>
              <div className="mt-2 flex gap-2 text-[10px]">
                <Badge color="muted">~${j.costUsd}</Badge>
                <Badge color="muted">{j.timelineDays}d</Badge>
              </div>
            </button>
          ))}
        </div>

        <div className="rounded-2xl border border-emerald/30 bg-emerald/5 p-5">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
            <div>
              <div className="font-medium">{sel.name}</div>
              <div className="text-xs text-muted">{sel.registrar} · ~${sel.costUsd} · {sel.timelineDays} days</div>
            </div>
            <a href={sel.url} target="_blank" rel="noopener" className="text-xs inline-flex items-center gap-1 text-emerald hover:text-amber">
              Open registrar <ExternalLink className="size-3" />
            </a>
          </div>
          <p className="text-sm text-foreground/90 mb-3"><strong className="text-emerald">When to pick:</strong> {sel.when}</p>
          <div className="grid sm:grid-cols-2 gap-3 text-xs">
            <div>
              <div className="text-emerald uppercase tracking-widest text-[10px] mb-1">Pros</div>
              <ul className="space-y-0.5">{sel.pros.map((p) => (<li key={p} className="flex gap-1.5"><CheckCircle2 className="size-3 text-emerald shrink-0 mt-0.5" />{p}</li>))}</ul>
            </div>
            <div>
              <div className="text-rust uppercase tracking-widest text-[10px] mb-1">Cons</div>
              <ul className="space-y-0.5">{sel.cons.map((p) => (<li key={p} className="flex gap-1.5"><AlertTriangle className="size-3 text-rust shrink-0 mt-0.5" />{p}</li>))}</ul>
            </div>
          </div>
        </div>

        <div className="mt-4 grid sm:grid-cols-2 gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted mb-1">Incorporation date</div>
            <Input type="date" value={legal.incorporationDate ?? ""} onChange={(e) => setLegal({ ...legal, incorporationDate: e.target.value })} />
          </div>
        </div>
      </Card>

      {/* Checklist */}
      <Card className="p-6">
        <h3 className="font-medium mb-4">Founder legal checklist</h3>
        <div className="space-y-2">
          {checklist.map((c) => {
            const Icon = c.icon;
            const checked = !!legal[c.key];
            return (
              <button
                key={c.key}
                onClick={() => toggle(c.key)}
                className={`w-full text-left flex items-start gap-3 rounded-xl border p-4 transition ${checked ? "border-emerald/40 bg-emerald/5" : "border-border hover:border-muted"}`}
              >
                <Icon className={`size-4 mt-0.5 shrink-0 ${checked ? "text-emerald" : "text-muted"}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium flex items-center gap-2">
                    {c.label}
                    {checked && <CheckCircle2 className="size-3.5 text-emerald" />}
                  </div>
                  <p className="text-xs text-muted mt-1 leading-relaxed">{c.help}</p>
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="text-xs uppercase tracking-[0.22em] text-rust mb-3">Disclaimer</h3>
        <p className="text-sm text-muted leading-relaxed">
          This checklist is a founder&apos;s map, not legal advice. Every item that touches equity (founder
          split, vesting, ESOP, SAFE, term sheet) deserves an hour with a startup lawyer in your jurisdiction.
          Most of them will spend that hour for free if you&apos;re reaching out cold from a Sankofa profile.
        </p>
      </Card>
    </div>
  );
}
