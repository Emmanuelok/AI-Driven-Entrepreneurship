"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";
import { Card, Button, Input, Textarea, Badge } from "@/components/ui";
import {
  MessageSquare, Plus, Pin, CheckCircle2, Loader2, Send, AlertCircle, X,
  Megaphone, HelpCircle, StickyNote,
} from "lucide-react";
import { Markdown } from "@/components/markdown";
import { MentionAutocompleteTextarea, type MentionCandidate } from "@/components/mention-autocomplete";
import { formatDistanceToNow } from "date-fns";

// Reusable: turn the cohort roster into mention candidates. Uses the
// same slug rules as src/lib/mentions.ts so what the user picks
// matches what the resolver hits.
function buildCandidates(members: { user_id: string; display_name: string | null; email: string | null }[]): MentionCandidate[] {
  return members.flatMap((m) => {
    const display = m.display_name || (m.email ? m.email.split("@")[0] : "Member");
    const token = m.display_name
      ? m.display_name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
      : (m.email ? m.email.split("@")[0].toLowerCase() : m.user_id.slice(0, 8));
    if (!token) return [];
    return [{ id: m.user_id, display, token }];
  });
}

// Highlight @mentions as emerald chips before passing to the markdown
// renderer. We do this with a pre-pass replace so links and code
// blocks inside the same body still work.
function highlightMentions(src: string): string {
  return src.replace(/(^|[^a-zA-Z0-9_`])@([a-zA-Z][a-zA-Z0-9._-]{1,30})/g, "$1**@$2**");
}

// Cohort discussions surface. Mount on /studio/cohorts/[id] — shows
// every thread (optionally filtered by assignment), opens an inline
// thread detail with realtime replies, lets any member start a new
// thread.
//
// Realtime: a single channel watches cohort_threads + cohort_thread_replies
// changes scoped to this cohort and refetches the visible list. We
// don't try to patch state in place — the list is small enough that a
// refetch is cheaper than reconciling delta events.

type ThreadKind = "question" | "note" | "announcement";
type Thread = {
  id: string;
  cohort_id: string;
  assignment_id: string | null;
  author_id: string;
  kind: ThreadKind;
  title: string;
  body: string;
  pinned: boolean;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  replyCount: number;
  lastReplyAt: string | null;
};
type Reply = { id: string; thread_id: string; author_id: string; body: string; created_at: string };

const KIND_META: Record<ThreadKind, { icon: typeof MessageSquare; label: string; tone: "emerald" | "amber" | "indigo" }> = {
  question: { icon: HelpCircle, label: "Question", tone: "indigo" },
  note: { icon: StickyNote, label: "Note", tone: "emerald" },
  announcement: { icon: Megaphone, label: "Announcement", tone: "amber" },
};

export function CohortDiscussions({
  cohortId,
  assignmentId,
  assignmentTitle,
  myRole,
  members,
}: {
  cohortId: string;
  assignmentId?: string;
  assignmentTitle?: string;
  myRole: "owner" | "instructor" | "student" | null;
  members: { user_id: string; display_name: string | null; email: string | null }[];
}) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [q, setQ] = useState("");

  const memberMap = new Map(members.map((m) => [m.user_id, m.display_name || m.email || "Member"]));

  const refresh = useCallback(async () => {
    try {
      const sb = supabaseBrowser();
      if (!sb) return;
      const { data: { session } } = await sb.auth.getSession();
      if (!session) { setLoading(false); return; }
      const url = new URL(`/api/v2/cohorts/${cohortId}/threads`, window.location.origin);
      if (assignmentId) url.searchParams.set("assignmentId", assignmentId);
      if (q.trim()) url.searchParams.set("q", q.trim());
      const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${session.access_token}` } });
      const data = await res.json();
      if (data.ok) setThreads(data.results ?? []);
    } finally { setLoading(false); }
  }, [cohortId, assignmentId, q]);

  // Debounce search so each keystroke doesn't refetch immediately;
  // empty query fetches instantly.
  useEffect(() => {
    const handle = setTimeout(refresh, q ? 200 : 0);
    return () => clearTimeout(handle);
  }, [refresh, q]);

  // Realtime: any thread or reply change in this cohort → refetch list.
  useEffect(() => {
    const sb = supabaseBrowser();
    if (!sb) return;
    const ch = sb.channel(`cohort-threads:${cohortId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "cohort_threads", filter: `cohort_id=eq.${cohortId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "cohort_thread_replies", filter: `cohort_id=eq.${cohortId}` }, refresh)
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [cohortId, refresh]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h2 className="text-xs uppercase tracking-[0.22em] text-emerald flex items-center gap-1.5">
          <MessageSquare className="size-3.5" /> Discussion
          {assignmentTitle && (
            <span className="text-muted normal-case tracking-normal text-[10px]">· filtered to <strong className="text-foreground">{assignmentTitle}</strong></span>
          )}
        </h2>
        <div className="flex items-center gap-2">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search threads…"
            className="bg-surface-2 border border-border rounded-full px-3 py-1 text-xs outline-none focus:border-emerald w-44"
          />
          <Button size="sm" variant="secondary" onClick={() => setComposing(true)}><Plus className="size-3" /> New thread</Button>
        </div>
      </div>

      {loading ? (
        <div className="text-xs text-muted italic inline-flex items-center gap-2"><Loader2 className="size-3 animate-spin" /> Loading…</div>
      ) : threads.length === 0 ? (
        <Card className="p-6 text-sm text-muted italic">
          {q.trim() ? `No threads match "${q.trim()}".`
            : assignmentTitle ? `No threads on "${assignmentTitle}" yet.`
            : "No discussions yet — start the first thread."}
        </Card>
      ) : (
        <ul className="space-y-2">
          {threads.map((t) => (
            <ThreadCard
              key={t.id}
              thread={t}
              authorName={memberMap.get(t.author_id) ?? "Member"}
              onOpen={() => setOpenId(t.id)}
            />
          ))}
        </ul>
      )}

      {composing && (
        <NewThreadDialog
          cohortId={cohortId}
          assignmentId={assignmentId ?? null}
          assignmentTitle={assignmentTitle}
          canAnnounce={myRole === "instructor" || myRole === "owner"}
          candidates={buildCandidates(members)}
          onClose={() => setComposing(false)}
          onDone={(newId) => { setComposing(false); refresh(); if (newId) setOpenId(newId); }}
        />
      )}

      {openId && (
        <ThreadDetailDialog
          cohortId={cohortId}
          threadId={openId}
          myRole={myRole}
          memberMap={memberMap}
          candidates={buildCandidates(members)}
          onClose={() => setOpenId(null)}
          onChanged={refresh}
        />
      )}
    </div>
  );
}

function ThreadCard({ thread, authorName, onOpen }: { thread: Thread; authorName: string; onOpen: () => void }) {
  const Meta = KIND_META[thread.kind];
  const Icon = Meta.icon;
  const lastTs = thread.lastReplyAt ?? thread.updated_at;
  return (
    <li>
      <button
        onClick={onOpen}
        className={`w-full text-left rounded-2xl border p-4 hover:border-emerald/40 transition ${thread.pinned ? "border-amber/40 bg-amber/5" : "border-border bg-surface-2/30"}`}
      >
        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
          <Badge color={Meta.tone}><Icon className="size-2.5 inline mr-1" />{Meta.label}</Badge>
          {thread.pinned && <Badge color="amber"><Pin className="size-2.5 inline mr-1" />Pinned</Badge>}
          {thread.resolved_at && <Badge color="emerald"><CheckCircle2 className="size-2.5 inline mr-1" />Resolved</Badge>}
          <span className="text-[10px] text-muted ml-auto">{formatDistanceToNow(new Date(lastTs), { addSuffix: true })}</span>
        </div>
        <div className="font-medium text-sm leading-snug">{thread.title}</div>
        <div className="mt-1 text-xs text-muted line-clamp-2 leading-relaxed">{thread.body}</div>
        <div className="mt-2 flex items-center justify-between text-[10px] text-muted">
          <span>by {authorName}</span>
          <span className="inline-flex items-center gap-1"><MessageSquare className="size-2.5" /> {thread.replyCount} {thread.replyCount === 1 ? "reply" : "replies"}</span>
        </div>
      </button>
    </li>
  );
}

// ─── New thread dialog ──────────────────────────────────────────────────
function NewThreadDialog({
  cohortId, assignmentId, assignmentTitle, canAnnounce, candidates, onClose, onDone,
}: {
  cohortId: string; assignmentId: string | null; assignmentTitle?: string;
  canAnnounce: boolean;
  candidates: MentionCandidate[];
  onClose: () => void; onDone: (newId: string | null) => void;
}) {
  const [kind, setKind] = useState<ThreadKind>("question");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true); setError(null);
    try {
      const sb = supabaseBrowser();
      if (!sb) return;
      const { data: { session } } = await sb.auth.getSession();
      if (!session) { setError("Sign in first."); return; }
      const res = await fetch(`/api/v2/cohorts/${cohortId}/threads`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ kind, assignmentId, title, body }),
      });
      const data = await res.json();
      if (!data.ok) { setError(data.error || "Couldn't post."); return; }
      onDone(data.id ?? null);
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-xl bg-surface border border-border rounded-2xl p-5 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium flex items-center gap-2"><MessageSquare className="size-4 text-emerald" /> New thread</h3>
          <button onClick={onClose} className="text-muted hover:text-foreground" aria-label="Close"><X className="size-4" /></button>
        </div>
        {assignmentTitle && (
          <p className="text-[10px] uppercase tracking-widest text-muted mb-3">Pinned to <strong className="text-foreground">{assignmentTitle}</strong></p>
        )}
        <div className="space-y-3">
          <div className="flex gap-1">
            {(["question", "note", ...(canAnnounce ? ["announcement" as const] : [])] as ThreadKind[]).map((k) => {
              const M = KIND_META[k];
              const I = M.icon;
              return (
                <button
                  key={k}
                  onClick={() => setKind(k)}
                  className={`text-[10px] uppercase tracking-widest px-2.5 py-1 rounded-full border transition inline-flex items-center gap-1 ${kind === k ? "border-emerald bg-emerald/10 text-emerald" : "border-border text-muted hover:text-foreground"}`}
                >
                  <I className="size-2.5" /> {M.label}
                </button>
              );
            })}
          </div>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="One-line title" autoFocus />
          <MentionAutocompleteTextarea value={body} onChange={setBody} candidates={candidates} rows={6} placeholder="What do you want to ask, share, or announce? Use @name to tag a cohort member." />
          <p className="text-[10px] text-muted">Tip: <code className="text-emerald">@firstname</code> notifies that cohort member.</p>
          {error && <div className="text-xs text-rust flex items-start gap-1.5"><AlertCircle className="size-3.5 shrink-0 mt-0.5" />{error}</div>}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button onClick={save} disabled={busy || title.trim().length < 3 || body.trim().length < 1}>{busy ? "Posting…" : "Post thread"}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Thread detail dialog ───────────────────────────────────────────────
function ThreadDetailDialog({
  cohortId, threadId, myRole, memberMap, candidates, onClose, onChanged,
}: {
  cohortId: string; threadId: string;
  myRole: "owner" | "instructor" | "student" | null;
  memberMap: Map<string, string>;
  candidates: MentionCandidate[];
  onClose: () => void; onChanged: () => void;
}) {
  const [thread, setThread] = useState<Thread | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);

  const isInstructor = myRole === "instructor" || myRole === "owner";

  const refresh = useCallback(async () => {
    try {
      const sb = supabaseBrowser();
      if (!sb) return;
      const { data: { session } } = await sb.auth.getSession();
      if (!session) return;
      const res = await fetch(`/api/v2/cohorts/${cohortId}/threads/${threadId}`, { headers: { Authorization: `Bearer ${session.access_token}` } });
      const data = await res.json();
      if (data.ok) {
        setThread(data.thread);
        setReplies(data.replies ?? []);
        setMyUserId(data.myUserId);
      }
    } catch { /* silent */ }
  }, [cohortId, threadId]);

  useEffect(() => { refresh(); }, [refresh]);

  // Realtime within the open thread — replies appear live.
  useEffect(() => {
    const sb = supabaseBrowser();
    if (!sb) return;
    const ch = sb.channel(`thread:${threadId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "cohort_thread_replies", filter: `thread_id=eq.${threadId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "cohort_threads", filter: `id=eq.${threadId}` }, refresh)
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [threadId, refresh]);

  async function sendReply() {
    if (!reply.trim()) return;
    setBusy(true);
    try {
      const sb = supabaseBrowser();
      if (!sb) return;
      const { data: { session } } = await sb.auth.getSession();
      if (!session) return;
      await fetch(`/api/v2/cohorts/${cohortId}/threads/${threadId}/replies`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ body: reply }),
      });
      setReply("");
      refresh();
      onChanged();
    } finally { setBusy(false); }
  }

  async function patch(p: { pinned?: boolean; resolved?: boolean }) {
    const sb = supabaseBrowser();
    if (!sb) return;
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return;
    await fetch(`/api/v2/cohorts/${cohortId}/threads/${threadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(p),
    });
    refresh();
    onChanged();
  }

  async function deleteThread() {
    if (!confirm("Delete this thread and all replies? Can't be undone.")) return;
    const sb = supabaseBrowser();
    if (!sb) return;
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return;
    await fetch(`/api/v2/cohorts/${cohortId}/threads/${threadId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    onChanged();
    onClose();
  }

  const isAuthor = thread && myUserId && thread.author_id === myUserId;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-2xl bg-surface border border-border rounded-2xl shadow-2xl flex flex-col max-h-[85vh]">
        {!thread ? (
          <div className="p-8 text-center text-sm text-muted italic">Loading thread…</div>
        ) : (
          <>
            <div className="p-5 border-b border-border">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <Badge color={KIND_META[thread.kind].tone}>{KIND_META[thread.kind].label}</Badge>
                {thread.pinned && <Badge color="amber"><Pin className="size-2.5 inline mr-1" />Pinned</Badge>}
                {thread.resolved_at && <Badge color="emerald"><CheckCircle2 className="size-2.5 inline mr-1" />Resolved</Badge>}
                <span className="text-[10px] text-muted ml-auto">{formatDistanceToNow(new Date(thread.created_at), { addSuffix: true })}</span>
                <button onClick={onClose} className="text-muted hover:text-foreground" aria-label="Close"><X className="size-4" /></button>
              </div>
              <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold leading-tight">{thread.title}</h2>
              <div className="text-[10px] text-muted mt-1">by {memberMap.get(thread.author_id) ?? "Member"}</div>

              <div className="mt-4 text-sm leading-relaxed prose-chat"><Markdown src={highlightMentions(thread.body)} /></div>

              {/* Author/instructor controls */}
              <div className="mt-4 flex items-center gap-2 text-[10px] uppercase tracking-widest">
                {isInstructor && (
                  <button onClick={() => patch({ pinned: !thread.pinned })} className="text-muted hover:text-amber inline-flex items-center gap-1 transition">
                    <Pin className="size-2.5" /> {thread.pinned ? "Unpin" : "Pin"}
                  </button>
                )}
                {(isAuthor || isInstructor) && (
                  <button onClick={() => patch({ resolved: !thread.resolved_at })} className="text-muted hover:text-emerald inline-flex items-center gap-1 transition">
                    <CheckCircle2 className="size-2.5" /> {thread.resolved_at ? "Reopen" : "Resolve"}
                  </button>
                )}
                {(isAuthor || isInstructor) && (
                  <button onClick={deleteThread} className="text-muted hover:text-rust inline-flex items-center gap-1 transition ml-auto">
                    Delete
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-3 bg-surface-2/30">
              {replies.length === 0 ? (
                <p className="text-xs text-muted italic text-center py-4">No replies yet — be the first.</p>
              ) : (
                replies.map((r) => (
                  <div key={r.id} className="text-sm">
                    <div className="text-[10px] text-muted mb-0.5">
                      <strong className="text-foreground">{memberMap.get(r.author_id) ?? "Member"}</strong>
                      {" · "}
                      {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                    </div>
                    <div className="leading-relaxed prose-chat"><Markdown src={highlightMentions(r.body)} /></div>
                  </div>
                ))
              )}
            </div>

            <div className="p-3 border-t border-border flex items-end gap-2">
              <MentionAutocompleteTextarea
                value={reply}
                onChange={setReply}
                candidates={candidates}
                rows={2}
                placeholder="Reply… (Cmd+Enter to send · @name to notify)"
                onKeyDownExtra={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); sendReply(); } }}
              />
              <Button onClick={sendReply} disabled={busy || !reply.trim()}><Send className="size-3.5" /></Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
