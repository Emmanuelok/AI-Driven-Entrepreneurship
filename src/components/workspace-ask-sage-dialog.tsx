"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { profileApi, type AgentRun } from "@/lib/profile-api";
import { Dialog, Button } from "@/components/ui";
import { Send, Eye, Loader2, AlertCircle, RotateCw } from "lucide-react";

// Workspace-scoped "Ask Sage" dialog. Dispatches the
// workspace_grounded_query agent which RAG-searches the workspace's
// private index, hands the result to Claude, and returns a
// citation-grounded answer.
//
// Different from /studio/sage/ask in two ways:
//   1. The retrieval scope is one workspace, not the public index.
//   2. The user must be a workspace member (the agent re-verifies).

export function WorkspaceAskSageDialog({
  open, onClose, workspaceId, workspaceTitle, isAdmin,
}: {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
  workspaceTitle: string;
  isAdmin: boolean;
}) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<"all" | "message" | "doc" | "task" | "deadline">("all");
  const [phase, setPhase] = useState<"idle" | "running" | "answered" | "error">("idle");
  const [run, setRun] = useState<AgentRun | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [reindexBusy, setReindexBusy] = useState(false);
  const [reindexMsg, setReindexMsg] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => ref.current?.focus(), 60);
    if (!open) {
      setQuery(""); setRun(null); setErr(null); setPhase("idle");
      setReindexMsg(null);
    }
  }, [open]);

  async function ask() {
    const q = query.trim();
    if (!q || phase === "running") return;
    setPhase("running");
    setRun(null);
    setErr(null);

    const started = await profileApi.startAgentRun({
      agent_kind: "workspace_grounded_query",
      title: `Sage in ${workspaceTitle}: ${q.slice(0, 60)}`,
      input: { workspaceId, query: q, kindFilter: scope === "all" ? undefined : scope, topK: 14 },
    });
    if (!started.ok) {
      setPhase("error");
      setErr("Sage couldn't start. Try again.");
      return;
    }

    const r = await profileApi.getAgentRun(started.id);
    if (!r.ok || !r.run.output) {
      setPhase("error");
      setErr("Sage didn't return an answer. Try a different phrasing.");
      return;
    }
    setRun(r.run);
    setPhase("answered");
  }

  async function reindex() {
    if (reindexBusy) return;
    setReindexBusy(true);
    setReindexMsg("Reindexing — this can take a minute on a big workspace…");
    try {
      const { supabaseBrowser } = await import("@/lib/supabase");
      const sb = supabaseBrowser();
      if (!sb) { setReindexMsg("Couldn't reach Supabase."); setReindexBusy(false); return; }
      const { data: { session } } = await sb.auth.getSession();
      const res = await fetch(`/api/v2/workspaces/${workspaceId}/semantic-search/reindex`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
      });
      const data = await res.json();
      if (!data.ok) {
        setReindexMsg("Reindex failed. Try again later.");
      } else {
        const c = data.counts as { messages: number; docs: number; tasks: number; deadlines: number };
        setReindexMsg(`Reindexed ${c.messages + c.docs + c.tasks + c.deadlines} entries (${c.messages} messages · ${c.docs} docs · ${c.tasks} tasks · ${c.deadlines} deadlines).`);
      }
    } catch {
      setReindexMsg("Reindex hit an error.");
    }
    setReindexBusy(false);
  }

  return (
    <Dialog open={open} onClose={onClose} size="lg" title={`Ask Sage about ${workspaceTitle}`}>
      <div className="space-y-4">
        <p className="text-xs text-muted leading-relaxed">
          Sage searches this workspace&apos;s own messages, docs, tasks, and deadlines and answers with citations you can click through. Members only — Sage doesn&apos;t leak between workspaces.
        </p>

        {/* Composer */}
        <textarea
          ref={ref}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void ask(); } }}
          disabled={phase === "running"}
          rows={3}
          placeholder="e.g. What did Achieng decide about the Yendi pilot?"
          className="w-full bg-surface-2/60 border border-border rounded-xl px-4 py-3 text-sm outline-none focus:border-emerald resize-none placeholder:text-muted disabled:opacity-50"
        />
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1 text-[11px]">
            {(["all", "message", "doc", "task", "deadline"] as const).map((s) => {
              const active = scope === s;
              return (
                <button
                  key={s}
                  disabled={phase === "running"}
                  onClick={() => setScope(s)}
                  className={`px-2.5 py-1 rounded-full border transition ${active ? "border-emerald bg-emerald/10 text-emerald" : "border-border text-muted hover:text-foreground"}`}
                >
                  {s === "all" ? "Everything" : s === "message" ? "Messages" : s === "doc" ? "Docs" : s === "task" ? "Tasks" : "Deadlines"}
                </button>
              );
            })}
          </div>
          <Button onClick={ask} disabled={!query.trim() || phase === "running"} size="sm">
            {phase === "running" ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
            Ask Sage
          </Button>
        </div>

        {/* Status */}
        {phase === "running" && (
          <div className="rounded-xl border border-emerald/20 bg-emerald/5 p-3 text-xs text-emerald inline-flex items-center gap-2">
            <Loader2 className="size-3.5 animate-spin" /> Sage is working…
          </div>
        )}
        {phase === "error" && err && (
          <div className="rounded-xl border border-rust/30 bg-rust/5 p-3 text-xs text-rust inline-flex items-center gap-2">
            <AlertCircle className="size-3.5" /> {err}
          </div>
        )}

        {/* Answer */}
        {phase === "answered" && run && <AnswerBlock run={run} onClose={onClose} />}

        {/* Reindex (admin) */}
        {isAdmin && (
          <details className="mt-2">
            <summary className="text-[11px] text-muted cursor-pointer hover:text-foreground transition">
              Admin: reindex this workspace
            </summary>
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <button
                onClick={reindex}
                disabled={reindexBusy}
                className="text-xs inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-emerald/30 text-emerald hover:bg-emerald/10 transition disabled:opacity-40"
              >
                {reindexBusy ? <Loader2 className="size-3 animate-spin" /> : <RotateCw className="size-3" />}
                Reindex now
              </button>
              {reindexMsg && <span className="text-[11px] text-muted">{reindexMsg}</span>}
            </div>
            <p className="mt-1 text-[10px] text-muted leading-snug">
              Sage uses an embedded index of this workspace&apos;s content. New writes index automatically; reindex if the index looks stale or if you&apos;ve recently moved a lot of content in.
            </p>
          </details>
        )}
      </div>
    </Dialog>
  );
}

type Citation = {
  index: number;
  title: string;
  href: string;
  entity_kind: string;
  similarity: number;
};

function AnswerBlock({ run, onClose }: { run: AgentRun; onClose: () => void }) {
  const output = run.output as Record<string, unknown>;
  const answer = String(output.answer ?? "");
  const citations = Array.isArray(output.citations) ? (output.citations as Citation[]) : [];
  const used = Array.isArray(output.used_citations) ? (output.used_citations as Citation[]) : [];
  const usedSet = new Set(used.map((c) => c.index));

  // Linkify [N] markers in the answer text.
  const segs = splitByCitations(answer);

  return (
    <div className="rounded-xl border border-emerald/30 bg-emerald/5 p-4 space-y-3">
      <div className="text-sm leading-relaxed">
        {segs.map((s, i) =>
          s.type === "text"
            ? <span key={i} className="whitespace-pre-wrap">{s.value}</span>
            : <span key={i} className="inline-flex items-center gap-0.5 mx-0.5 align-baseline">
              {s.indices.map((n) => {
                const c = citations.find((cc) => cc.index === n);
                if (!c) return <span key={n} className="text-muted text-[10px]">[{n}]</span>;
                return (
                  <Link
                    key={n}
                    href={c.href}
                    onClick={onClose}
                    title={c.title}
                    className="inline-flex items-center justify-center min-w-[18px] h-[16px] px-1 rounded-md bg-emerald/15 border border-emerald/30 text-emerald text-[10px] font-mono hover:bg-emerald/25 transition"
                  >
                    {n}
                  </Link>
                );
              })}
            </span>,
        )}
      </div>

      {used.length > 0 && (
        <div className="pt-3 border-t border-emerald/15">
          <div className="text-[10px] uppercase tracking-widest text-emerald mb-2">Cited from this workspace ({used.length})</div>
          <ul className="space-y-1">
            {citations.filter((c) => usedSet.has(c.index)).map((c) => (
              <li key={c.index} className="text-xs">
                <Link href={c.href} onClick={onClose} className="inline-flex items-center gap-2 text-foreground hover:text-emerald transition">
                  <span className="inline-flex items-center justify-center min-w-[18px] h-[16px] rounded-md bg-emerald/15 text-[9px] font-mono text-emerald">{c.index}</span>
                  <span className="truncate">{c.title}</span>
                  <span className="text-[10px] text-muted">· {c.entity_kind.replace("workspace_", "")} · {Math.round(c.similarity * 100)}%</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex justify-end pt-1">
        <Link href={`/studio/agent-runs/${run.id}`} onClick={onClose}>
          <Button size="sm" variant="ghost"><Eye className="size-3" /> Full run</Button>
        </Link>
      </div>
    </div>
  );
}

type Seg = { type: "text"; value: string } | { type: "cite"; indices: number[] };

function splitByCitations(answer: string): Seg[] {
  const segs: Seg[] = [];
  const re = /\[(\d+(?:\s*,\s*\d+)*)\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(answer)) !== null) {
    if (m.index > last) segs.push({ type: "text", value: answer.slice(last, m.index) });
    const indices = m[1].split(",").map((s) => parseInt(s.trim(), 10)).filter(Number.isFinite);
    segs.push({ type: "cite", indices });
    last = m.index + m[0].length;
  }
  if (last < answer.length) segs.push({ type: "text", value: answer.slice(last) });
  return segs;
}

