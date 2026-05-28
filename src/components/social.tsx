"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase";
import { Hand, MessageCircle, Send, AlertCircle, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type Kind = "build" | "venture";

// ─── Claps ────────────────────────────────────────────────────────────────
export function Claps({ kind, slug }: { kind: Kind; slug: string }) {
  const [total, setTotal] = useState<number | null>(null);
  const [mine, setMine] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const sb = supabaseBrowser();
      const headers: Record<string, string> = {};
      if (sb) {
        const { data: { session } } = await sb.auth.getSession();
        if (session) headers.Authorization = `Bearer ${session.access_token}`;
      }
      try {
        const res = await fetch(`/api/social/clap?kind=${kind}&slug=${encodeURIComponent(slug)}`, { headers });
        const data = await res.json();
        if (data.ok) { setTotal(data.total); setMine(data.mine); }
      } catch { /* network error → leave as null */ }
    })();
  }, [kind, slug]);

  async function toggle() {
    if (busy) return;
    setBusy(true);
    try {
      const sb = supabaseBrowser();
      if (!sb) return;
      const { data: { session } } = await sb.auth.getSession();
      if (!session) { alert("Sign in to clap."); return; }
      const headers = { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` };
      const res = await fetch(`/api/social/clap${mine ? `?kind=${kind}&slug=${encodeURIComponent(slug)}` : ""}`, {
        method: mine ? "DELETE" : "POST",
        headers,
        body: mine ? undefined : JSON.stringify({ kind, slug }),
      });
      const data = await res.json();
      if (data.ok) { setTotal(data.total); setMine(data.mine); }
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={busy}
      aria-pressed={mine}
      aria-label={mine ? "Remove clap" : "Clap for this"}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition ${mine ? "bg-emerald/10 border-emerald/40 text-emerald" : "border-border text-muted hover:border-emerald/40 hover:text-emerald"}`}
    >
      <Hand className={`size-3.5 ${mine ? "" : ""}`} />
      <span className="text-xs font-medium">{total ?? "—"}</span>
    </button>
  );
}

// ─── Comments ─────────────────────────────────────────────────────────────
type Comment = { id: string; user_id: string; author_name: string; body: string; created_at: string };

export function Comments({ kind, slug }: { kind: Kind; slug: string }) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      // Who am I (for showing the delete button on my own comments)?
      try {
        const sb = supabaseBrowser();
        if (sb) {
          const { data: { session } } = await sb.auth.getSession();
          setMe(session?.user.id ?? null);
        }
      } catch { /* anonymous is fine */ }
      try {
        const res = await fetch(`/api/social/comments?kind=${kind}&slug=${encodeURIComponent(slug)}`);
        const data = await res.json();
        if (data.ok) setComments(data.results);
      } catch { /* leave list empty */ }
      setLoaded(true);
    })();
  }, [kind, slug]);

  async function post() {
    if (!draft.trim() || busy) return;
    setBusy(true); setError(null);
    try {
      const sb = supabaseBrowser();
      if (!sb) { setError("Cloud sync isn't configured."); return; }
      const { data: { session } } = await sb.auth.getSession();
      if (!session) { setError("Sign in to comment."); return; }
      const res = await fetch("/api/social/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ kind, slug, body: draft.trim() }),
      });
      const data = await res.json();
      if (!data.ok) { setError(data.reason || data.error || "Couldn't post comment."); return; }
      setComments([data.comment, ...comments]);
      setDraft("");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this comment?")) return;
    try {
      const sb = supabaseBrowser();
      if (!sb) return;
      const { data: { session } } = await sb.auth.getSession();
      if (!session) return;
      await fetch(`/api/social/comments?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      setComments(comments.filter((c) => c.id !== id));
    } catch { /* swallow */ }
  }

  return (
    <section className="space-y-4" aria-label="Comments">
      <h3 className="font-medium flex items-center gap-2"><MessageCircle className="size-4 text-emerald" /> Comments {loaded && <span className="text-xs text-muted">({comments.length})</span>}</h3>

      <div className="rounded-2xl border border-border bg-surface-2/30 p-3">
        {!me ? (
          <div className="text-xs text-muted flex items-center justify-between gap-2 px-1">
            <span>Sign in to leave a comment.</span>
            <Link href="/sign-in" className="text-emerald hover:underline">Sign in →</Link>
          </div>
        ) : (
          <>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Share what you noticed — what worked, what to improve, what to remix."
              rows={3}
              maxLength={2000}
              className="w-full bg-transparent text-sm outline-none resize-y placeholder:text-muted"
            />
            <div className="flex items-center justify-between mt-2">
              <span className="text-[10px] text-muted">{draft.length}/2000</span>
              <button
                onClick={post}
                disabled={busy || !draft.trim()}
                className="bg-emerald text-black text-xs font-medium px-3 py-1.5 rounded-full hover:bg-amber disabled:opacity-30 transition inline-flex items-center gap-1.5"
              >
                <Send className="size-3" /> {busy ? "…" : "Post"}
              </button>
            </div>
            {error && <div className="mt-2 text-xs text-rust flex items-start gap-1.5"><AlertCircle className="size-3 shrink-0 mt-0.5" />{error}</div>}
          </>
        )}
      </div>

      {comments.length === 0 ? (
        loaded && <p className="text-xs text-muted italic">Be the first to comment.</p>
      ) : (
        <ul className="space-y-3">
          {comments.map((c) => (
            <li key={c.id} className="rounded-xl border border-border bg-surface-2/30 p-3 group">
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="text-xs">
                  <span className="font-medium">{c.author_name}</span>{" "}
                  <span className="text-muted">· {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}</span>
                </div>
                {me === c.user_id && (
                  <button onClick={() => remove(c.id)} className="opacity-0 group-hover:opacity-100 transition text-muted hover:text-rust" aria-label="Delete your comment">
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>
              <p className="text-sm whitespace-pre-wrap leading-relaxed">{c.body}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
