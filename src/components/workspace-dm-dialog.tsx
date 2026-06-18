"use client";

import { useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";
import { useStore } from "@/store";
import { workspaceApi } from "@/lib/workspace-api";
import { Send, Loader2, X, MessageSquare } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { RealtimeChannel } from "@supabase/supabase-js";

type DMMessage = { id: string; sender_user_id: string; body: string; created_at: string };

// 1-on-1 DM dialog scoped to one workspace. Opens with a specific
// member; resolves (or creates) the canonical thread for the pair,
// loads history, and subscribes to realtime inserts on that thread.
//
// Kept as a modal (rather than a sidebar/tab) so a member can fire off
// a quick note without leaving whatever tab they were on.

export function WorkspaceDmDialog({
  workspaceId, withUserId, withName, accent, onClose,
}: {
  workspaceId: string; withUserId: string; withName: string; accent: string; onClose: () => void;
}) {
  const { user } = useStore();
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DMMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const seenIds = useRef<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  function merge(incoming: DMMessage[]) {
    setMessages((prev) => {
      const next = [...prev];
      for (const m of incoming) {
        if (seenIds.current.has(m.id)) continue;
        seenIds.current.add(m.id);
        next.push(m);
      }
      next.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      return next;
    });
  }

  // Open or find the thread, load history.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      seenIds.current = new Set();
      setMessages([]);
      const opened = await workspaceApi.openDmThread(workspaceId, withUserId);
      if (cancelled || !opened.ok) { if (!opened.ok && !cancelled) setErr(opened.error); setLoading(false); return; }
      setThreadId(opened.thread.id);
      const listed = await workspaceApi.listDmMessages(workspaceId, opened.thread.id);
      if (cancelled) return;
      if (listed.ok) merge(listed.results);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [workspaceId, withUserId]);

  // Realtime: subscribe to inserts on THIS thread only (the filter
  // narrows the channel so peers' other threads don't wake us up).
  useEffect(() => {
    if (!threadId || !user) return;
    const sb = supabaseBrowser();
    if (!sb) return;
    const ch = sb.channel(`workspace-dm:${threadId}`);
    ch.on("postgres_changes" as never, { event: "INSERT", schema: "public", table: "workspace_dm_messages", filter: `thread_id=eq.${threadId}` }, (payload: { new: DMMessage }) => {
      if (payload.new) merge([payload.new]);
    });
    ch.subscribe();
    channelRef.current = ch;
    return () => { void sb.removeChannel(ch); channelRef.current = null; };
  }, [threadId, user?.id]);

  // Auto-scroll on new messages.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, sending]);

  async function send() {
    const text = draft.trim();
    if (!text || sending || !threadId) return;
    setDraft("");
    setSending(true);
    setErr(null);
    // Optimistic — let the realtime echo replace if it lands.
    const tempId = `tmp-${Date.now()}`;
    merge([{ id: tempId, sender_user_id: user?.id ?? "", body: text, created_at: new Date().toISOString() }]);
    const r = await workspaceApi.sendDmMessage(workspaceId, threadId, text);
    setSending(false);
    if (!r.ok) {
      setErr(r.error);
      // Roll back optimistic + restore draft.
      seenIds.current.delete(tempId);
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setDraft(text);
      return;
    }
    // Replace temp with real (realtime may also deliver it; merge dedupes).
    seenIds.current.delete(tempId);
    setMessages((prev) => {
      const cleaned = prev.filter((m) => m.id !== tempId);
      return cleaned;
    });
    merge([r.message]);
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-3 sm:p-5 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="glass rounded-3xl max-w-md w-full max-h-[85vh] flex flex-col overflow-hidden relative" onClick={(e) => e.stopPropagation()}>
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-20 right-0 size-48 rounded-full blur-3xl opacity-15" style={{ background: accent }} />
        </div>
        <div className="relative flex items-center gap-3 px-5 py-3.5 border-b border-border">
          <div className="size-9 rounded-full bg-gradient-to-br from-emerald to-amber flex items-center justify-center text-black font-semibold text-xs">
            {withName[0]?.toUpperCase() ?? "?"}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-medium text-sm flex items-center gap-1.5">
              {withName}
              <span className="text-[10px] uppercase tracking-widest text-muted flex items-center gap-1.5 ml-1">
                <MessageSquare className="size-2.5" /> direct
              </span>
            </h2>
            <p className="text-[11px] text-muted">Private to the two of you.</p>
          </div>
          <button onClick={onClose} className="size-8 rounded-lg text-muted hover:text-foreground hover:bg-surface-2 flex items-center justify-center transition" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>

        <div ref={scrollRef} className="relative flex-1 overflow-y-auto p-4 space-y-3 min-h-[280px]">
          {loading ? (
            <div className="h-full flex items-center justify-center"><Loader2 className="size-5 text-emerald animate-spin" /></div>
          ) : messages.length === 0 ? (
            <p className="text-center text-xs text-muted italic py-8">No messages yet. Say hello.</p>
          ) : (
            messages.map((m) => {
              const mine = m.sender_user_id === user?.id;
              return (
                <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${mine ? "bg-emerald/15 border border-emerald/30" : "bg-surface-2 border border-border"}`}>
                    <div className="whitespace-pre-wrap break-words">{m.body}</div>
                    <div className="text-[10px] text-muted mt-1">{formatDistanceToNow(new Date(m.created_at))} ago</div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="relative border-t border-border p-3">
          <div className="flex items-end gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
              placeholder={`Message ${withName}…`}
              rows={1}
              disabled={sending || loading}
              className="flex-1 bg-surface-2/60 border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-emerald resize-none max-h-32 placeholder:text-muted"
              autoFocus
            />
            <button
              onClick={send}
              disabled={sending || loading || !draft.trim()}
              className="size-10 rounded-xl bg-emerald text-black hover:bg-amber disabled:opacity-30 transition flex items-center justify-center shrink-0"
              title="Send (Enter)"
            >
              {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            </button>
          </div>
          {err && <p className="mt-1.5 text-[11px] text-rust px-1">Couldn&apos;t send: {err}</p>}
        </div>
      </div>
    </div>
  );
}
