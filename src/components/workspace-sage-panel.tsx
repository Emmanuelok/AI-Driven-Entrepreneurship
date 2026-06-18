"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { workspaceApi, type WorkspaceMember } from "@/lib/workspace-api";
import { buildSiteContextSnapshotAsync } from "@/lib/site-brain-snapshot";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui";
import { useMentionAutocomplete, MentionDropdown } from "@/components/use-mention-autocomplete";
import { buildMentionCandidates } from "@/lib/workspace-mentions";
import { useStore } from "@/store";
import { Brain, Send, Loader2, Trash2, Sparkles } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type Msg = { id: string; role: "user" | "assistant"; content: string; created_at: string };

// Personal Sage advisor — private, persistent back-and-forth scoped to
// one workspace. Sage gets the workspace state (recent discussion,
// notes, deadlines, tasks) loaded into the system prompt on every turn,
// so advice stays grounded in what the team is actually doing without
// the user having to re-explain.

export function WorkspaceSagePanel({ workspaceId, accent, members = [] }: { workspaceId: string; accent: string; members?: WorkspaceMember[] }) {
  const { user } = useStore();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Mention candidates: workspace members (without the signed-in user).
  // No reserved Sage handle — you're already chatting with Sage.
  const candidates = useMemo(
    () => buildMentionCandidates(members, { excludeUserId: user?.id }),
    [members, user?.id],
  );
  const mention = useMentionAutocomplete({ value: draft, candidates, onChange: setDraft });

  // Initial load.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await workspaceApi.getSageThread(workspaceId);
      if (cancelled) return;
      if (r.ok) setMessages(r.messages as Msg[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [workspaceId]);

  // Auto-scroll on new messages.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, sending]);

  async function send() {
    const text = draft.trim();
    if (!text || sending) return;
    setDraft("");
    setSending(true);
    setErr(null);
    // Optimistic user-side echo so the input feels responsive.
    const tempId = `tmp-${Date.now()}`;
    setMessages((prev) => [...prev, { id: tempId, role: "user", content: text, created_at: new Date().toISOString() }]);
    const siteContext = await buildSiteContextSnapshotAsync("workspace-sage");
    const r = await workspaceApi.sendToSage(workspaceId, text, siteContext);
    setSending(false);
    if (!r.ok) {
      setErr(r.error);
      // Roll back the optimistic echo.
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setDraft(text);
      return;
    }
    // Replace the temp with the real user message + append assistant.
    setMessages((prev) => [
      ...prev.filter((m) => m.id !== tempId),
      r.userMessage as Msg,
      r.assistantMessage as Msg,
    ]);
  }

  async function clear() {
    if (!confirm("Clear this conversation with Sage? The workspace state is unchanged — only your thread resets.")) return;
    await workspaceApi.clearSageThread(workspaceId);
    setMessages([]);
  }

  return (
    <div className="glass rounded-2xl flex flex-col h-[640px] overflow-hidden relative">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-20 right-0 size-56 rounded-full blur-3xl opacity-15" style={{ background: accent }} />
      </div>
      <div className="relative flex items-center gap-3 px-5 py-3.5 border-b border-border">
        <div className="size-9 rounded-xl bg-gradient-to-br from-emerald to-emerald-deep flex items-center justify-center text-black">
          <Brain className="size-4" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-medium text-sm flex items-center gap-1.5">Ask Sage <span className="size-1.5 rounded-full bg-emerald pulse-dot" /></h2>
          <p className="text-[11px] text-muted">Private to you. Sage has this workspace&apos;s notes, deadlines, tasks, and recent discussion loaded.</p>
        </div>
        {messages.length > 0 && (
          <button onClick={clear} className="size-8 rounded-lg text-muted hover:text-rust hover:bg-rust/10 flex items-center justify-center transition" title="Clear conversation">
            <Trash2 className="size-3.5" />
          </button>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-4 relative">
        {loading ? (
          <div className="h-full flex items-center justify-center"><Loader2 className="size-5 text-emerald animate-spin" /></div>
        ) : messages.length === 0 ? (
          <EmptyState accent={accent} onPick={(p) => setDraft(p)} />
        ) : (
          messages.map((m) => {
            const isUser = m.role === "user";
            return (
              <div key={m.id} className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
                <div
                  className="size-7 rounded-full flex items-center justify-center text-black font-semibold text-[10px] shrink-0"
                  style={{ background: isUser ? "linear-gradient(135deg,#2cc295,#f4a949)" : "linear-gradient(135deg,#2cc295,#0c8f6a)" }}
                >
                  {isUser ? "You" : <Brain className="size-3.5" />}
                </div>
                <div className={`min-w-0 max-w-[80%] ${isUser ? "items-end" : ""} flex flex-col`}>
                  <div className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${isUser ? "bg-surface-2 border border-border" : "bg-emerald/10 border border-emerald/25"}`}>
                    {isUser ? <span className="whitespace-pre-wrap break-words">{m.content}</span> : <Markdown src={m.content} className="prose-chat" />}
                  </div>
                  <div className="text-[10px] text-muted mt-1">{formatDistanceToNow(new Date(m.created_at))} ago</div>
                </div>
              </div>
            );
          })
        )}
        {sending && (
          <div className="flex gap-3">
            <div className="size-7 rounded-full flex items-center justify-center shrink-0" style={{ background: "linear-gradient(135deg,#2cc295,#0c8f6a)" }}>
              <Brain className="size-3.5 text-black" />
            </div>
            <div className="bg-emerald/10 border border-emerald/25 rounded-2xl px-4 py-3 flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-emerald animate-pulse" />
              <span className="size-1.5 rounded-full bg-emerald animate-pulse" style={{ animationDelay: "0.15s" }} />
              <span className="size-1.5 rounded-full bg-emerald animate-pulse" style={{ animationDelay: "0.3s" }} />
              <span className="text-xs text-muted ml-1">Sage is reading the workspace…</span>
            </div>
          </div>
        )}
      </div>

      <div className="relative border-t border-border p-3">
        <div className="flex items-end gap-2">
          <div className="relative flex-1">
            <textarea
              ref={mention.ref}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onClick={mention.onClick}
              onKeyDown={(e) => {
                if (mention.handleKey(e)) return;
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); }
              }}
              placeholder="What do you want to think through?"
              rows={1}
              disabled={sending}
              className="w-full bg-surface-2/60 border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-emerald resize-none max-h-32 placeholder:text-muted"
            />
            {mention.open && (
              <MentionDropdown filtered={mention.filtered} active={mention.active} onInsert={mention.insert} anchorRef={mention.ref} />
            )}
          </div>
          <button
            onClick={send}
            disabled={sending || !draft.trim()}
            className="size-10 rounded-xl bg-emerald text-black hover:bg-amber disabled:opacity-30 transition flex items-center justify-center shrink-0"
            title="Send (Enter)"
          >
            {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </button>
        </div>
        <p className="mt-1.5 text-[10px] text-muted px-1">Enter to send · Shift+Enter for a new line. Sage&apos;s answers are private to you.</p>
        {err && <p className="mt-1.5 text-[11px] text-rust px-1">Couldn&apos;t reach Sage: {err}</p>}
      </div>
    </div>
  );
}

function EmptyState({ accent, onPick }: { accent: string; onPick: (prompt: string) => void }) {
  const starters = [
    "What's the riskiest thing in this workspace right now?",
    "Who's blocked, and what would unblock them?",
    "Help me write a status update for the team.",
    "What should I focus on this week?",
  ];
  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-6">
      <div className="size-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: `${accent}1F`, border: `1px solid ${accent}55` }}>
        <Sparkles className="size-6" style={{ color: accent }} />
      </div>
      <h3 className="font-[family-name:var(--font-display)] text-xl font-semibold">A private back-and-forth.</h3>
      <p className="mt-2 text-sm text-muted max-w-md leading-relaxed">
        Sage already knows what&apos;s in this workspace. Ask anything — strategy, what to say to a teammate, how to scope a piece of work. It stays between you two.
      </p>
      <div className="mt-5 grid sm:grid-cols-2 gap-2 max-w-md w-full">
        {starters.map((s) => (
          <button
            key={s}
            onClick={() => onPick(s)}
            className="text-left text-xs px-3 py-2 rounded-lg border border-border hover:border-emerald/40 hover:bg-surface-2 transition text-muted hover:text-foreground"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
