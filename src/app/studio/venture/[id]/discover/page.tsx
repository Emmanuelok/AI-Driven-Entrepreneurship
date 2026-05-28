"use client";

import { use, useState } from "react";
import { notFound } from "next/navigation";
import { useStore } from "@/store";
import { PROBLEMS } from "@/lib/problems";
import { Card, Button, Input, Textarea, Badge, Dialog, EmptyState } from "@/components/ui";
import { Users, Plus, Sparkles, CheckCircle2, AlertCircle, XCircle } from "lucide-react";
import { Markdown } from "@/components/markdown";

export default function DiscoverPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { ventures, addInterview } = useStore();
  const [adding, setAdding] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [script, setScript] = useState<{ category: string; q: string }[] | null>(null);
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
          persona: v.canvas.Customer ?? "the target customer",
          ventureName: v.name,
        }),
      });
      const data = await res.json();
      setScript(data.questions);
    } finally {
      setGenerating(false);
    }
  }

  const validated = v.interviews.filter((i) => i.verdict === "validated").length;
  const rate = v.interviews.length ? validated / v.interviews.length : 0;

  return (
    <div className="max-w-6xl mx-auto px-5 sm:px-8 py-10">
      <div className="flex items-end justify-between flex-wrap gap-3 mb-6">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-emerald mb-1 flex items-center gap-1.5">
            <Users className="size-3.5" /> Phase 2 — Customer Discovery
          </p>
          <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold">{v.interviews.length} of {v.metrics.interviewsTarget} interviews logged</h2>
          <p className="text-sm text-muted mt-1">Validate rate: <span className={`font-semibold ${rate >= 0.5 ? "text-emerald" : "text-amber"}`}>{Math.round(rate * 100)}%</span> · Move to MVP at ≥50%.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={generateScript} disabled={generating}>
            <Sparkles className="size-4" /> {generating ? "Akili is drafting…" : "Generate interview script"}
          </Button>
          <Button onClick={() => setAdding(true)}><Plus className="size-4" /> Log interview</Button>
        </div>
      </div>

      {script && (
        <Card className="p-6 mb-6 border border-emerald/30 bg-emerald/5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium flex items-center gap-2"><Sparkles className="size-4 text-emerald" /> Customer Discovery Script (12 questions)</h3>
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
          <p className="text-xs text-muted mt-4">Tip: Never read these like a survey. Use them as anchors — let the conversation breathe.</p>
        </Card>
      )}

      {v.interviews.length === 0 ? (
        <EmptyState icon={Users} title="No interviews yet" body="Talk to 20 people before you build. Log each conversation here." action={<Button onClick={() => setAdding(true)}><Plus className="size-4" /> Log first interview</Button>} />
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
              </tr>
            </thead>
            <tbody>
              {v.interviews.map((iv) => (
                <tr key={iv.id} className="border-t border-border hover:bg-surface-2/40">
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
                </tr>
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
      <Textarea placeholder="Verdict notes — what did you learn?" value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted mb-1.5">Verdict</div>
          <select value={verdict} onChange={(e) => setVerdict(e.target.value as typeof verdict)} className="bg-surface-2 border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-emerald w-full">
            <option value="validated">Validated</option>
            <option value="insight">Insight</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
        <Input placeholder="Willingness to pay ($)" type="number" value={wtp} onChange={(e) => setWtp(e.target.value)} />
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
