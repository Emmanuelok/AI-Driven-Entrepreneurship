"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, notFound } from "next/navigation";
import { profileApi, type AgentRun, type AgentRunSummary } from "@/lib/profile-api";
import { Card, Badge, Button } from "@/components/ui";
import { formatDistanceToNow } from "date-fns";
import { ArrowLeft, Bot, Loader2, CheckCircle2, AlertCircle, Clock, Sparkles, Hourglass, ArrowRight, Trash2 } from "lucide-react";

// /studio/agent-runs/[id] — single run detail. Deep-linkable target
// for agent_complete notifications. Renders the full step trace,
// the raw input, the rich output (via the same per-agent previews
// from the list page) and exposes Delete + Re-run.

const STATUS_BADGE: Record<AgentRunSummary["status"], { color: "amber" | "emerald" | "rust" | "muted" | "indigo"; label: string; Icon: typeof Clock }> = {
  pending: { color: "muted", label: "Queued", Icon: Hourglass },
  running: { color: "amber", label: "Running", Icon: Loader2 },
  needs_approval: { color: "indigo", label: "Awaiting you", Icon: Sparkles },
  completed: { color: "emerald", label: "Done", Icon: CheckCircle2 },
  failed: { color: "rust", label: "Failed", Icon: AlertCircle },
  cancelled: { color: "muted", label: "Cancelled", Icon: AlertCircle },
};

const AGENT_LABEL: Record<string, string> = {
  outreach_drafter: "Outreach drafter",
  research_brief: "Research brief",
  discussion_summary: "Discussion digest",
  venture_pitch_polish: "Pitch polish",
};

export default function AgentRunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id } = use(params);
  const [run, setRun] = useState<AgentRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);

  async function load() {
    const r = await profileApi.getAgentRun(id);
    if (!r.ok) { setMissing(true); setLoading(false); return; }
    setRun(r.run);
    setLoading(false);
  }
  useEffect(() => { void load(); }, [id]);

  // Poll once a second while the run is still in flight — the runner
  // executes synchronously today so this rarely fires, but it keeps
  // the UI honest when v2.1 lands background queueing.
  useEffect(() => {
    if (!run || run.status === "completed" || run.status === "failed" || run.status === "cancelled" || run.status === "needs_approval") return;
    const t = setInterval(() => void load(), 1500);
    return () => clearInterval(t);
  }, [run?.status, id]);

  async function destroy() {
    if (!run) return;
    const isTerminal = run.status === "completed" || run.status === "failed" || run.status === "cancelled" || run.status === "needs_approval";
    const verb = isTerminal ? "Delete this run from your history?" : "Cancel this run?";
    if (!confirm(verb)) return;
    setBusy(true);
    const r = await profileApi.deleteAgentRun(run.id);
    setBusy(false);
    if (r.ok) router.push("/studio/agent-runs");
  }

  async function rerun() {
    if (!run) return;
    setBusy(true);
    const r = await profileApi.startAgentRun({
      // The kind is a string at runtime; the API accepts the union.
      agent_kind: run.agent_kind as "outreach_drafter" | "research_brief" | "discussion_summary" | "venture_pitch_polish",
      title: `${run.title} (re-run)`,
      prompt: run.prompt,
      input: run.input,
    });
    setBusy(false);
    if (r.ok) router.push(`/studio/agent-runs/${r.id}`);
  }

  if (loading) return <div className="min-h-[40vh] flex items-center justify-center"><Loader2 className="size-6 text-emerald animate-spin" /></div>;
  if (missing || !run) { notFound(); return null; }

  const meta = STATUS_BADGE[run.status];
  const Icon = meta.Icon;
  const agentLabel = AGENT_LABEL[run.agent_kind] ?? run.agent_kind;

  return (
    <div className="max-w-3xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <Link href="/studio/agent-runs" className="text-xs text-muted hover:text-foreground inline-flex items-center gap-1.5 mb-5">
        <ArrowLeft className="size-3" /> All Sage runs
      </Link>

      <div className="flex items-start justify-between gap-3 flex-wrap mb-6">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.22em] text-emerald mb-2 flex items-center gap-1.5">
            <Bot className="size-3.5" /> {agentLabel}
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold leading-tight">{run.title}</h1>
          <p className="text-[11px] text-muted mt-1">Started {formatDistanceToNow(new Date(run.created_at))} ago</p>
        </div>
        <Badge color={meta.color}>
          <span className="inline-flex items-center gap-1"><Icon className={`size-3 ${run.status === "running" ? "animate-spin" : ""}`} /> {meta.label}</span>
        </Badge>
      </div>

      {run.status === "failed" && run.error && (
        <Card className="p-4 mb-5 border-rust/30 bg-rust/5">
          <div className="flex items-start gap-2 text-sm text-rust">
            <AlertCircle className="size-4 shrink-0 mt-0.5" />
            <div>
              <div className="font-medium">Sage couldn&apos;t finish this run.</div>
              <p className="text-xs mt-1 text-rust/80">{run.error}</p>
            </div>
          </div>
        </Card>
      )}

      {/* Rich output preview */}
      {run.output && <OutputPreview agentKind={run.agent_kind} output={run.output as Record<string, unknown>} />}

      {/* Step trace */}
      {run.steps.length > 0 && (
        <Card className="p-5 mt-5">
          <h2 className="text-sm font-medium mb-3">Sage&apos;s steps</h2>
          <ol className="space-y-2">
            {run.steps.map((s, i) => (
              <li key={i} className="text-sm flex items-start gap-2.5">
                {s.status === "done" ? <CheckCircle2 className="size-3.5 text-emerald mt-0.5 shrink-0" /> :
                  s.status === "failed" ? <AlertCircle className="size-3.5 text-rust mt-0.5 shrink-0" /> :
                  <Loader2 className="size-3.5 text-amber animate-spin mt-0.5 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="text-foreground/90">{s.label}</div>
                  {s.finished_at && (
                    <div className="text-[10px] text-muted">
                      {s.finished_at && new Date(s.finished_at).getTime() - new Date(s.started_at).getTime() > 0
                        ? `${new Date(s.finished_at).getTime() - new Date(s.started_at).getTime()}ms`
                        : "—"}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </Card>
      )}

      {/* Input (collapsed) */}
      {Object.keys(run.input ?? {}).length > 0 && (
        <Card className="p-5 mt-5">
          <details>
            <summary className="text-sm font-medium cursor-pointer hover:text-emerald transition">
              What you asked Sage to work with
            </summary>
            <pre className="mt-3 text-[11px] text-muted overflow-x-auto whitespace-pre-wrap bg-surface-2/40 rounded-xl p-3">
              {JSON.stringify(run.input, null, 2)}
            </pre>
          </details>
        </Card>
      )}

      {/* Actions */}
      <div className="mt-7 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          {(run.status === "completed" || run.status === "needs_approval" || run.status === "failed") && (
            <Button variant="secondary" onClick={rerun} disabled={busy}>
              <ArrowRight className="size-4" /> Re-run with the same input
            </Button>
          )}
        </div>
        <Button variant="ghost" onClick={destroy} disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4 text-rust" />}
          {run.status === "completed" || run.status === "failed" || run.status === "cancelled" || run.status === "needs_approval"
            ? "Delete from history"
            : "Cancel run"}
        </Button>
      </div>
    </div>
  );
}

// Same per-agent preview switch as the list page, scaled up — no
// line-clamp here so the full body shows.
function OutputPreview({ agentKind, output }: { agentKind: string; output: Record<string, unknown> }) {
  switch (agentKind) {
    case "outreach_drafter": {
      const recipientSlug = String(output.recipientSlug ?? "");
      const subject = String(output.subject ?? "");
      const body = String(output.body ?? "");
      return (
        <Card className="p-5 mt-5 border-emerald/30 bg-emerald/5">
          {subject && <div className="text-sm mb-2"><span className="text-muted">Subject: </span><span className="text-foreground font-medium">{subject}</span></div>}
          <p className="text-sm text-foreground/95 leading-relaxed whitespace-pre-wrap">{body}</p>
          {recipientSlug && (
            <div className="flex justify-end pt-3 mt-3 border-t border-emerald/15">
              <Link href={`/people/${recipientSlug}`}>
                <Button size="sm">Open profile to send <ArrowRight className="size-3" /></Button>
              </Link>
            </div>
          )}
        </Card>
      );
    }
    case "research_brief": {
      const what = String(output.what ?? "");
      const whyNow = output.why_now == null ? null : String(output.why_now);
      const starters = Array.isArray(output.starters) ? (output.starters as string[]) : [];
      const avoid = Array.isArray(output.avoid) ? (output.avoid as string[]) : [];
      const subjectSlug = output.subjectSlug ? String(output.subjectSlug) : null;
      return (
        <Card className="p-5 mt-5 border-emerald/30 bg-emerald/5 space-y-4">
          {what && (
            <section>
              <div className="text-[10px] uppercase tracking-widest text-emerald mb-1">Summary</div>
              <p className="text-sm leading-relaxed">{what}</p>
            </section>
          )}
          {whyNow && (
            <section>
              <div className="text-[10px] uppercase tracking-widest text-emerald mb-1">Why now</div>
              <p className="text-sm leading-relaxed">{whyNow}</p>
            </section>
          )}
          {starters.length > 0 && (
            <section>
              <div className="text-[10px] uppercase tracking-widest text-emerald mb-1">Conversation starters</div>
              <ul className="space-y-1.5 text-sm">{starters.map((s, i) => (<li key={i} className="leading-relaxed">• {s}</li>))}</ul>
            </section>
          )}
          {avoid.length > 0 && (
            <section>
              <div className="text-[10px] uppercase tracking-widest text-amber mb-1">Don&apos;t lead with</div>
              <ul className="space-y-1.5 text-sm text-muted">{avoid.map((s, i) => (<li key={i} className="leading-relaxed">• {s}</li>))}</ul>
            </section>
          )}
          {subjectSlug && (
            <div className="flex justify-end pt-2 border-t border-emerald/15">
              <Link href={`/people/${subjectSlug}`}><Button size="sm">Open profile <ArrowRight className="size-3" /></Button></Link>
            </div>
          )}
        </Card>
      );
    }
    case "discussion_summary": {
      const decisions = Array.isArray(output.decisions) ? (output.decisions as string[]) : [];
      const open = Array.isArray(output.open_questions) ? (output.open_questions as string[]) : [];
      const items = Array.isArray(output.action_items) ? (output.action_items as Array<{ who: string; what: string; when: string | null }>) : [];
      const mentions = Array.isArray(output.mentions) ? (output.mentions as Array<{ name: string; contribution: string }>) : [];
      const total = decisions.length + open.length + items.length + mentions.length;
      return (
        <Card className="p-5 mt-5 border-emerald/30 bg-emerald/5 space-y-4">
          {output.messageCount ? (
            <p className="text-xs text-muted">Summarized {String(output.messageCount)} messages over the last {String(output.sinceHours ?? 72)} hours.</p>
          ) : null}
          {total === 0 && <p className="text-sm text-muted italic">Nothing material to surface in the window.</p>}
          {decisions.length > 0 && (
            <section>
              <div className="text-[10px] uppercase tracking-widest text-emerald mb-1">Decisions</div>
              <ul className="space-y-1.5 text-sm">{decisions.map((d, i) => (<li key={i}>• {d}</li>))}</ul>
            </section>
          )}
          {items.length > 0 && (
            <section>
              <div className="text-[10px] uppercase tracking-widest text-amber mb-1">Action items</div>
              <ul className="space-y-2 text-sm">
                {items.map((a, i) => (
                  <li key={i} className="leading-relaxed">
                    <strong className="text-foreground">{a.who}</strong>: {a.what}
                    {a.when && <span className="text-muted"> · {a.when}</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {open.length > 0 && (
            <section>
              <div className="text-[10px] uppercase tracking-widest text-indigo mb-1">Open questions</div>
              <ul className="space-y-1.5 text-sm">{open.map((q, i) => (<li key={i}>• {q}</li>))}</ul>
            </section>
          )}
          {mentions.length > 0 && (
            <section>
              <div className="text-[10px] uppercase tracking-widest text-muted mb-1">Who contributed</div>
              <ul className="space-y-1 text-sm text-muted">{mentions.map((m, i) => (<li key={i}><strong className="text-foreground">{m.name}</strong> — {m.contribution}</li>))}</ul>
            </section>
          )}
        </Card>
      );
    }
    case "venture_pitch_polish": {
      const ventureSlug = output.ventureSlug ? String(output.ventureSlug) : null;
      const sections: Array<[string, string, "emerald" | "amber"]> = [
        ["Hook", String(output.hook ?? ""), "emerald"],
        ["Problem", String(output.problem ?? ""), "emerald"],
        ["Solution", String(output.solution ?? ""), "emerald"],
        ["Ask", String(output.ask ?? ""), "amber"],
      ];
      return (
        <Card className="p-5 mt-5 border-emerald/30 bg-emerald/5 space-y-4">
          {sections.map(([label, body, color]) => body && (
            <section key={label}>
              <div className={`text-[10px] uppercase tracking-widest mb-1 ${color === "amber" ? "text-amber" : "text-emerald"}`}>{label}</div>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{body}</p>
            </section>
          ))}
          {ventureSlug && (
            <div className="flex justify-end pt-2 border-t border-emerald/15">
              <Link href={`/v/${ventureSlug}`}><Button size="sm">Open venture <ArrowRight className="size-3" /></Button></Link>
            </div>
          )}
        </Card>
      );
    }
    default:
      return (
        <Card className="p-5 mt-5">
          <pre className="text-[11px] text-muted overflow-x-auto whitespace-pre-wrap">{JSON.stringify(output, null, 2)}</pre>
        </Card>
      );
  }
}
