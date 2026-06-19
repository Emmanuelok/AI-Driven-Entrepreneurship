"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, notFound, useSearchParams } from "next/navigation";
import { profileApi, type MentorSession } from "@/lib/profile-api";
import { supabaseBrowser } from "@/lib/supabase";
import { Card, Badge, Button, Textarea, Input, Dialog } from "@/components/ui";
import { Loader2, ArrowLeft, GraduationCap, CreditCard, CheckCircle2, X, Calendar, AlertCircle, Star, RefreshCw } from "lucide-react";
import {
  statusLabel, formatPriceUsd, mentorTakeHomeCents,
  nextStatusesForActor, type MentorSessionStatus,
} from "@/lib/mentor-session-state";
import { format } from "date-fns";
import { Suspense } from "react";

// /studio/mentor-sessions/[id] — full session detail + actions.
// Two parties (mentor + founder); the button row adapts to which side
// the viewer is on.

const STATUS_COLOR: Record<MentorSessionStatus, "muted" | "amber" | "emerald" | "indigo" | "rust"> = {
  requested: "amber",
  accepted: "indigo",
  paid: "emerald",
  completed: "emerald",
  reviewed: "muted",
  cancelled: "muted",
  refunded: "rust",
};

export default function MentorSessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div className="min-h-[40vh] flex items-center justify-center"><Loader2 className="size-6 text-emerald animate-spin" /></div>}>
      <Inner params={params} />
    </Suspense>
  );
}

function Inner({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const justPaid = searchParams?.get("paid") === "1";
  const { id } = use(params);

  const [session, setSession] = useState<MentorSession | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [otherName, setOtherName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    const sb = supabaseBrowser();
    let uid: string | null = null;
    if (sb) {
      const { data } = await sb.auth.getSession();
      uid = data.session?.user.id ?? null;
      setMyUserId(uid);
    }
    const r = await profileApi.getMentorSession(id);
    if (!r.ok) { setMissing(true); setLoading(false); return; }
    setSession(r.session);
    // Resolve the OTHER party's display name for nicer copy.
    if (sb && uid) {
      const other = r.session.mentor_user_id === uid ? r.session.founder_user_id : r.session.mentor_user_id;
      const { data: prof } = await sb.from("user_profiles").select("display_name").eq("user_id", other).maybeSingle();
      setOtherName((prof as { display_name?: string } | null)?.display_name ?? null);
    }
    setLoading(false);
  }
  useEffect(() => { void load(); }, [id]);

  // Realtime: when the mentor accepts or the webhook flips status to
  // paid, the founder's UI should light up live. Subscribe + refetch
  // on any change to this row.
  useEffect(() => {
    const sb = supabaseBrowser();
    if (!sb) return;
    const ch = sb.channel(`mentor-session:${id}`);
    ch.on(
      "postgres_changes" as never,
      { event: "UPDATE", schema: "public", table: "mentor_sessions", filter: `id=eq.${id}` },
      () => void load(),
    );
    ch.subscribe();
    return () => { void sb.removeChannel(ch); };
  }, [id]);

  if (loading) return <div className="min-h-[40vh] flex items-center justify-center"><Loader2 className="size-6 text-emerald animate-spin" /></div>;
  if (missing || !session) { notFound(); return null; }
  const amMentor = session.mentor_user_id === myUserId;
  const amFounder = session.founder_user_id === myUserId;
  if (!amMentor && !amFounder) { notFound(); return null; }
  const actorRole = amMentor ? "mentor" : "founder";

  async function patch(body: Parameters<typeof profileApi.patchMentorSession>[1]) {
    setBusy(true); setErr(null);
    const r = await profileApi.patchMentorSession(id, body);
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    setSession(r.session);
  }

  async function payNow() {
    setBusy(true); setErr(null);
    const r = await profileApi.mentorSessionCheckout(id);
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    if (r.alreadyPaid) { void load(); return; }
    if (r.url) window.location.href = r.url;
  }

  const allowedNext = nextStatusesForActor(session.status, actorRole);
  const takeHome = mentorTakeHomeCents(session.price_cents, session.application_fee_pct);

  return (
    <div className="max-w-3xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <Link href="/studio/mentor-sessions" className="text-xs text-muted hover:text-foreground inline-flex items-center gap-1.5 mb-5">
        <ArrowLeft className="size-3" /> All sessions
      </Link>

      {justPaid && session.status === "paid" && (
        <Card className="p-4 mb-5 border-emerald/30 bg-emerald/5">
          <div className="flex items-center gap-2 text-sm text-emerald">
            <CheckCircle2 className="size-4" /> Payment confirmed. {otherName?.split(" ")[0] || "Your mentor"} has been notified.
          </div>
        </Card>
      )}

      <div className="flex items-start justify-between gap-3 flex-wrap mb-6">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.22em] text-emerald mb-2 flex items-center gap-1.5">
            <GraduationCap className="size-3.5" /> Mentor session
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold leading-tight">
            {amMentor ? "From" : "With"} {otherName || "a member"}
          </h1>
          <p className="text-sm text-muted mt-1">{session.duration_minutes} minutes · created {format(new Date(session.created_at), "MMM d, yyyy")}</p>
        </div>
        <Badge color={STATUS_COLOR[session.status]}>{statusLabel(session.status)}</Badge>
      </div>

      {/* Topic + notes */}
      <Card className="p-5 mb-5">
        <h2 className="text-xs uppercase tracking-widest text-muted mb-2">Topic</h2>
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{session.topic}</p>
        {session.founder_notes && (
          <div className="mt-4 pt-4 border-t border-border">
            <h3 className="text-[10px] uppercase tracking-widest text-muted mb-1">Founder notes</h3>
            <p className="text-sm text-foreground/90 whitespace-pre-wrap">{session.founder_notes}</p>
          </div>
        )}
        {session.mentor_notes && (
          <div className="mt-4 pt-4 border-t border-border">
            <h3 className="text-[10px] uppercase tracking-widest text-emerald mb-1">Mentor notes (post-session)</h3>
            <p className="text-sm text-foreground/90 whitespace-pre-wrap">{session.mentor_notes}</p>
          </div>
        )}
      </Card>

      {/* Money */}
      <Card className="p-5 mb-5">
        <h2 className="text-xs uppercase tracking-widest text-muted mb-3 flex items-center gap-1.5"><CreditCard className="size-3" /> Price</h2>
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <span className="text-muted">Founder pays</span>
          <span className="font-mono text-foreground">{formatPriceUsd(session.price_cents)}</span>
        </div>
        <div className="flex items-baseline justify-between gap-3 text-sm mt-1">
          <span className="text-muted">Platform fee ({session.application_fee_pct}%)</span>
          <span className="font-mono text-muted">{formatPriceUsd(session.price_cents - takeHome)}</span>
        </div>
        <div className="flex items-baseline justify-between gap-3 text-sm mt-1 pt-2 border-t border-border">
          <span className="text-muted">Mentor receives</span>
          <span className="font-mono text-emerald">{formatPriceUsd(takeHome)}</span>
        </div>
        {session.paid_at && (
          <p className="text-[11px] text-muted mt-3">Paid {format(new Date(session.paid_at), "MMM d, yyyy 'at' h:mm a")}</p>
        )}
      </Card>

      {/* Schedule */}
      {session.scheduled_at && (
        <Card className="p-5 mb-5">
          <h2 className="text-xs uppercase tracking-widest text-muted mb-2 flex items-center gap-1.5"><Calendar className="size-3" /> Schedule</h2>
          <p className="text-sm">{format(new Date(session.scheduled_at), "EEEE, MMM d, yyyy 'at' h:mm a")}</p>
        </Card>
      )}

      {/* Review (when present) */}
      {session.review_rating != null && (
        <Card className="p-5 mb-5 border-amber/20 bg-amber/5">
          <h2 className="text-xs uppercase tracking-widest text-amber mb-2 inline-flex items-center gap-1.5"><Star className="size-3 fill-amber" /> Founder review</h2>
          <div className="flex items-center gap-1 mb-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <Star key={n} className={`size-4 ${n <= (session.review_rating ?? 0) ? "fill-amber text-amber" : "text-muted"}`} />
            ))}
          </div>
          {session.review_body && <p className="text-sm text-foreground/90 whitespace-pre-wrap">{session.review_body}</p>}
        </Card>
      )}

      {err && (
        <div className="mb-5 rounded-xl border border-rust/30 bg-rust/5 px-4 py-3 text-sm text-rust inline-flex items-center gap-2 w-full">
          <AlertCircle className="size-4" /> {err}
        </div>
      )}

      {/* Action panel — adapts to the viewer's role + session status */}
      <ActionPanel
        session={session}
        amMentor={amMentor}
        amFounder={amFounder}
        allowedNext={allowedNext}
        busy={busy}
        onPatch={patch}
        onPay={payNow}
      />
    </div>
  );
}

function ActionPanel({
  session, amMentor, amFounder, allowedNext, busy, onPatch, onPay,
}: {
  session: MentorSession;
  amMentor: boolean;
  amFounder: boolean;
  allowedNext: MentorSessionStatus[];
  busy: boolean;
  onPatch: (body: Parameters<typeof profileApi.patchMentorSession>[1]) => void;
  onPay: () => void;
}) {
  const [reviewOpen, setReviewOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [mentorNotes, setMentorNotes] = useState(session.mentor_notes);

  // Pre-payment: requested/accepted. Mentor can accept (with optional
  // schedule). Either can cancel.
  // Post-payment: paid → mentor completes; refund affordances.
  // Post-completion: founder reviews; mentor adds private notes for founder.

  if (session.status === "cancelled" || session.status === "refunded" || session.status === "reviewed") {
    return (
      <Card className="p-5 text-center bg-surface-2/40">
        <p className="text-sm text-muted">
          This session is {statusLabel(session.status).toLowerCase()}. No further actions.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <h2 className="text-sm font-medium mb-3">What&apos;s next</h2>

      {/* Mentor — requested */}
      {amMentor && session.status === "requested" && (
        <div className="space-y-3">
          <p className="text-xs text-muted">Accept the request to lock in the price and let the founder pay. You can propose a time during accept; the founder can suggest a change after.</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setScheduleOpen(true)} disabled={busy}>
              <CheckCircle2 className="size-4" /> Accept request
            </Button>
            <Button variant="ghost" onClick={() => onPatch({ status: "cancelled" })} disabled={busy}>
              <X className="size-4 text-rust" /> Decline
            </Button>
          </div>
        </div>
      )}

      {/* Founder — requested */}
      {amFounder && session.status === "requested" && (
        <div className="space-y-3">
          <p className="text-xs text-muted">Waiting on {otherShortName(session, "mentor")} to accept. You won&apos;t be charged until they do.</p>
          <Button variant="ghost" onClick={() => onPatch({ status: "cancelled" })} disabled={busy}>
            <X className="size-4 text-rust" /> Withdraw request
          </Button>
        </div>
      )}

      {/* Founder — accepted (needs payment) */}
      {amFounder && session.status === "accepted" && (
        <div className="space-y-3">
          <p className="text-xs text-muted">Accepted. Complete payment to confirm the session.</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={onPay} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <CreditCard className="size-4" />} Pay {formatPriceUsd(session.price_cents)}
            </Button>
            <Button variant="ghost" onClick={() => onPatch({ status: "cancelled" })} disabled={busy}>
              <X className="size-4 text-rust" /> Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Mentor — accepted */}
      {amMentor && session.status === "accepted" && (
        <div className="space-y-3">
          <p className="text-xs text-muted">Waiting on payment. The session is locked the moment the founder pays.</p>
          <Button variant="ghost" onClick={() => onPatch({ status: "cancelled" })} disabled={busy}>
            <X className="size-4 text-rust" /> Cancel
          </Button>
        </div>
      )}

      {/* Mentor — paid (mark complete) */}
      {amMentor && session.status === "paid" && (
        <div className="space-y-3">
          <p className="text-xs text-muted">Mark the session complete once it&apos;s done. You can then leave private notes for the founder.</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => onPatch({ status: "completed" })} disabled={busy}>
              <CheckCircle2 className="size-4" /> Mark complete
            </Button>
            <Button variant="ghost" onClick={() => onPatch({ status: "refunded" })} disabled={busy}>
              <RefreshCw className="size-4 text-rust" /> Refund
            </Button>
          </div>
        </div>
      )}

      {/* Founder — paid */}
      {amFounder && session.status === "paid" && (
        <p className="text-xs text-muted">Paid. After the session, {otherShortName(session, "mentor")} marks it complete and you can leave a review.</p>
      )}

      {/* Founder — completed (review) */}
      {amFounder && session.status === "completed" && (
        <div className="space-y-3">
          <p className="text-xs text-muted">The session is complete. Leave a review so future founders know what to expect.</p>
          <Button onClick={() => setReviewOpen(true)} disabled={busy}>
            <Star className="size-4" /> Leave a review
          </Button>
        </div>
      )}

      {/* Mentor — completed (private notes + maybe refund) */}
      {amMentor && session.status === "completed" && (
        <div className="space-y-3">
          <p className="text-xs text-muted">Drop the founder private notes — what you covered, what to do next, what you noticed.</p>
          <Textarea value={mentorNotes} onChange={(e) => setMentorNotes(e.target.value)} rows={4} placeholder="Private to the founder — recap, follow-ups, observations." maxLength={2000} />
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => onPatch({ mentor_notes: mentorNotes })} disabled={busy || mentorNotes === session.mentor_notes}>
              <CheckCircle2 className="size-4" /> Save notes
            </Button>
            <Button variant="ghost" onClick={() => onPatch({ status: "refunded" })} disabled={busy}>
              <RefreshCw className="size-4 text-rust" /> Issue refund
            </Button>
          </div>
        </div>
      )}

      {allowedNext.length === 0 && (
        <p className="text-[11px] text-muted italic">No actions available right now.</p>
      )}

      <Dialog open={scheduleOpen} onClose={() => setScheduleOpen(false)} title="Accept and (optionally) schedule">
        <ScheduleForm onConfirm={(when) => { setScheduleOpen(false); onPatch({ status: "accepted", ...(when ? { scheduled_at: when } : {}) }); }} />
      </Dialog>
      <Dialog open={reviewOpen} onClose={() => setReviewOpen(false)} title="Leave a review">
        <ReviewForm onSubmit={(rating, body) => { setReviewOpen(false); onPatch({ review: { rating, body: body || undefined } }); }} />
      </Dialog>
    </Card>
  );
}

// Small helper: short fallback when we don't have the other party's
// display name in scope here. The parent has the actual name; this
// is only used inside ActionPanel where we don't pass it through.
function otherShortName(_session: MentorSession, role: "mentor" | "founder"): string {
  return role === "mentor" ? "your mentor" : "the founder";
}

function ScheduleForm({ onConfirm }: { onConfirm: (when: string | null) => void }) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted leading-relaxed">
        Pick a time, or skip and arrange directly with the founder. Accepting commits the price; payment unlocks the booking.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <div className="text-xs uppercase tracking-widest text-muted mb-1.5">Date</div>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="block">
          <div className="text-xs uppercase tracking-widest text-muted mb-1.5">Time</div>
          <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
      </div>
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" onClick={() => onConfirm(null)}>Accept without time</Button>
        <Button onClick={() => onConfirm(date && time ? new Date(`${date}T${time}`).toISOString() : null)} disabled={!date || !time}>
          <CheckCircle2 className="size-4" /> Accept + schedule
        </Button>
      </div>
    </div>
  );
}

function ReviewForm({ onSubmit }: { onSubmit: (rating: number, body: string) => void }) {
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState("");
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1.5 justify-center">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} onClick={() => setRating(n)} className="p-1">
            <Star className={`size-7 transition ${n <= rating ? "fill-amber text-amber" : "text-muted hover:text-amber"}`} />
          </button>
        ))}
      </div>
      <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} placeholder="What did you take away? Be specific." maxLength={2000} />
      <div className="flex justify-end">
        <Button onClick={() => onSubmit(rating, body)}><Star className="size-4" /> Post review</Button>
      </div>
    </div>
  );
}

