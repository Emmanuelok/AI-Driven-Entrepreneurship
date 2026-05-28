"use client";

import { use, useMemo, useState } from "react";
import { notFound } from "next/navigation";
import { useStore } from "@/store";
import { FUNDING } from "@/lib/funding";
import { Card, Badge, Button, Input, Dialog } from "@/components/ui";
import { Wallet, Calendar, ExternalLink, Sparkles, Search, Plus, FileText, PieChart as PieIcon, Briefcase, Copy, Trash2 } from "lucide-react";

type InvestorStage = "researching" | "intro" | "first-meet" | "diligence" | "term-sheet" | "closed" | "passed";
type Investor = {
  id: string;
  name: string;
  firm: string;
  stage: InvestorStage;
  checkSizeUsd?: number;
  lastContact?: string;
  notes?: string;
  type?: "angel" | "vc" | "grant" | "accelerator" | "strategic";
};

const STAGES: { id: InvestorStage; label: string; color: "muted" | "amber" | "emerald" | "rust" | "indigo" }[] = [
  { id: "researching", label: "Researching", color: "muted" },
  { id: "intro", label: "Intro sent", color: "indigo" },
  { id: "first-meet", label: "First meeting", color: "amber" },
  { id: "diligence", label: "Diligence", color: "amber" },
  { id: "term-sheet", label: "Term sheet", color: "emerald" },
  { id: "closed", label: "Closed", color: "emerald" },
  { id: "passed", label: "Passed", color: "rust" },
];

export default function FundraisePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { ventures, updateVenture, notify, unlockBadge } = useStore();
  const [activeView, setActiveView] = useState<"crm" | "captable" | "safe" | "grants">("crm");
  const found = ventures.find((x) => x.id === id);
  if (!found) { notFound(); return null; }
  const v = found;

  return (
    <div className="max-w-7xl mx-auto px-5 sm:px-8 py-10 space-y-6">
      <header>
        <p className="text-xs uppercase tracking-[0.22em] text-rust mb-1 flex items-center gap-1.5">
          <Wallet className="size-3.5" /> Phase 5 — Fundraise
        </p>
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold">
              ${v.fundingRaised.toLocaleString()} <span className="text-muted text-base font-normal">raised / pipelined of ${v.fundingTarget.toLocaleString()} goal</span>
            </h2>
            <div className="mt-3 h-2 bg-surface-2 rounded-full overflow-hidden max-w-md">
              <div className="h-full bg-gradient-to-r from-emerald to-amber transition-all" style={{ width: `${Math.min((v.fundingRaised / v.fundingTarget) * 100, 100)}%` }} />
            </div>
          </div>
        </div>
      </header>

      <div className="flex gap-1 overflow-x-auto pb-1 border-b border-border">
        {([
          { id: "crm", label: "Investor CRM", icon: Briefcase },
          { id: "captable", label: "Cap table", icon: PieIcon },
          { id: "safe", label: "SAFE generator", icon: FileText },
          { id: "grants", label: "Grants & accelerators", icon: Sparkles },
        ] as const).map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveView(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs whitespace-nowrap transition border-b-2 ${activeView === t.id ? "border-emerald text-emerald" : "border-transparent text-muted hover:text-foreground"}`}
          >
            <t.icon className="size-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {activeView === "crm" && <InvestorCRM venture={v} onSave={(investors) => updateVenture(v.id, { investors })} />}
      {activeView === "captable" && <CapTable venture={v} onSave={(capTable) => updateVenture(v.id, { capTable })} />}
      {activeView === "safe" && <SafeGenerator venture={v} onSave={(safeTemplates) => updateVenture(v.id, { safeTemplates })} />}
      {activeView === "grants" && (
        <GrantsList onApply={(name, amount) => {
          updateVenture(v.id, { fundingRaised: v.fundingRaised + amount });
          unlockBadge("grant-applied");
          notify({ title: `Application logged: ${name}`, body: `+$${amount.toLocaleString()} added to pipeline.` });
        }} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Investor CRM — kanban-style pipeline
// ─────────────────────────────────────────────────────────────────────────
function InvestorCRM({ venture, onSave }: { venture: { investors?: Investor[] }; onSave: (inv: Investor[]) => void }) {
  const investors = venture.investors ?? [];
  const [adding, setAdding] = useState(false);

  function setStage(id: string, stage: InvestorStage) {
    onSave(investors.map((i) => (i.id === id ? { ...i, stage, lastContact: new Date().toISOString().slice(0, 10) } : i)));
  }
  function remove(id: string) { onSave(investors.filter((i) => i.id !== id)); }
  function add(payload: Omit<Investor, "id">) {
    onSave([...investors, { id: Math.random().toString(36).slice(2, 8), ...payload }]);
    setAdding(false);
  }
  const totalCommitted = investors.filter((i) => i.stage === "closed").reduce((s, i) => s + (i.checkSizeUsd ?? 0), 0);
  const totalSoft = investors.filter((i) => ["diligence", "term-sheet"].includes(i.stage)).reduce((s, i) => s + (i.checkSizeUsd ?? 0), 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-2 flex-wrap text-sm">
          <Badge color="emerald">${totalCommitted.toLocaleString()} closed</Badge>
          <Badge color="amber">${totalSoft.toLocaleString()} in diligence + TS</Badge>
          <Badge color="muted">{investors.length} contacts</Badge>
        </div>
        <Button onClick={() => setAdding(true)}><Plus className="size-4" /> Add investor</Button>
      </div>

      <div className="grid grid-flow-col auto-cols-[minmax(170px,1fr)] lg:grid-flow-row lg:auto-cols-auto lg:grid-cols-7 gap-3 overflow-x-auto pb-2">
        {STAGES.map((stg) => {
          const items = investors.filter((i) => i.stage === stg.id);
          return (
            <div key={stg.id} className="rounded-2xl border border-border bg-surface-2/30 p-3 min-w-[170px]">
              <div className="flex items-center justify-between mb-3">
                <Badge color={stg.color}>{stg.label}</Badge>
                <span className="text-[10px] text-muted">{items.length}</span>
              </div>
              <div className="space-y-2">
                {items.map((inv) => (
                  <div key={inv.id} className="group rounded-xl border border-border bg-surface p-2.5">
                    <div className="font-medium text-sm leading-snug">{inv.name}</div>
                    <div className="text-[10px] text-muted">{inv.firm}{inv.type ? ` · ${inv.type}` : ""}</div>
                    {inv.checkSizeUsd && (<div className="mt-1 font-mono text-xs text-emerald">${inv.checkSizeUsd.toLocaleString()}</div>)}
                    {inv.notes && (<div className="mt-1 text-[10px] text-muted line-clamp-2">{inv.notes}</div>)}
                    <div className="mt-2 flex items-center justify-between opacity-0 group-hover:opacity-100 transition">
                      <select value={inv.stage} onChange={(e) => setStage(inv.id, e.target.value as InvestorStage)} className="text-[10px] bg-surface-2 border border-border rounded px-1.5 py-0.5 outline-none focus:border-emerald">
                        {STAGES.map((s) => (<option key={s.id} value={s.id}>{s.label}</option>))}
                      </select>
                      <button onClick={() => remove(inv.id)} className="text-muted hover:text-rust"><Trash2 className="size-3" /></button>
                    </div>
                  </div>
                ))}
                {items.length === 0 && <div className="text-[10px] text-muted text-center py-3 italic">empty</div>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Outreach tips */}
      <Card className="p-5">
        <h3 className="text-xs uppercase tracking-[0.22em] text-emerald mb-3">Outreach playbook</h3>
        <ul className="text-sm text-muted space-y-1.5 leading-relaxed">
          <li>· Warm intro &gt;&gt;&gt; cold email. Find the partner who already backs an analogous company.</li>
          <li>· The first email is 4 lines max: <em>traction → ask → why-them → calendar link.</em></li>
          <li>· Move stage forward only on real signal. &ldquo;Sounds interesting&rdquo; ≠ first meeting.</li>
          <li>· Africa: lead with cash-on-hand, not valuation. Diaspora angels close on momentum.</li>
        </ul>
      </Card>

      <Dialog open={adding} onClose={() => setAdding(false)} title="Add an investor" size="lg">
        <AddInvestorForm onSubmit={add} />
      </Dialog>
    </div>
  );
}

function AddInvestorForm({ onSubmit }: { onSubmit: (i: Omit<Investor, "id">) => void }) {
  const [name, setName] = useState("");
  const [firm, setFirm] = useState("");
  const [check, setCheck] = useState("");
  const [type, setType] = useState<NonNullable<Investor["type"]>>("angel");
  const [stage, setStage] = useState<InvestorStage>("researching");
  const [notes, setNotes] = useState("");

  return (
    <div className="space-y-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <Input placeholder="Investor name (person)" value={name} onChange={(e) => setName(e.target.value)} />
        <Input placeholder="Firm / fund / family office" value={firm} onChange={(e) => setFirm(e.target.value)} />
        <Input placeholder="Target check size (USD)" type="number" value={check} onChange={(e) => setCheck(e.target.value)} />
        <select value={type} onChange={(e) => setType(e.target.value as typeof type)} className="bg-surface-2 border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-emerald">
          <option value="angel">Angel</option>
          <option value="vc">VC</option>
          <option value="grant">Grant</option>
          <option value="accelerator">Accelerator</option>
          <option value="strategic">Strategic / corporate</option>
        </select>
        <select value={stage} onChange={(e) => setStage(e.target.value as InvestorStage)} className="bg-surface-2 border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-emerald">
          {STAGES.map((s) => (<option key={s.id} value={s.id}>{s.label}</option>))}
        </select>
      </div>
      <textarea placeholder="Notes — thesis fit, intro path, last touch…" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="w-full bg-surface-2 border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-emerald" />
      <div className="flex justify-end">
        <Button onClick={() => name.trim() && onSubmit({ name, firm, stage, type, checkSizeUsd: check ? parseFloat(check) : undefined, notes, lastContact: new Date().toISOString().slice(0, 10) })} disabled={!name.trim()}>
          Add to pipeline
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Cap Table simulator
// ─────────────────────────────────────────────────────────────────────────
type Round = { id: string; name: string; date?: string; amountUsd: number; preMoneyUsd: number; instrument: "SAFE" | "Equity" | "Convertible" | "Grant"; valuationCapUsd?: number; discountPct?: number };
type CapData = { rounds: Round[]; esopPct?: number };

function CapTable({ venture, onSave }: { venture: { team?: { name: string; role: string; equityPct?: number }[]; capTable?: CapData }; onSave: (c: CapData) => void }) {
  const initial: CapData = venture.capTable ?? { rounds: [], esopPct: 10 };
  const [rounds, setRounds] = useState<Round[]>(initial.rounds);
  const [esop, setEsop] = useState<number>(initial.esopPct ?? 10);

  const founders = venture.team?.filter((t) => (t.equityPct ?? 0) > 0) ?? [];
  const founderTotal = founders.reduce((s, f) => s + (f.equityPct ?? 0), 0);

  // Compute ownership after each round (simple post-money math, SAFE treated as equity at cap)
  const ownership = useMemo(() => {
    let founderShare = founderTotal / 100; // 0..1
    let esopShare = esop / 100;
    const rows: { round: string; founders: number; esop: number; newInvestors: number; postMoney: number; pricePerShare?: number }[] = [];
    rows.push({ round: "Pre-financing", founders: founderShare, esop: esopShare, newInvestors: 0, postMoney: 0 });

    let lastPost = 0;
    for (const r of rounds) {
      const pre = r.instrument === "SAFE" ? (r.valuationCapUsd ?? r.preMoneyUsd) : r.preMoneyUsd;
      const post = pre + r.amountUsd;
      const newOwn = r.amountUsd / post; // 0..1
      // dilute existing
      const survival = 1 - newOwn;
      founderShare = founderShare * survival;
      esopShare = esopShare * survival;
      const prior = rows[rows.length - 1];
      const otherPrior = Math.max(0, 1 - prior.founders - prior.esop - prior.newInvestors);
      const otherDiluted = otherPrior * survival;
      rows.push({
        round: r.name,
        founders: founderShare,
        esop: esopShare,
        newInvestors: prior.newInvestors * survival + newOwn,
        postMoney: post,
        pricePerShare: post / 10_000_000, // assume 10M shares outstanding for display
      });
      void otherDiluted; // placeholder for accuracy if other-prior modelling expands
      lastPost = post;
    }
    void lastPost;
    return rows;
  }, [rounds, esop, founderTotal]);

  function addRound() {
    setRounds([...rounds, { id: Math.random().toString(36).slice(2, 8), name: `Round ${rounds.length + 1}`, amountUsd: 100_000, preMoneyUsd: 1_000_000, instrument: "SAFE", valuationCapUsd: 1_500_000 }]);
  }
  function update(rid: string, patch: Partial<Round>) {
    setRounds(rounds.map((r) => (r.id === rid ? { ...r, ...patch } : r)));
  }
  function remove(rid: string) { setRounds(rounds.filter((r) => r.id !== rid)); }
  function save() { onSave({ rounds, esopPct: esop }); }

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <h3 className="text-sm font-medium mb-3">Starting position</h3>
        <div className="grid sm:grid-cols-3 gap-3 text-sm">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted mb-1">Founder equity (total)</div>
            <div className="font-mono text-2xl text-emerald">{founderTotal || 100}%</div>
            <div className="text-[10px] text-muted mt-1">{founders.length || "Add team members"} founder{founders.length === 1 ? "" : "s"} · set % on Overview &gt; Team</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted mb-1">ESOP pool (target)</div>
            <Input type="number" value={esop} onChange={(e) => setEsop(parseFloat(e.target.value) || 0)} />
            <div className="text-[10px] text-muted mt-1">10% pre-seed · 15% by Series A is standard</div>
          </div>
          <div className="flex items-end">
            <Button onClick={save} className="ml-auto">Save cap table</Button>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-medium">Funding rounds</h3>
          <Button size="sm" variant="secondary" onClick={addRound}><Plus className="size-3" /> Add round</Button>
        </div>
        {rounds.length === 0 ? (
          <p className="text-sm text-muted italic">No rounds modeled yet. Add a SAFE or priced round to see dilution.</p>
        ) : (
          <div className="space-y-3">
            {rounds.map((r) => (
              <div key={r.id} className="grid sm:grid-cols-6 gap-2 items-end p-3 border border-border rounded-xl">
                <div className="sm:col-span-1">
                  <div className="text-[10px] uppercase tracking-widest text-muted mb-1">Name</div>
                  <Input value={r.name} onChange={(e) => update(r.id, { name: e.target.value })} />
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-muted mb-1">Type</div>
                  <select value={r.instrument} onChange={(e) => update(r.id, { instrument: e.target.value as Round["instrument"] })} className="bg-surface-2 border border-border rounded-xl px-3 py-2 text-sm w-full outline-none focus:border-emerald">
                    <option value="SAFE">SAFE</option>
                    <option value="Convertible">Convertible note</option>
                    <option value="Equity">Priced equity</option>
                    <option value="Grant">Grant (no dilution)</option>
                  </select>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-muted mb-1">Amount (USD)</div>
                  <Input type="number" value={r.amountUsd} onChange={(e) => update(r.id, { amountUsd: parseFloat(e.target.value) || 0 })} />
                </div>
                {r.instrument === "SAFE" ? (
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-muted mb-1">Cap (USD)</div>
                    <Input type="number" value={r.valuationCapUsd ?? 0} onChange={(e) => update(r.id, { valuationCapUsd: parseFloat(e.target.value) || 0 })} />
                  </div>
                ) : (
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-muted mb-1">Pre-money</div>
                    <Input type="number" value={r.preMoneyUsd} onChange={(e) => update(r.id, { preMoneyUsd: parseFloat(e.target.value) || 0 })} />
                  </div>
                )}
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-muted mb-1">Date</div>
                  <Input type="date" value={r.date ?? ""} onChange={(e) => update(r.id, { date: e.target.value })} />
                </div>
                <button onClick={() => remove(r.id)} className="text-muted hover:text-rust text-xs flex items-center gap-1 justify-self-end">
                  <Trash2 className="size-3" /> Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-5">
        <h3 className="font-medium mb-3">Ownership trajectory</h3>
        <div className="overflow-x-auto -mx-5 px-5">
        <table className="w-full text-sm min-w-[520px]">
          <thead className="text-xs text-muted uppercase tracking-widest">
            <tr>
              <th className="text-left py-2">Round</th>
              <th className="text-right py-2">Post-money</th>
              <th className="text-right py-2">Founders</th>
              <th className="text-right py-2">ESOP</th>
              <th className="text-right py-2">Investors</th>
            </tr>
          </thead>
          <tbody>
            {ownership.map((o, i) => (
              <tr key={i} className="border-t border-border">
                <td className="py-2 font-medium">{o.round}</td>
                <td className="py-2 text-right font-mono">{o.postMoney ? `$${o.postMoney.toLocaleString()}` : "—"}</td>
                <td className="py-2 text-right font-mono text-emerald">{(o.founders * 100).toFixed(1)}%</td>
                <td className="py-2 text-right font-mono text-amber">{(o.esop * 100).toFixed(1)}%</td>
                <td className="py-2 text-right font-mono text-indigo">{(o.newInvestors * 100).toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        <p className="text-[10px] text-muted mt-3">Simplified model: SAFEs converted at cap, no anti-dilution provisions, ESOP carved pre-money. Use this for napkin math, not legal docs.</p>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// SAFE generator (Y Combinator post-money SAFE, plain text)
// ─────────────────────────────────────────────────────────────────────────
function SafeGenerator({ venture, onSave }: { venture: { name: string; safeTemplates?: { id: string; investor: string; amount: number; cap?: number; discountPct?: number; postMoney: boolean; created: string }[] }; onSave: (s: NonNullable<typeof venture.safeTemplates>) => void }) {
  const [investor, setInvestor] = useState("");
  const [amount, setAmount] = useState("25000");
  const [cap, setCap] = useState("3000000");
  const [discount, setDiscount] = useState("");
  const [postMoney, setPostMoney] = useState(true);
  const stored = venture.safeTemplates ?? [];

  const safeText = useMemo(() => generateSafeText({
    company: venture.name,
    investor: investor || "[Investor Name]",
    amount: parseFloat(amount) || 0,
    cap: cap ? parseFloat(cap) : undefined,
    discount: discount ? parseFloat(discount) : undefined,
    postMoney,
  }), [venture.name, investor, amount, cap, discount, postMoney]);

  function persist() {
    const next = [...stored, {
      id: Math.random().toString(36).slice(2, 8),
      investor: investor || "Unnamed",
      amount: parseFloat(amount) || 0,
      cap: cap ? parseFloat(cap) : undefined,
      discountPct: discount ? parseFloat(discount) : undefined,
      postMoney,
      created: new Date().toISOString().slice(0, 10),
    }];
    onSave(next);
  }
  function copy() { navigator.clipboard.writeText(safeText); }

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <h3 className="font-medium mb-1">YC-style SAFE generator</h3>
        <p className="text-xs text-muted mb-4">Generates a plain-text SAFE for review. <strong className="text-rust">Have a lawyer sign off before counterparty execution.</strong> Use only for pre-seed rounds &lt; $1M total.</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted mb-1">Investor / fund name</div>
            <Input value={investor} onChange={(e) => setInvestor(e.target.value)} placeholder="Acme Angels LP" />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted mb-1">Amount (USD)</div>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted mb-1">Valuation cap (USD)</div>
            <Input type="number" value={cap} onChange={(e) => setCap(e.target.value)} placeholder="3000000" />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted mb-1">Discount % (optional)</div>
            <Input type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="20" />
          </div>
          <div className="sm:col-span-2 flex items-center gap-3 text-sm">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={postMoney} onChange={(e) => setPostMoney(e.target.checked)} className="accent-emerald" />
              <span>Post-money SAFE (default since 2018)</span>
            </label>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium">Generated SAFE</h3>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={copy}><Copy className="size-3" /> Copy</Button>
            <Button size="sm" onClick={persist}><Plus className="size-3" /> Save to data room</Button>
          </div>
        </div>
        <pre className="text-xs bg-[#06100d] border border-border rounded-xl p-4 overflow-x-auto whitespace-pre-wrap font-[family-name:var(--font-mono)] leading-relaxed">{safeText}</pre>
      </Card>

      {stored.length > 0 && (
        <Card className="p-5">
          <h3 className="font-medium mb-3">Saved SAFEs</h3>
          <table className="w-full text-sm">
            <thead className="text-xs text-muted uppercase tracking-widest">
              <tr>
                <th className="text-left py-2">Investor</th>
                <th className="text-right py-2">Amount</th>
                <th className="text-right py-2">Cap</th>
                <th className="text-right py-2">Discount</th>
                <th className="text-right py-2">Created</th>
              </tr>
            </thead>
            <tbody>
              {stored.map((s) => (
                <tr key={s.id} className="border-t border-border">
                  <td className="py-2">{s.investor}</td>
                  <td className="py-2 text-right font-mono text-emerald">${s.amount.toLocaleString()}</td>
                  <td className="py-2 text-right font-mono">{s.cap ? `$${s.cap.toLocaleString()}` : "—"}</td>
                  <td className="py-2 text-right font-mono">{s.discountPct ? `${s.discountPct}%` : "—"}</td>
                  <td className="py-2 text-right text-xs text-muted">{s.created}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

function generateSafeText(opts: { company: string; investor: string; amount: number; cap?: number; discount?: number; postMoney: boolean }) {
  const flavor = opts.postMoney ? "POST-MONEY" : "PRE-MONEY";
  return `SIMPLE AGREEMENT FOR FUTURE EQUITY (${flavor})

THIS INSTRUMENT AND ANY SECURITIES ISSUABLE PURSUANT HERETO HAVE NOT BEEN
REGISTERED UNDER THE SECURITIES ACT OF 1933 (THE "SECURITIES ACT"), OR UNDER
THE SECURITIES LAWS OF CERTAIN STATES. THESE SECURITIES MAY NOT BE OFFERED,
SOLD OR OTHERWISE TRANSFERRED, PLEDGED OR HYPOTHECATED EXCEPT AS PERMITTED
UNDER THE ACT AND APPLICABLE STATE SECURITIES LAWS.

${opts.company.toUpperCase()}
SAFE (Simple Agreement for Future Equity)

THIS CERTIFIES THAT in exchange for the payment by ${opts.investor} (the
"Investor") of $${opts.amount.toLocaleString()} (the "Purchase Amount") on or
about ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })},
${opts.company} (the "Company"), hereby issues to the Investor the right to
certain shares of the Company's Capital Stock, subject to the terms set forth
below.

${opts.cap ? `Post-Money Valuation Cap: $${opts.cap.toLocaleString()}` : "Valuation Cap: None"}
${opts.discount ? `Discount Rate: ${(100 - opts.discount).toFixed(0)}% of the price per share of Standard Preferred Stock` : "Discount: None"}

1. EVENTS
   (a) Equity Financing. If there is an Equity Financing before the
       termination of this Safe, on the initial closing of such Equity
       Financing, this Safe will automatically convert into the number of
       shares of Safe Preferred Stock equal to the Purchase Amount divided
       by the Conversion Price.

   (b) Liquidity Event. If there is a Liquidity Event before the
       termination of this Safe, the Investor will, at its option, either
       (i) receive a cash payment equal to the Purchase Amount or (ii)
       automatically receive from the Company a number of shares of Common
       Stock equal to the Purchase Amount divided by the Liquidity Price.

   (c) Dissolution Event. If there is a Dissolution Event before this Safe
       terminates, the Company will pay an amount equal to the Purchase
       Amount, due and payable to the Investor immediately prior to such
       Dissolution Event.

2. DEFINITIONS  [Standard YC SAFE definitions — full text at ycombinator.com/documents]

3. COMPANY REPRESENTATIONS  [Standard]

4. INVESTOR REPRESENTATIONS  [Standard]

5. MISCELLANEOUS  [Standard]

IN WITNESS WHEREOF, the undersigned have caused this Safe to be duly executed
and delivered.

COMPANY: ${opts.company}
By: ______________________________
Name: ____________________________
Title: ___________________________

INVESTOR: ${opts.investor}
By: ______________________________
Name: ____________________________

— Generated by Sankofa Venture Studio. Have counsel review before signing. —`;
}

// ─────────────────────────────────────────────────────────────────────────
// Grants & accelerators
// ─────────────────────────────────────────────────────────────────────────
function GrantsList({ onApply }: { onApply: (name: string, amount: number) => void }) {
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [q, setQ] = useState("");
  const matched = useMemo(() => FUNDING.filter((f) => {
    if (stageFilter !== "all" && !f.stage.includes(stageFilter as "Idea" | "MVP" | "Revenue" | "Growth")) return false;
    if (q && !`${f.name} ${f.org} ${f.description}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }), [stageFilter, q]);

  return (
    <div className="space-y-4">
      <Card className="p-4 flex flex-wrap gap-2 items-center">
        <div className="flex items-center gap-2 flex-1 min-w-[200px] bg-surface-2 rounded-xl px-3 py-2 border border-border">
          <Search className="size-4 text-muted" />
          <input placeholder="Search grants, accelerators, competitions…" value={q} onChange={(e) => setQ(e.target.value)} className="flex-1 bg-transparent outline-none text-sm" />
        </div>
        <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)} className="bg-surface-2 border border-border rounded-xl px-3 py-2 text-sm outline-none focus:border-emerald">
          <option value="all">All stages</option>
          <option value="Idea">Idea</option>
          <option value="MVP">MVP</option>
          <option value="Revenue">Revenue</option>
          <option value="Growth">Growth</option>
        </select>
        <Badge color="muted">{matched.length} matched</Badge>
      </Card>

      <div className="grid sm:grid-cols-2 gap-3">
        {matched.map((f) => (
          <Card key={f.id} className="p-5">
            <div className="flex items-center justify-between gap-3 mb-2">
              <Badge color={f.type === "Grant" ? "emerald" : f.type === "Accelerator" ? "amber" : f.type === "Competition" ? "indigo" : "muted"}>{f.type}</Badge>
              <div className="flex gap-0.5" title={`Signal ${f.signal}/5`}>{Array.from({ length: 5 }).map((_, i) => (
                <span key={i} className={`size-1.5 rounded-full ${i < f.signal ? "bg-amber" : "bg-border"}`} />
              ))}</div>
            </div>
            <h3 className="font-[family-name:var(--font-display)] text-lg font-semibold leading-tight">{f.name}</h3>
            <div className="text-xs text-muted">{f.org}</div>
            <div className="mt-3 font-mono text-emerald">
              {f.amountMinUsd === f.amountMaxUsd ? `$${f.amountMinUsd.toLocaleString()}` : `$${f.amountMinUsd.toLocaleString()}–${f.amountMaxUsd.toLocaleString()}`}
              {f.equityPct ? <span className="text-rust"> for {f.equityPct}%</span> : <span className="text-emerald/70"> non-dilutive</span>}
            </div>
            <p className="mt-3 text-sm text-muted line-clamp-3">{f.description}</p>
            <div className="mt-4 flex items-center justify-between text-xs">
              <span className="text-muted flex items-center gap-1">
                <Calendar className="size-3" />
                {f.rolling ? "Rolling" : f.deadline ? `Deadline ${f.deadline}` : "TBA"}
              </span>
              <span className="text-muted">{f.stage.join(" · ")}</span>
            </div>
            <div className="mt-4 flex gap-2">
              <a href={f.applicationUrl} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-xs bg-surface-2 border border-border px-3 py-1.5 rounded-full hover:bg-surface transition">
                Open <ExternalLink className="size-3" />
              </a>
              <Button size="sm" onClick={() => onApply(f.name, f.amountMaxUsd)}>Mark applied</Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
