"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { profileApi, type AgentRunSummary } from "@/lib/profile-api";
import { Card, Badge, Button } from "@/components/ui";
import { formatDistanceToNow } from "date-fns";
import { Bot, Loader2, CheckCircle2, AlertCircle, Clock, ArrowRight, Sparkles, Hourglass } from "lucide-react";

// Sage's run log. Every time Sage is dispatched to do something on
// your behalf (draft outreach, summarize a thread, prep a fundraise
// pack), it shows up here with the trace of what it did.
//
// v2.0 ships foreground execution — by the time a run lands here it's
// usually already terminal. v2.1 wires background queueing + retries
// and this surface becomes a real status board for in-flight work.

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
  grounded_query: "Sage answer",
};

export default function AgentRunsPage() {
  const [runs, setRuns] = useState<AgentRunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  // Filters — agent kind + status. Cheap to keep client-side because
  // the API returns the last 40 runs already; we filter the visible
  // set in memory rather than refetching. Search is text in title.
  const [kindFilter, setKindFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [q, setQ] = useState("");

  async function load() {
    const r = await profileApi.listAgentRuns();
    if (r.ok) setRuns(r.results);
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  const visible = runs.filter((r) => {
    if (kindFilter !== "all" && r.agent_kind !== kindFilter) return false;
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (q.trim() && !r.title.toLowerCase().includes(q.trim().toLowerCase())) return false;
    return true;
  });

  // Available kinds derived from the rows so adding a 5th agent
  // never requires touching the filter chip list.
  const kinds = Array.from(new Set(runs.map((r) => r.agent_kind)));

  return (
    <div className="max-w-3xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <div className="mb-8">
        <p className="text-xs uppercase tracking-[0.22em] text-emerald mb-2 flex items-center gap-1.5">
          <Bot className="size-3.5" /> Sage runs
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight">
          What Sage has done for you.
        </h1>
        <p className="mt-3 text-muted max-w-2xl leading-relaxed">
          Every run carries the trace of what Sage saw, what it did, and what it produced. Drafts wait for your approval before anything leaves the platform.
        </p>
      </div>

      {!loading && runs.length > 0 && (
        <div className="mb-5 flex items-center gap-2 flex-wrap">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search runs…"
            className="bg-surface-2 border border-border rounded-xl px-3 py-1.5 text-sm outline-none focus:border-emerald w-full max-w-[260px]"
          />
          <select
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value)}
            className="bg-surface-2 border border-border rounded-xl px-3 py-1.5 text-sm outline-none focus:border-emerald"
          >
            <option value="all">All agents</option>
            {kinds.map((k) => (
              <option key={k} value={k}>{AGENT_LABEL[k] ?? k}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-surface-2 border border-border rounded-xl px-3 py-1.5 text-sm outline-none focus:border-emerald"
          >
            <option value="all">All statuses</option>
            <option value="completed">Done</option>
            <option value="needs_approval">Awaiting you</option>
            <option value="running">Running</option>
            <option value="failed">Failed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <span className="text-xs text-muted">{visible.length} of {runs.length}</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="size-6 text-emerald animate-spin" /></div>
      ) : runs.length === 0 ? (
        <Card className="p-10 text-center">
          <Bot className="size-10 text-emerald mx-auto mb-3" />
          <p className="text-muted max-w-md mx-auto leading-relaxed">
            No runs yet. Dispatch Sage from a public profile&apos;s contact composer (&quot;Let Sage draft this for you&quot;) to see your first run land here.
          </p>
        </Card>
      ) : visible.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="text-muted">No runs match those filters.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {visible.map((r) => (
            <RunCard key={r.id} run={r} />
          ))}
        </div>
      )}
    </div>
  );
}

function RunCard({ run }: { run: AgentRunSummary }) {
  const meta = STATUS_BADGE[run.status];
  const Icon = meta.Icon;
  const agentLabel = AGENT_LABEL[run.agent_kind] ?? run.agent_kind;

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <h3 className="font-medium text-sm">
            <Link href={`/studio/agent-runs/${run.id}`} className="hover:text-emerald transition">{run.title}</Link>
          </h3>
          <p className="text-[11px] text-muted mt-0.5">{agentLabel} · {formatDistanceToNow(new Date(run.created_at))} ago</p>
        </div>
        <Badge color={meta.color}>
          <span className="inline-flex items-center gap-1"><Icon className={`size-2.5 ${run.status === "running" ? "animate-spin" : ""}`} /> {meta.label}</span>
        </Badge>
      </div>

      {run.status === "failed" && run.error && (
        <p className="text-xs text-rust mt-2">{run.error}</p>
      )}

      {run.output && (run.status === "needs_approval" || run.status === "completed") && (
        <AgentOutputPreview agentKind={run.agent_kind} output={run.output as Record<string, unknown>} />
      )}

      {run.steps.length > 0 && (
        <details className="mt-3 group">
          <summary className="text-[11px] text-muted cursor-pointer hover:text-foreground transition">
            Show Sage&apos;s trace ({run.steps.length} step{run.steps.length === 1 ? "" : "s"})
          </summary>
          <ol className="mt-2 space-y-1 text-[11px] text-muted">
            {run.steps.map((s, i) => (
              <li key={i} className="flex items-center gap-2">
                {s.status === "done" ? <CheckCircle2 className="size-3 text-emerald" /> :
                  s.status === "failed" ? <AlertCircle className="size-3 text-rust" /> :
                  <Loader2 className="size-3 text-amber animate-spin" />}
                <span>{s.label}</span>
              </li>
            ))}
          </ol>
        </details>
      )}
    </Card>
  );
}

function AgentOutputPreview({ agentKind, output }: { agentKind: string; output: Record<string, unknown> }) {
  switch (agentKind) {
    case "outreach_drafter":
      return <OutreachOutputPreview output={output} />;
    case "research_brief":
      return <ResearchBriefPreview output={output} />;
    case "discussion_summary":
      return <DiscussionSummaryPreview output={output} />;
    case "venture_pitch_polish":
      return <PitchPolishPreview output={output} />;
    case "grounded_query":
      return <GroundedQueryPreview output={output} />;
    default:
      return (
        <pre className="mt-3 rounded-xl border border-border bg-surface-2/40 p-3 text-[11px] text-muted overflow-x-auto">
          {JSON.stringify(output, null, 2)}
        </pre>
      );
  }
}

function OutreachOutputPreview({ output }: { output: Record<string, unknown> }) {
  const recipientSlug = String(output.recipientSlug ?? "");
  const subject = String(output.subject ?? "");
  const body = String(output.body ?? "");
  return (
    <div className="mt-3 rounded-xl border border-emerald/20 bg-emerald/5 p-3 space-y-2">
      {subject && <div className="text-xs text-muted">Subject: <span className="text-foreground">{subject}</span></div>}
      <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap line-clamp-6">{body}</p>
      {recipientSlug && (
        <div className="flex justify-end">
          <Link href={`/people/${recipientSlug}`}>
            <Button size="sm" variant="secondary">Open profile to send <ArrowRight className="size-3" /></Button>
          </Link>
        </div>
      )}
    </div>
  );
}

function ResearchBriefPreview({ output }: { output: Record<string, unknown> }) {
  const what = String(output.what ?? "");
  const whyNow = output.why_now == null ? null : String(output.why_now);
  const starters = Array.isArray(output.starters) ? (output.starters as string[]).filter((s) => typeof s === "string") : [];
  const avoid = Array.isArray(output.avoid) ? (output.avoid as string[]).filter((s) => typeof s === "string") : [];
  const subjectSlug = output.subjectSlug ? String(output.subjectSlug) : null;
  return (
    <div className="mt-3 rounded-xl border border-emerald/20 bg-emerald/5 p-4 space-y-3">
      {what && <p className="text-sm leading-relaxed">{what}</p>}
      {whyNow && (
        <div>
          <div className="text-[10px] uppercase tracking-widest text-emerald mb-1">Why now</div>
          <p className="text-sm text-foreground/90 leading-relaxed">{whyNow}</p>
        </div>
      )}
      {starters.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-widest text-emerald mb-1">Conversation starters</div>
          <ul className="space-y-1 text-sm">
            {starters.map((s, i) => (<li key={i} className="leading-relaxed">• {s}</li>))}
          </ul>
        </div>
      )}
      {avoid.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-widest text-amber mb-1">Don&apos;t lead with</div>
          <ul className="space-y-1 text-sm text-muted">
            {avoid.map((s, i) => (<li key={i} className="leading-relaxed">• {s}</li>))}
          </ul>
        </div>
      )}
      {subjectSlug && (
        <div className="flex justify-end pt-1">
          <Link href={`/people/${subjectSlug}`}>
            <Button size="sm" variant="secondary">Open profile <ArrowRight className="size-3" /></Button>
          </Link>
        </div>
      )}
    </div>
  );
}

function DiscussionSummaryPreview({ output }: { output: Record<string, unknown> }) {
  const decisions = Array.isArray(output.decisions) ? (output.decisions as string[]) : [];
  const open = Array.isArray(output.open_questions) ? (output.open_questions as string[]) : [];
  const items = Array.isArray(output.action_items) ? (output.action_items as Array<{ who: string; what: string; when: string | null }>) : [];
  const mentions = Array.isArray(output.mentions) ? (output.mentions as Array<{ name: string; contribution: string }>) : [];
  const total = decisions.length + open.length + items.length + mentions.length;
  return (
    <div className="mt-3 rounded-xl border border-emerald/20 bg-emerald/5 p-4 space-y-3">
      {total === 0 && <p className="text-sm text-muted italic">Nothing material to surface in the window.</p>}
      {decisions.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-widest text-emerald mb-1">Decisions</div>
          <ul className="space-y-1 text-sm">{decisions.map((d, i) => (<li key={i}>• {d}</li>))}</ul>
        </div>
      )}
      {items.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-widest text-amber mb-1">Action items</div>
          <ul className="space-y-1.5 text-sm">
            {items.map((a, i) => (
              <li key={i} className="leading-relaxed">
                <strong className="text-foreground">{a.who}</strong>: {a.what}
                {a.when && <span className="text-muted"> · {a.when}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {open.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-widest text-indigo mb-1">Open questions</div>
          <ul className="space-y-1 text-sm">{open.map((q, i) => (<li key={i}>• {q}</li>))}</ul>
        </div>
      )}
      {mentions.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted mb-1">Who contributed</div>
          <ul className="space-y-1 text-sm text-muted">
            {mentions.map((m, i) => (<li key={i}><strong className="text-foreground">{m.name}</strong> — {m.contribution}</li>))}
          </ul>
        </div>
      )}
    </div>
  );
}

function PitchPolishPreview({ output }: { output: Record<string, unknown> }) {
  const hook = String(output.hook ?? "");
  const problem = String(output.problem ?? "");
  const solution = String(output.solution ?? "");
  const ask = String(output.ask ?? "");
  const ventureSlug = output.ventureSlug ? String(output.ventureSlug) : null;
  return (
    <div className="mt-3 rounded-xl border border-emerald/20 bg-emerald/5 p-4 space-y-3">
      {hook && (
        <div>
          <div className="text-[10px] uppercase tracking-widest text-emerald mb-1">Hook</div>
          <p className="text-sm leading-relaxed">{hook}</p>
        </div>
      )}
      {problem && (
        <div>
          <div className="text-[10px] uppercase tracking-widest text-emerald mb-1">Problem</div>
          <p className="text-sm leading-relaxed">{problem}</p>
        </div>
      )}
      {solution && (
        <div>
          <div className="text-[10px] uppercase tracking-widest text-emerald mb-1">Solution</div>
          <p className="text-sm leading-relaxed">{solution}</p>
        </div>
      )}
      {ask && (
        <div>
          <div className="text-[10px] uppercase tracking-widest text-amber mb-1">Ask</div>
          <p className="text-sm leading-relaxed">{ask}</p>
        </div>
      )}
      {ventureSlug && (
        <div className="flex justify-end pt-1">
          <Link href={`/v/${ventureSlug}`}>
            <Button size="sm" variant="secondary">Open venture <ArrowRight className="size-3" /></Button>
          </Link>
        </div>
      )}
    </div>
  );
}

function GroundedQueryPreview({ output }: { output: Record<string, unknown> }) {
  const query = String(output.query ?? "");
  const answer = String(output.answer ?? "");
  const used = Array.isArray(output.used_citations) ? (output.used_citations as Array<{ index: number; title: string; href: string; entity_kind: string }>) : [];
  return (
    <div className="mt-3 rounded-xl border border-emerald/20 bg-emerald/5 p-3.5 space-y-2">
      {query && <div className="text-[11px] text-muted">Q: <span className="text-foreground">{query.slice(0, 120)}</span></div>}
      <p className="text-sm text-foreground/90 leading-relaxed line-clamp-4 whitespace-pre-wrap">{answer}</p>
      {used.length > 0 && (
        <div className="text-[10px] text-muted">{used.length} cited source{used.length === 1 ? "" : "s"}</div>
      )}
    </div>
  );
}
