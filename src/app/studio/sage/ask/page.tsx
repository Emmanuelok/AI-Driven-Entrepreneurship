"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { profileApi, type AgentRun } from "@/lib/profile-api";
import { Card, Button } from "@/components/ui";
import { Bot, Send, Loader2, Sparkles, Users, Rocket, ArrowRight, AlertCircle, Eye } from "lucide-react";

// /studio/sage/ask — ask Sage anything about Sankofa Studio's knowledge.
//
// Under the hood this dispatches a grounded_query agent run (Phase 62)
// which embeds the question, kNN-searches public_search_index, then
// asks Claude to ground its answer in the retrieved entries with
// inline [N] citations.
//
// Distinct from "Sit with Sage" (/studio/sage) which is a personal
// reflection chat — that one is feelings, no retrieval. This one is
// platform knowledge — facts about who's here, what they're building,
// who to talk to.

const STARTERS = [
  { scope: "all" as const, label: "Anyone shipping fintech in Kenya?", icon: Users },
  { scope: "profile" as const, label: "Mentors who can help with distribution", icon: Users },
  { scope: "venture" as const, label: "Ventures raising in agritech right now", icon: Rocket },
  { scope: "all" as const, label: "Hausa-speaking instructors", icon: Users },
];

type RunPhase = "idle" | "running" | "answered" | "error";

export default function AskSagePage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<"all" | "profile" | "venture">("all");
  const [phase, setPhase] = useState<RunPhase>("idle");
  const [stepLabel, setStepLabel] = useState<string>("");
  const [run, setRun] = useState<AgentRun | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);

  async function ask() {
    const q = query.trim();
    if (!q || phase === "running") return;
    setPhase("running");
    setRun(null);
    setErr(null);
    setStepLabel("Sage is reading…");

    const started = await profileApi.startAgentRun({
      agent_kind: "grounded_query",
      title: `Sage: ${q.slice(0, 80)}`,
      input: { query: q, scope, topK: 14 },
    });
    if (!started.ok) {
      setPhase("error");
      setErr("Sage couldn't start the run. Try again.");
      return;
    }

    // The agent runs synchronously inside the request today (Phase 54
    // foreground model). By the time startAgentRun returns, the row is
    // terminal. Fetch the result.
    const r = await profileApi.getAgentRun(started.id);
    if (!r.ok || !r.run.output) {
      setPhase("error");
      setErr("Sage didn't return an answer. Try a different phrasing.");
      return;
    }
    setRun(r.run);
    setPhase("answered");
    setStepLabel("");
  }

  function pickStarter(s: (typeof STARTERS)[number]) {
    setQuery(s.label);
    setScope(s.scope);
    setTimeout(() => ref.current?.focus(), 50);
  }

  function newQuestion() {
    setRun(null);
    setQuery("");
    setPhase("idle");
    setErr(null);
    setTimeout(() => ref.current?.focus(), 100);
  }

  return (
    <div className="max-w-3xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <div className="mb-7">
        <p className="text-xs uppercase tracking-[0.22em] text-emerald mb-2 flex items-center gap-1.5">
          <Bot className="size-3.5" /> Ask Sage
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight">
          A research assistant grounded in the whole studio.
        </h1>
        <p className="mt-3 text-muted max-w-2xl leading-relaxed">
          Ask anything about Sankofa&apos;s members, ventures, and programs. Sage searches the platform&apos;s public knowledge and cites the sources it used — every fact links back to the entity it came from.
        </p>
      </div>

      {/* Composer */}
      <Card className="p-5 mb-5">
        <textarea
          ref={ref}
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void ask(); }
          }}
          rows={3}
          disabled={phase === "running"}
          placeholder="e.g. Mentors who can help with distribution in West Africa…"
          className="w-full bg-surface-2/60 border border-border rounded-xl px-4 py-3 text-base outline-none focus:border-emerald resize-none placeholder:text-muted disabled:opacity-50"
        />
        <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-1 text-xs">
            {(["all", "profile", "venture"] as const).map((s) => {
              const active = scope === s;
              return (
                <button
                  key={s}
                  disabled={phase === "running"}
                  onClick={() => setScope(s)}
                  className={`px-3 py-1 rounded-full border transition ${active ? "border-emerald bg-emerald/10 text-emerald" : "border-border text-muted hover:text-foreground"}`}
                >
                  {s === "all" ? "Everything" : s === "profile" ? "People" : "Ventures"}
                </button>
              );
            })}
          </div>
          <Button
            onClick={ask}
            disabled={!query.trim() || phase === "running"}
          >
            {phase === "running" ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            {phase === "running" ? "Asking…" : "Ask Sage"}
          </Button>
        </div>
        <p className="mt-2 text-[11px] text-muted">Enter to send · Shift+Enter for a new line</p>
      </Card>

      {/* Idle: starter prompts */}
      {phase === "idle" && (
        <div className="space-y-3">
          <p className="text-xs uppercase tracking-widest text-muted">Try one of these</p>
          <div className="grid sm:grid-cols-2 gap-2">
            {STARTERS.map((s) => {
              const Icon = s.icon;
              return (
                <button
                  key={s.label}
                  onClick={() => pickStarter(s)}
                  className="text-left p-3 rounded-xl border border-border bg-surface/40 hover:border-emerald/40 hover:bg-emerald/5 transition group"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="size-8 rounded-lg bg-emerald/10 border border-emerald/20 flex items-center justify-center shrink-0">
                      <Icon className="size-3.5 text-emerald" />
                    </div>
                    <span className="text-sm flex-1">{s.label}</span>
                    <ArrowRight className="size-3 text-muted opacity-0 group-hover:opacity-100 transition" />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Running */}
      {phase === "running" && (
        <Card className="p-6 text-center">
          <Loader2 className="size-6 text-emerald animate-spin mx-auto mb-3" />
          <p className="text-sm text-muted">{stepLabel || "Sage is working…"}</p>
        </Card>
      )}

      {/* Error */}
      {phase === "error" && err && (
        <Card className="p-5 border-rust/30 bg-rust/5">
          <div className="flex items-start gap-2 text-sm text-rust">
            <AlertCircle className="size-4 shrink-0 mt-0.5" />
            <div>
              <div className="font-medium">{err}</div>
              <Button size="sm" variant="ghost" onClick={newQuestion} className="mt-2">Try again</Button>
            </div>
          </div>
        </Card>
      )}

      {/* Answer */}
      {phase === "answered" && run && (
        <AnswerCard run={run} onNewQuestion={newQuestion} onOpenRun={() => router.push(`/studio/agent-runs/${run.id}`)} />
      )}
    </div>
  );
}

type Citation = {
  index: number;
  title: string;
  href: string;
  entity_kind: string;
  similarity: number;
};

function AnswerCard({ run, onNewQuestion, onOpenRun }: { run: AgentRun; onNewQuestion: () => void; onOpenRun: () => void }) {
  const output = run.output as Record<string, unknown>;
  const answer = String(output.answer ?? "");
  const citations = Array.isArray(output.citations) ? (output.citations as Citation[]) : [];
  const usedCitations = Array.isArray(output.used_citations) ? (output.used_citations as Citation[]) : [];
  const usedIndices = new Set(usedCitations.map((c) => c.index));
  const stats = (output.stats ?? {}) as { hits_returned?: number; in_context?: number; dropped_for_budget?: number; all_refs_valid?: boolean };

  // Render the answer with [N] citation markers rewritten as small
  // clickable badges that scroll to the source card below.
  const segments = splitAnswerByCitations(answer);

  return (
    <>
      <Card className="p-6">
        <div className="prose-chat text-sm leading-relaxed">
          {segments.map((seg, i) => (
            seg.type === "text" ? <span key={i} className="whitespace-pre-wrap">{seg.value}</span> :
              <CitationBadge key={i} indices={seg.indices} citations={citations} />
          ))}
        </div>
      </Card>

      {usedCitations.length > 0 && (
        <div className="mt-5">
          <p className="text-xs uppercase tracking-widest text-muted mb-2">Sources ({usedCitations.length})</p>
          <div className="space-y-2">
            {citations
              .filter((c) => usedIndices.has(c.index))
              .map((c) => <SourceCard key={c.index} citation={c} />)}
          </div>
        </div>
      )}

      {citations.length > usedCitations.length && (
        <details className="mt-4">
          <summary className="text-xs text-muted cursor-pointer hover:text-foreground transition">
            {citations.length - usedCitations.length} additional source{citations.length - usedCitations.length === 1 ? "" : "s"} Sage had access to
          </summary>
          <div className="mt-2 space-y-2">
            {citations
              .filter((c) => !usedIndices.has(c.index))
              .map((c) => <SourceCard key={c.index} citation={c} dimmed />)}
          </div>
        </details>
      )}

      <div className="mt-6 flex items-center justify-between gap-3 flex-wrap">
        <div className="text-[11px] text-muted">
          {typeof stats.hits_returned === "number" && (
            <>Searched {stats.hits_returned} entries · used {stats.in_context} in context{stats.dropped_for_budget ? ` · ${stats.dropped_for_budget} dropped for budget` : ""}</>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={onOpenRun}><Eye className="size-3.5" /> Full run</Button>
          <Button size="sm" onClick={onNewQuestion}><Sparkles className="size-3.5" /> New question</Button>
        </div>
      </div>
    </>
  );
}

type Segment = { type: "text"; value: string } | { type: "cite"; indices: number[] };

// Splits an answer like "Mentors here [1,3] often..." into:
//   [{ text: "Mentors here " }, { cite: [1,3] }, { text: " often..." }]
function splitAnswerByCitations(answer: string): Segment[] {
  const segs: Segment[] = [];
  const re = /\[(\d+(?:\s*,\s*\d+)*)\]/g;
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(answer)) !== null) {
    if (m.index > lastIdx) segs.push({ type: "text", value: answer.slice(lastIdx, m.index) });
    const indices = m[1].split(",").map((s) => parseInt(s.trim(), 10)).filter(Number.isFinite);
    segs.push({ type: "cite", indices });
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < answer.length) segs.push({ type: "text", value: answer.slice(lastIdx) });
  return segs;
}

function CitationBadge({ indices, citations }: { indices: number[]; citations: Citation[] }) {
  const refs = indices
    .map((i) => citations.find((c) => c.index === i))
    .filter((c): c is Citation => !!c);
  if (refs.length === 0) return <span className="text-muted">[{indices.join(",")}]</span>;
  return (
    <span className="inline-flex items-center gap-0.5 mx-0.5 align-baseline">
      {refs.map((r) => (
        <Link
          key={r.index}
          href={r.href}
          title={r.title}
          className="inline-flex items-center justify-center min-w-[20px] h-[18px] px-1 rounded-md bg-emerald/15 border border-emerald/30 text-emerald text-[10px] font-mono hover:bg-emerald/25 transition"
        >
          {r.index}
        </Link>
      ))}
    </span>
  );
}

function SourceCard({ citation, dimmed = false }: { citation: Citation; dimmed?: boolean }) {
  const KIND_ICON: Record<string, typeof Bot> = { profile: Users, venture: Rocket };
  const Icon = KIND_ICON[citation.entity_kind] ?? Bot;
  return (
    <Link href={citation.href} className={`block ${dimmed ? "opacity-60 hover:opacity-100" : ""}`}>
      <Card className="p-3.5 hover:border-emerald/40 transition flex items-center gap-3">
        <div className="size-9 rounded-lg bg-emerald/10 border border-emerald/20 flex items-center justify-center text-[10px] text-emerald font-mono shrink-0">
          {citation.index}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{citation.title}</div>
          <div className="text-[10px] text-muted inline-flex items-center gap-1.5 mt-0.5">
            <Icon className="size-2.5" /> {citation.entity_kind} · match {Math.round(citation.similarity * 100)}%
          </div>
        </div>
        <ArrowRight className="size-3 text-muted shrink-0" />
      </Card>
    </Link>
  );
}
