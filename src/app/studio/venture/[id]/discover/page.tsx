"use client";

import { Fragment, use, useState } from "react";
import { notFound } from "next/navigation";
import { useStore } from "@/store";
import { PROBLEMS } from "@/lib/problems";
import { Card, Button, Input, Textarea, Badge, Dialog, EmptyState } from "@/components/ui";
import { Users, Plus, Sparkles, CheckCircle2, AlertCircle, XCircle, Brain, FlaskConical, Quote, Search } from "lucide-react";
import { Markdown } from "@/components/markdown";
import { supabaseBrowser } from "@/lib/supabase";
import Link from "next/link";

type Cluster = { theme: string; count: number; evidence: string[] };
type Persona = { name: string; role: string; goals: string; pains: string; quote?: string };
type Synthesis = {
  clusters: Cluster[];
  personas: Persona[];
  willingness: { median: number; p25: number; p75: number; note?: string };
  verdict: "go" | "pivot" | "kill";
  verdictReason: string;
  nextThreeMoves: string[];
};

export default function DiscoverPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { ventures, addInterview, updateVenture } = useStore();
  const [adding, setAdding] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [script, setScript] = useState<{ category: string; q: string }[] | null>(null);
  const [syn, setSyn] = useState<Synthesis | null>(null);
  const [synthBusy, setSynthBusy] = useState(false);
  const [similarFor, setSimilarFor] = useState<string | null>(null);
  const [similar, setSimilar] = useState<Array<{ kind: string; ref_id: string; ref_url: string | null; title: string | null; body: string; similarity: number }>>([]);
  const [similarBusy, setSimilarBusy] = useState(false);

  const found = ventures.find((x) => x.id === id);
  if (!found) { notFound(); return null; }
  const v = found;

  async function generateScript() {
    setGenerating(true);
    try {
      const problem = v.problemId ? PROBLEMS.find((p) => p.id === v.problemId) : undefined;
      const res = await fetch("/api/generate/interview-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          problem: problem?.title ?? v.tagline ?? "the problem this venture solves",
          persona: v.canvas.Customer ?? v.wedge?.who ?? "the target customer",
          ventureName: v.name,
        }),
      });
      const data = await res.json();
      setScript(data.questions);
    } finally {
      setGenerating(false);
    }
  }

  // Pull similar interviews from across ALL the user's ventures via
  // the search_index. Surfaces patterns the local synthesizer misses
  // because it only sees one venture at a time.
  async function findSimilar(iv: { id: string; name: string; role: string; notes: string }) {
    setSimilarFor(iv.id);
    setSimilar([]);
    setSimilarBusy(true);
    try {
      const sb = supabaseBrowser();
      if (!sb) { setSimilarBusy(false); return; }
      const { data: { session } } = await sb.auth.getSession();
      if (!session) { setSimilarBusy(false); return; }
      const q = `${iv.name} (${iv.role}): ${iv.notes}`;
      const res = await fetch("/api/search/query", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ q, kind: "interview", limit: 6 }),
      });
      const data = await res.json();
      if (data.ok) {
        // Filter out the source interview itself.
        setSimilar((data.results || []).filter((r: { ref_id: string }) => !r.ref_id.endsWith(`:${iv.id}`)));
      }
    } finally {
      setSimilarBusy(false);
    }
  }

  async function synthesize() {
    setSynthBusy(true);
    try {
      const res = await fetch("/api/venture/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ventureName: v.name,
          tagline: v.tagline,
          canvas: v.canvas,
          interviews: v.interviews,
        }),
      });
      const data = await res.json();
      if (data.clusters) {
        setSyn(data);
        // Persist to venture
        updateVenture(v.id, {
          insightClusters: data.clusters.map((c: Cluster, i: number) => ({ id: `c${i}`, theme: c.theme, count: c.count, evidence: c.evidence })),
          personas: data.personas.map((p: Persona, i: number) => ({ id: `p${i}`, name: p.name, role: p.role, goals: p.goals, pains: p.pains, quote: p.quote })),
        });
      }
    } finally {
      setSynthBusy(false);
    }
  }

  const validated = v.interviews.filter((i) => i.verdict === "validated").length;
  const insight = v.interviews.filter((i) => i.verdict === "insight").length;
  const rejected = v.interviews.filter((i) => i.verdict === "rejected").length;
  const rate = v.interviews.length ? validated / v.interviews.length : 0;
  const wtps = v.interviews.map((i) => i.willingnessToPay).filter((n): n is number => typeof n === "number");
  const medianWtp = wtps.length ? wtps.sort((a, b) => a - b)[Math.floor(wtps.length / 2)] : 0;

  return (
    <div className="max-w-7xl mx-auto px-5 sm:px-8 py-10 space-y-6">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-emerald mb-1 flex items-center gap-1.5">
            <Users className="size-3.5" /> Phase 2 — Customer Discovery
          </p>
          <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold">{v.interviews.length} of {v.metrics.interviewsTarget} interviews</h2>
          <p className="text-sm text-muted mt-1">Validated <span className="text-emerald font-semibold">{validated}</span> · Insight <span className="text-amber font-semibold">{insight}</span> · Rejected <span className="text-rust font-semibold">{rejected}</span> · Median WTP <span className="text-emerald font-mono">${medianWtp}</span></p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={generateScript} disabled={generating}>
            <Sparkles className="size-4" /> {generating ? "Drafting…" : "Interview script"}
          </Button>
          <Button variant="secondary" onClick={synthesize} disabled={synthBusy || v.interviews.length < 3}>
            <Brain className="size-4" /> {synthBusy ? "Synthesizing…" : "Synthesize patterns"}
          </Button>
          <Button onClick={() => setAdding(true)}><Plus className="size-4" /> Log interview</Button>
        </div>
      </header>

      {/* Mom Test rubric — always visible reminder */}
      <Card className="p-5 bg-gradient-to-r from-emerald/10 to-amber/10 border-emerald/20">
        <div className="flex items-start gap-3">
          <FlaskConical className="size-5 text-emerald shrink-0 mt-0.5" />
          <div className="text-sm space-y-1">
            <div className="font-medium">The Mom Test — three rules every interview</div>
            <ul className="text-xs text-muted leading-relaxed space-y-0.5">
              <li>1. Talk about <strong>their</strong> life, not your idea.</li>
              <li>2. Ask about <strong>specific past behavior</strong>, never opinions about a hypothetical future.</li>
              <li>3. Talk less. <strong>Listen more.</strong> Silence pulls truth out.</li>
            </ul>
          </div>
        </div>
      </Card>

      {script && (
        <Card className="p-6 border border-emerald/30 bg-emerald/5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium flex items-center gap-2"><Sparkles className="size-4 text-emerald" /> 12-question discovery script</h3>
            <button onClick={() => setScript(null)} className="text-xs text-muted hover:text-foreground">Close</button>
          </div>
          <ol className="space-y-3">
            {script.map((s, i) => (
              <li key={i} className="flex gap-3">
                <span className="size-6 rounded-full bg-emerald/20 text-emerald font-mono text-xs flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-amber mb-0.5">{s.category}</div>
                  <Markdown src={s.q} />
                </div>
              </li>
            ))}
          </ol>
          <p className="text-xs text-muted mt-4">Use these as anchors — never as a script. Let the conversation breathe.</p>
        </Card>
      )}

      {syn && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-medium flex items-center gap-2"><Brain className="size-4 text-amber" /> Pattern synthesis</h3>
            <Badge color={syn.verdict === "go" ? "emerald" : syn.verdict === "pivot" ? "amber" : "rust"}>
              Verdict: {syn.verdict.toUpperCase()}
            </Badge>
          </div>
          <p className="text-sm text-foreground/90 leading-relaxed mb-5">{syn.verdictReason}</p>

          <div className="grid lg:grid-cols-2 gap-4 mb-5">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-emerald mb-2">Clusters</div>
              <div className="space-y-2">
                {syn.clusters.map((c, i) => (
                  <div key={i} className="rounded-xl border border-border bg-surface-2/40 p-3">
                    <div className="flex items-center justify-between">
                      <div className="font-medium text-sm">{c.theme}</div>
                      <Badge color="muted">{c.count} mentions</Badge>
                    </div>
                    <ul className="mt-2 space-y-1 text-xs text-muted italic">
                      {c.evidence.slice(0, 3).map((e, j) => (<li key={j}>— {e}</li>))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-amber mb-2">Personas</div>
              <div className="space-y-2">
                {syn.personas.map((p, i) => (
                  <div key={i} className="rounded-xl border border-border bg-surface-2/40 p-3">
                    <div className="font-medium text-sm">{p.name} <span className="text-muted text-xs">· {p.role}</span></div>
                    <div className="mt-1.5 text-xs"><strong className="text-emerald">Goals:</strong> {p.goals}</div>
                    <div className="text-xs"><strong className="text-rust">Pains:</strong> {p.pains}</div>
                    {p.quote && (<div className="mt-2 text-xs italic text-muted flex gap-1.5"><Quote className="size-3 shrink-0 mt-0.5" />&ldquo;{p.quote}&rdquo;</div>)}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-emerald/30 bg-emerald/5 p-4">
            <div className="text-[10px] uppercase tracking-widest text-emerald mb-2">Next 3 moves</div>
            <ol className="space-y-1.5 text-sm">
              {syn.nextThreeMoves.map((m, i) => (
                <li key={i} className="flex gap-2"><span className="font-mono text-emerald text-xs mt-0.5">0{i + 1}.</span><span>{m}</span></li>
              ))}
            </ol>
          </div>
        </Card>
      )}

      {v.interviews.length === 0 ? (
        <EmptyState icon={Users} title="No interviews yet" body="Talk to 20 real people before you build. Log each conversation here." action={<Button onClick={() => setAdding(true)}><Plus className="size-4" /> Log first interview</Button>} />
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-muted text-xs uppercase tracking-widest">
              <tr>
                <th className="text-left px-4 py-3">Person</th>
                <th className="text-left px-4 py-3">Role</th>
                <th className="text-left px-4 py-3">Notes / verdict</th>
                <th className="text-left px-4 py-3">WTP</th>
                <th className="text-left px-4 py-3">Date</th>
                <th className="text-left px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {v.interviews.map((iv) => (
                <Fragment key={iv.id}>
                <tr className="border-t border-border hover:bg-surface-2/40">
                  <td className="px-4 py-3 font-medium">{iv.name}</td>
                  <td className="px-4 py-3 text-muted">{iv.role}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-start gap-2">
                      {iv.verdict === "validated" && <CheckCircle2 className="size-4 text-emerald shrink-0 mt-0.5" />}
                      {iv.verdict === "insight" && <AlertCircle className="size-4 text-amber shrink-0 mt-0.5" />}
                      {iv.verdict === "rejected" && <XCircle className="size-4 text-rust shrink-0 mt-0.5" />}
                      <span>{iv.notes}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-emerald">{iv.willingnessToPay ? `$${iv.willingnessToPay}` : "—"}</td>
                  <td className="px-4 py-3 text-muted text-xs">{iv.date}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => similarFor === iv.id ? setSimilarFor(null) : findSimilar(iv)}
                      className="text-xs text-muted hover:text-emerald inline-flex items-center gap-1"
                      title="Find similar interviews across all your ventures"
                    >
                      <Search className="size-3" /> Similar
                    </button>
                  </td>
                </tr>
                {similarFor === iv.id && (
                  <tr className="border-t border-border bg-surface-2/30">
                    <td colSpan={6} className="px-4 py-3">
                      <div className="text-[10px] uppercase tracking-widest text-emerald mb-2 flex items-center gap-1.5">
                        <Search className="size-2.5" /> Similar interviews across your work
                      </div>
                      {similarBusy && <div className="text-xs text-muted italic">Searching…</div>}
                      {!similarBusy && similar.length === 0 && (
                        <div className="text-xs text-muted italic">No matches yet. Sign in + log more interviews to find patterns.</div>
                      )}
                      <div className="space-y-1.5">
                        {similar.map((s) => (
                          <Link
                            key={s.ref_id}
                            href={s.ref_url ?? "#"}
                            className="flex items-start gap-2 p-2 rounded-lg border border-border hover:border-emerald/40 hover:bg-surface text-xs"
                          >
                            <span className="font-mono text-emerald shrink-0">{(s.similarity * 100).toFixed(0)}%</span>
                            <div className="min-w-0">
                              <div className="font-medium truncate">{s.title}</div>
                              <div className="text-muted truncate">{s.body.slice(0, 140)}</div>
                            </div>
                          </Link>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Dialog open={adding} onClose={() => setAdding(false)} title="Log a discovery interview" size="lg">
        <AddInterviewForm onSubmit={(iv) => { addInterview(v.id, iv); setAdding(false); }} />
      </Dialog>
    </div>
  );
}

function AddInterviewForm({ onSubmit }: { onSubmit: (iv: { name: string; role: string; date: string; notes: string; verdict: "validated" | "insight" | "rejected"; willingnessToPay?: number }) => void }) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [notes, setNotes] = useState("");
  const [verdict, setVerdict] = useState<"validated" | "insight" | "rejected">("validated");
  const [wtp, setWtp] = useState("");

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Input placeholder="Person's name" value={name} onChange={(e) => setName(e.target.value)} />
        <Input placeholder="Role / context" value={role} onChange={(e) => setRole(e.target.value)} />
      </div>
      <Textarea placeholder="What did they actually say? Verbatim where you can — quotes are gold." value={notes} onChange={(e) => setNotes(e.target.value)} rows={5} />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted mb-1.5">Verdict</div>
          <select value={verdict} onChange={(e) => setVerdict(e.target.value as typeof verdict)} className="bg-surface-2 border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-emerald w-full">
            <option value="validated">Validated — pain confirmed, would buy</option>
            <option value="insight">Insight — adjacent pain or new info</option>
            <option value="rejected">Rejected — no real pain here</option>
          </select>
        </div>
        <Input placeholder="Willingness to pay ($, optional)" type="number" value={wtp} onChange={(e) => setWtp(e.target.value)} />
      </div>
      <div className="flex justify-end">
        <Button
          onClick={() => name.trim() && onSubmit({ name, role, date: new Date().toLocaleDateString(), notes, verdict, willingnessToPay: wtp ? parseFloat(wtp) : undefined })}
          disabled={!name.trim()}
        >
          Add interview
        </Button>
      </div>
    </div>
  );
}
