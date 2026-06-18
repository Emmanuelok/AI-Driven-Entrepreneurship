"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@/store";
import { useWorkspaceMessages } from "@/lib/use-workspace-content";
import { useDiscussionTyping } from "@/lib/use-discussion-presence";
import { useDiscussionReads } from "@/lib/use-discussion-reads";
import { MentionAutocompleteTextarea, type MentionCandidate } from "@/components/mention-autocomplete";
import { Markdown } from "@/components/markdown";
import type { WorkspaceMember } from "@/lib/workspace-api";
import { Send, Sparkles, Brain, Loader2, SmilePlus, Check, Pin, PinOff } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

// The workspace discussion thread. Members chat in real time; typing
// @sage summons the workspace AI to reply inline. Mentions of members
// notify them. The composer offers @-autocomplete over the member
// roster plus the reserved "sage" handle.

export function WorkspaceDiscussionPanel({ workspaceId, members, accent, isAdmin = false }: { workspaceId: string; members: WorkspaceMember[]; accent: string; isAdmin?: boolean }) {
  const { user } = useStore();
  const { messages, loading, sending, agentThinking, send, toggleReaction, togglePin } = useWorkspaceMessages(workspaceId);
  const { typing, signalTyping } = useDiscussionTyping(workspaceId, user ? { userId: user.id, name: user.name || "Member" } : null);
  const { seenCount, markRead } = useDiscussionReads(workspaceId);
  // Per-message hover state for the react picker — only one open at a
  // time. Tracked outside the message map so re-renders don't reset it.
  const [pickerFor, setPickerFor] = useState<string | null>(null);

  // Auto-advance our watermark when the panel is mounted and new
  // messages have landed. We use the latest message's created_at as
  // the watermark — the hook is monotonic + debounced so this is
  // cheap to re-fire on every render.
  useEffect(() => {
    if (loading || messages.length === 0) return;
    const latest = messages[messages.length - 1];
    void markRead(latest.created_at);
  }, [loading, messages, markRead]);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Mention candidates: every member + the reserved Sage handle.
  const candidates = useMemo<MentionCandidate[]>(() => {
    const memberCands: MentionCandidate[] = members
      .filter((m) => m.user_id !== user?.id)
      .map((m) => ({
        id: m.user_id,
        display: m.display_name || m.email || "Member",
        token: (m.display_name || m.email || "member").toLowerCase().split(/\s+/)[0].replace(/[^a-z0-9]/g, ""),
        hint: m.role,
      }));
    return [
      { id: "sage", display: "Sage (AI mentor)", token: "sage", hint: "ask the AI" },
      ...memberCands,
    ];
  }, [members, user?.id]);

  // Auto-scroll on new messages / thinking indicator.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, agentThinking]);

  async function onSend() {
    const text = draft.trim();
    if (!text || sending) return;
    setDraft("");
    const ok = await send(text);
    if (!ok) setDraft(text); // restore on failure
  }

  // Pinned messages: most-recently-pinned first. Capped at 3 in the
  // strip; the rest still live in the main thread with a pin chip.
  const pinned = messages
    .filter((m) => m.pinned_at)
    .sort((a, b) => new Date(b.pinned_at!).getTime() - new Date(a.pinned_at!).getTime())
    .slice(0, 3);

  return (
    <div className="glass rounded-2xl flex flex-col h-[560px] overflow-hidden">
      {pinned.length > 0 && (
        <div className="border-b border-border bg-surface-2/30 px-4 py-2.5">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-amber mb-1.5">
            <Pin className="size-3" /> Pinned · {pinned.length}
          </div>
          <ul className="space-y-1">
            {pinned.map((p) => (
              <li key={p.id} className="text-xs leading-snug flex items-start gap-2">
                <span className="text-foreground/80 font-medium shrink-0">{p.author_name || (p.is_agent ? "Sage" : "Member")}:</span>
                <span className="text-muted line-clamp-1 flex-1 min-w-0">{p.body}</span>
                {(isAdmin || p.user_id === user?.id) && !p.is_agent && (
                  <button
                    onClick={() => togglePin(p.id, true)}
                    className="size-5 rounded text-muted hover:text-amber hover:bg-surface-2 flex items-center justify-center shrink-0 transition"
                    title="Unpin"
                    aria-label="Unpin message"
                  >
                    <PinOff className="size-3" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-4">
        {loading ? (
          <div className="h-full flex items-center justify-center"><Loader2 className="size-5 text-emerald animate-spin" /></div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-6">
            <div className="size-12 rounded-2xl flex items-center justify-center mb-3" style={{ background: `${accent}1F`, border: `1px solid ${accent}55` }}>
              <Sparkles className="size-5" style={{ color: accent }} />
            </div>
            <p className="text-sm text-muted max-w-xs">
              No messages yet. Say hello to your team — or type <span className="text-emerald font-medium">@sage</span> to bring the AI mentor into the conversation.
            </p>
          </div>
        ) : (
          messages.map((m) => {
            const mine = m.user_id === user?.id;
            const reactions = m.reactions ?? [];
            return (
              <div key={m.id} className={`group flex gap-3 ${mine ? "flex-row-reverse" : ""}`}>
                <div
                  className="size-8 rounded-full flex items-center justify-center text-black font-semibold text-xs shrink-0"
                  style={{ background: m.is_agent ? "linear-gradient(135deg,#2cc295,#0c8f6a)" : "linear-gradient(135deg,#2cc295,#f4a949)" }}
                  title={m.author_name ?? "Member"}
                >
                  {m.is_agent ? <Brain className="size-4" /> : (m.author_name || "?")[0]?.toUpperCase()}
                </div>
                <div className={`min-w-0 max-w-[78%] ${mine ? "items-end text-right" : ""} flex flex-col`}>
                  <div className="flex items-center gap-2 text-[11px] text-muted mb-1">
                    <span className={m.is_agent ? "text-emerald font-medium" : "font-medium text-foreground/80"}>{m.is_agent ? "Sage" : (mine ? "You" : m.author_name)}</span>
                    <span>{formatDistanceToNow(new Date(m.created_at))} ago</span>
                  </div>
                  <div className="relative">
                    <div className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                      m.is_agent
                        ? "bg-emerald/10 border border-emerald/25"
                        : mine
                          ? "bg-surface-2 border border-border"
                          : "bg-surface-2/60 border border-border"
                    }`}>
                      {m.is_agent ? <Markdown src={m.body} className="prose-chat text-left" /> : <span className="whitespace-pre-wrap break-words">{m.body}</span>}
                    </div>
                    {/* Pin chip on already-pinned messages — always visible */}
                    {m.pinned_at && !m.is_agent && (
                      <span
                        className={`absolute -top-2 ${mine ? "-right-2" : "-left-2"} text-[9px] uppercase tracking-widest font-bold inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-amber/15 border border-amber/40 text-amber`}
                        title="Pinned"
                      >
                        <Pin className="size-2.5" /> Pinned
                      </span>
                    )}
                    {/* Hover-only pin/unpin trigger — admins + the author */}
                    {!m.is_agent && (isAdmin || m.user_id === user?.id) && (
                      <button
                        onClick={() => togglePin(m.id, !!m.pinned_at)}
                        className={`absolute -top-2 ${mine ? "-left-8" : "-right-8"} size-6 rounded-full bg-surface-2 border border-border hover:border-amber/40 hover:bg-amber/10 text-muted hover:text-amber flex items-center justify-center opacity-0 group-hover:opacity-100 transition`}
                        title={m.pinned_at ? "Unpin" : "Pin"}
                      >
                        {m.pinned_at ? <PinOff className="size-3" /> : <Pin className="size-3" />}
                      </button>
                    )}
                    {/* Hover-only react trigger */}
                    <button
                      onClick={() => setPickerFor((c) => c === m.id ? null : m.id)}
                      className={`absolute -top-2 ${mine ? "-left-2" : "-right-2"} size-6 rounded-full bg-surface-2 border border-border hover:border-emerald/40 hover:bg-emerald/10 text-muted hover:text-emerald flex items-center justify-center opacity-0 group-hover:opacity-100 transition`}
                      title="Add a reaction"
                    >
                      <SmilePlus className="size-3" />
                    </button>
                    {pickerFor === m.id && (
                      <div className={`absolute z-10 top-7 ${mine ? "left-0" : "right-0"} flex gap-0.5 bg-surface-2 border border-border rounded-full px-1.5 py-1 shadow-lg`}>
                        {(["👍", "✅", "👀", "❤️", "🎉", "🤔", "🚀", "👏"] as const).map((e) => {
                          const existing = reactions.find((r) => r.emoji === e);
                          return (
                            <button
                              key={e}
                              onClick={async () => { await toggleReaction(m.id, e, !!existing?.mine); setPickerFor(null); }}
                              className={`size-7 rounded-full hover:bg-surface text-base transition ${existing?.mine ? "bg-emerald/20" : ""}`}
                            >
                              {e}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  {reactions.length > 0 && (
                    <div className={`flex gap-1 flex-wrap mt-1 ${mine ? "justify-end" : ""}`}>
                      {reactions.map((r) => (
                        <button
                          key={r.emoji}
                          onClick={() => toggleReaction(m.id, r.emoji, r.mine)}
                          className={`text-[11px] inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full transition ${r.mine ? "bg-emerald/15 border border-emerald/40 text-emerald" : "bg-surface-2 border border-border text-muted hover:border-emerald/30"}`}
                          title={r.mine ? "Remove your reaction" : "React"}
                        >
                          <span>{r.emoji}</span>
                          <span>{r.count}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {mine && !m.is_agent && (() => {
                    // Seen-by count: the watermarks include MINE (I've
                    // by definition seen what I wrote), so subtract one.
                    const others = Math.max(0, seenCount(m.created_at) - 1);
                    if (others === 0) return null;
                    return (
                      <div className="text-[10px] text-muted mt-0.5 flex items-center gap-1 justify-end">
                        <Check className="size-2.5" />
                        Seen by {others}
                      </div>
                    );
                  })()}
                </div>
              </div>
            );
          })
        )}
        {agentThinking && (
          <div className="flex gap-3">
            <div className="size-8 rounded-full flex items-center justify-center shrink-0" style={{ background: "linear-gradient(135deg,#2cc295,#0c8f6a)" }}>
              <Brain className="size-4 text-black" />
            </div>
            <div className="bg-emerald/10 border border-emerald/25 rounded-2xl px-4 py-3 flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-emerald animate-pulse" />
              <span className="size-1.5 rounded-full bg-emerald animate-pulse" style={{ animationDelay: "0.15s" }} />
              <span className="size-1.5 rounded-full bg-emerald animate-pulse" style={{ animationDelay: "0.3s" }} />
              <span className="text-xs text-muted ml-1">Sage is thinking…</span>
            </div>
          </div>
        )}
      </div>

      {typing.length > 0 && (
        <div className="px-4 py-1.5 text-[11px] text-emerald flex items-center gap-1.5 border-t border-border/50">
          <span className="size-1.5 rounded-full bg-emerald animate-pulse" />
          {typing.length === 1 ? `${typing[0].name} is typing…` : typing.length === 2 ? `${typing[0].name} and ${typing[1].name} are typing…` : `${typing[0].name} and ${typing.length - 1} others are typing…`}
        </div>
      )}

      <div className={`border-t border-border p-3 ${typing.length > 0 ? "" : "mt-0"}`}>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <MentionAutocompleteTextarea
              value={draft}
              onChange={(v) => { setDraft(v); signalTyping(); }}
              candidates={candidates}
              rows={1}
              placeholder="Message your team — @sage to ask the AI…"
              className="!bg-surface-2/60 resize-none max-h-32"
              onKeyDownExtra={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void onSend(); }
              }}
            />
          </div>
          <button
            onClick={onSend}
            disabled={sending || !draft.trim()}
            className="size-10 rounded-xl bg-emerald text-black hover:bg-amber disabled:opacity-30 transition flex items-center justify-center shrink-0"
            title="Send (Enter)"
          >
            {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </button>
        </div>
        <p className="mt-1.5 text-[10px] text-muted px-1">Enter to send · Shift+Enter for a new line · @ to mention</p>
      </div>
    </div>
  );
}
