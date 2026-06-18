"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { profileApi, type ContactRequest } from "@/lib/profile-api";
import { getAccountTypeDef } from "@/lib/account-types";
import { Card, Button, Badge, Textarea } from "@/components/ui";
import { formatDistanceToNow } from "date-fns";
import { Inbox as InboxIcon, Send, Loader2, Check, X, Archive, Mail } from "lucide-react";

// Contact inbox. Two tabs: requests you've RECEIVED (act on them) and
// requests you've SENT (track responses). The received list is the
// point — accept/decline with an optional reply that the sender sees.

export default function InboxPage() {
  const [tab, setTab] = useState<"received" | "sent">("received");
  const [received, setReceived] = useState<ContactRequest[]>([]);
  const [sent, setSent] = useState<ContactRequest[]>([]);
  const [loading, setLoading] = useState(true);

  async function load(markRead = false) {
    const r = await profileApi.getContacts(markRead);
    if (r.ok) { setReceived(r.received); setSent(r.sent); }
    setLoading(false);
  }

  useEffect(() => { void load(true); }, []);

  const activeReceived = received.filter((r) => r.status !== "archived");

  return (
    <div className="max-w-3xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <div className="mb-8">
        <p className="text-xs uppercase tracking-[0.22em] text-emerald mb-2 flex items-center gap-1.5">
          <InboxIcon className="size-3.5" /> Inbox
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight">
          Your connection requests.
        </h1>
        <p className="mt-3 text-muted max-w-2xl leading-relaxed">
          Intros people sent you through your profile, and the ones you sent out. Accept to open a reply; decline to politely close it.
        </p>
      </div>

      <div className="flex items-center gap-1 mb-6">
        {([
          { id: "received", label: `Received (${activeReceived.length})` },
          { id: "sent", label: `Sent (${sent.length})` },
        ] as const).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-full text-sm border transition ${tab === t.id ? "border-emerald bg-emerald/10 text-emerald" : "border-border text-muted hover:text-foreground"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="size-6 text-emerald animate-spin" /></div>
      ) : tab === "received" ? (
        activeReceived.length === 0 ? (
          <EmptyInbox kind="received" />
        ) : (
          <div className="space-y-3">
            {activeReceived.map((r) => (
              <ReceivedCard key={r.id} req={r} onChanged={() => load(false)} />
            ))}
          </div>
        )
      ) : sent.length === 0 ? (
        <EmptyInbox kind="sent" />
      ) : (
        <div className="space-y-3">
          {sent.map((r) => (
            <SentCard key={r.id} req={r} />
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyInbox({ kind }: { kind: "received" | "sent" }) {
  return (
    <Card className="p-10 text-center">
      <Mail className="size-8 text-emerald mx-auto mb-3" />
      <p className="text-muted leading-relaxed max-w-md mx-auto">
        {kind === "received"
          ? "No requests yet. When someone reaches out through your public profile, it lands here. Make sure your profile is public so people can find you."
          : "You haven't sent any requests yet. Browse the "}
        {kind === "sent" && <Link href="/people" className="text-emerald hover:underline">People directory</Link>}
        {kind === "sent" && " and reach out to a mentor, investor, or founder."}
        {kind === "received" && <> <Link href="/studio/profile" className="text-emerald hover:underline">Edit your profile</Link>.</>}
      </p>
    </Card>
  );
}

function StatusBadge({ status }: { status: ContactRequest["status"] }) {
  const map: Record<ContactRequest["status"], { color: "emerald" | "amber" | "rust" | "muted"; label: string }> = {
    pending: { color: "amber", label: "Pending" },
    accepted: { color: "emerald", label: "Accepted" },
    declined: { color: "rust", label: "Declined" },
    archived: { color: "muted", label: "Archived" },
  };
  const m = map[status];
  return <Badge color={m.color}>{m.label}</Badge>;
}

function ReceivedCard({ req, onChanged }: { req: ContactRequest; onChanged: () => void }) {
  const def = getAccountTypeDef(req.from_account_type as never);
  const [replying, setReplying] = useState<"accepted" | "declined" | null>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);

  async function respond(status: "accepted" | "declined" | "archived", withReply = false) {
    setBusy(true);
    await profileApi.respondToContact(req.id, status, withReply ? reply.trim() || undefined : undefined);
    setBusy(false);
    setReplying(null);
    onChanged();
  }

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium">{req.from_name}</span>
          <span className="text-[11px] text-muted">{def.emoji} {def.label}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <StatusBadge status={req.status} />
          <span className="text-[11px] text-muted">{formatDistanceToNow(new Date(req.created_at))} ago</span>
        </div>
      </div>
      {req.subject && <div className="text-sm font-medium mb-1">{req.subject}</div>}
      <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">{req.body}</p>

      {req.reply_body && (
        <div className="mt-3 pt-3 border-t border-border">
          <div className="text-[10px] uppercase tracking-widest text-muted mb-1">Your reply</div>
          <p className="text-sm text-muted leading-relaxed whitespace-pre-wrap">{req.reply_body}</p>
        </div>
      )}

      {req.status === "pending" && (
        replying ? (
          <div className="mt-4 space-y-2">
            <Textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              rows={3}
              placeholder={replying === "accepted"
                ? "Optional: how to continue — your email, a calendar link, or 'I'll DM you in a workspace'."
                : "Optional: a kind note on why now isn't a fit."}
            />
            <div className="flex items-center gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setReplying(null)} disabled={busy}>Cancel</Button>
              <Button size="sm" onClick={() => respond(replying, true)} disabled={busy}>
                {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                {replying === "accepted" ? "Accept + send reply" : "Decline + send note"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-4 flex items-center gap-2 flex-wrap">
            <Button size="sm" onClick={() => setReplying("accepted")} disabled={busy}><Check className="size-3.5" /> Accept</Button>
            <Button size="sm" variant="secondary" onClick={() => setReplying("declined")} disabled={busy}><X className="size-3.5" /> Decline</Button>
            <Button size="sm" variant="ghost" onClick={() => respond("archived")} disabled={busy}><Archive className="size-3.5" /> Archive</Button>
          </div>
        )
      )}

      {req.status !== "pending" && req.status !== "archived" && (
        <div className="mt-3">
          <Button size="sm" variant="ghost" onClick={() => respond("archived")} disabled={busy}><Archive className="size-3.5" /> Archive</Button>
        </div>
      )}
    </Card>
  );
}

function SentCard({ req }: { req: ContactRequest }) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3 mb-2">
        <span className="text-sm text-muted">Request sent</span>
        <div className="flex items-center gap-2 shrink-0">
          <StatusBadge status={req.status} />
          <span className="text-[11px] text-muted">{formatDistanceToNow(new Date(req.created_at))} ago</span>
        </div>
      </div>
      {req.subject && <div className="text-sm font-medium mb-1">{req.subject}</div>}
      <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">{req.body}</p>
      {req.status === "accepted" && req.reply_body && (
        <div className="mt-3 pt-3 border-t border-emerald/20 bg-emerald/5 -mx-5 -mb-5 px-5 pb-5 rounded-b-2xl">
          <div className="text-[10px] uppercase tracking-widest text-emerald mb-1 mt-3">They replied</div>
          <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">{req.reply_body}</p>
        </div>
      )}
      {req.status === "declined" && (
        <p className="mt-3 text-xs text-muted italic">{req.reply_body || "This request was declined."}</p>
      )}
      {req.status === "pending" && (
        <p className="mt-3 text-xs text-muted italic">Waiting for a response.</p>
      )}
    </Card>
  );
}
