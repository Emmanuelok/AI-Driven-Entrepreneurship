"use client";

import { use, useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { profileApi, type OfficeHoursRow, type OfficeHoursSeatRow } from "@/lib/profile-api";
import { supabaseBrowser } from "@/lib/supabase";
import { Card, Badge, Button, Textarea, Dialog } from "@/components/ui";
import {
  Loader2, ArrowLeft, Users, Clock, Calendar, ExternalLink, CheckCircle2,
  CreditCard, XCircle, AlertCircle, MessageSquare, Star, Globe, Trash2, RefreshCw,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import {
  formatPriceUsd, mentorTotalTakeHomeCents, seatStatusLabel, officeHoursStatusLabel,
  type SeatStatus,
} from "@/lib/office-hours-state";

type DetailData = {
  offering: OfficeHoursRow & { filled_count: number };
  mentor: { user_id: string; display_name: string; slug: string | null; avatar_url: string | null; headline: string; country: string; city: string } | null;
  mySeat: OfficeHoursSeatRow | null;
  roster: Array<OfficeHoursSeatRow & { founder: { display_name: string; slug: string | null; avatar_url: string | null } }>;
  viewer: "mentor" | "attendee" | "authed" | "anonymous";
};

const SEAT_COLOR: Record<SeatStatus, "muted" | "amber" | "emerald" | "indigo" | "rust"> = {
  pending: "amber",
  paid: "emerald",
  attended: "emerald",
  cancelled: "muted",
  refunded: "rust",
};

export default function OfficeHoursDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div className="min-h-[40vh] flex items-center justify-center"><Loader2 className="size-6 text-emerald animate-spin" /></div>}>
      <Inner params={params} />
    </Suspense>
  );
}

function Inner({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const justPaid = searchParams?.get("paid") === "1";

  const [data, setData] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [bookOpen, setBookOpen] = useState(false);
  const [authed, setAuthed] = useState<boolean>(false);

  async function load() {
    const r = await profileApi.getOfficeHours(id);
    if (!r.ok) { setErr(r.error || "Failed to load"); setLoading(false); return; }
    setData({ offering: r.offering, mentor: r.mentor, mySeat: r.mySeat, roster: r.roster, viewer: r.viewer });
    setLoading(false);
  }

  useEffect(() => {
    (async () => {
      const sb = supabaseBrowser();
      if (sb) {
        const { data: s } = await sb.auth.getSession();
        setAuthed(Boolean(s.session));
      }
      await load();
    })();
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [id]);

  async function payNow(seat: OfficeHoursSeatRow) {
    setBusy(true);
    const r = await profileApi.checkoutOfficeHoursSeat(id, seat.id);
    setBusy(false);
    if (r.ok) {
      if (r.alreadyPaid) { await load(); return; }
      if (r.url) window.location.href = r.url;
    } else setErr(r.error || "Checkout failed");
  }

  if (loading) {
    return <div className="min-h-[60vh] flex items-center justify-center"><Loader2 className="size-6 text-emerald animate-spin" /></div>;
  }

  if (err || !data) {
    return (
      <div className="max-w-2xl mx-auto px-5 sm:px-8 py-12">
        <Card className="p-6 border-rust/40">
          <p className="text-sm text-rust mb-2">{err || "Not found"}</p>
          <Link href="/studio/office-hours" className="text-sm text-emerald hover:underline inline-flex items-center gap-1"><ArrowLeft className="size-3.5" /> Back</Link>
        </Card>
      </div>
    );
  }

  const { offering, mentor, mySeat, roster, viewer } = data;
  const isMentor = viewer === "mentor";
  const free = offering.price_per_seat_cents === 0;
  const scheduled = new Date(offering.scheduled_at);
  const isPast = scheduled.getTime() < Date.now();
  const full = offering.filled_count >= offering.capacity;
  const canBook = viewer !== "mentor" && offering.status === "open" && !isPast && !full && (!mySeat || mySeat.status === "cancelled" || mySeat.status === "refunded");

  return (
    <div className="max-w-3xl mx-auto px-5 sm:px-8 py-10 space-y-6">
      <Link href="/studio/office-hours" className="inline-flex items-center gap-1 text-xs text-muted hover:text-emerald">
        <ArrowLeft className="size-3" /> All office hours
      </Link>

      {justPaid && mySeat?.status === "paid" && (
        <Card className="p-4 border-emerald/40 flex items-start gap-2">
          <CheckCircle2 className="size-5 text-emerald mt-0.5" />
          <div className="text-sm">
            <strong>You&apos;re in.</strong> The meeting link is below. The mentor has been notified.
          </div>
        </Card>
      )}

      <header>
        <p className="text-xs uppercase tracking-[0.22em] text-emerald mb-1 flex items-center gap-1.5">
          <Users className="size-3.5" /> Office hours · <Badge color={offering.status === "open" ? "emerald" : "muted"}>{officeHoursStatusLabel(offering.status)}</Badge>
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold">{offering.title}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-muted">
          <span className="flex items-center gap-1.5"><Calendar className="size-3.5" /> {format(scheduled, "PPPP, p")}</span>
          <span className="flex items-center gap-1.5"><Clock className="size-3.5" /> {offering.duration_minutes} min</span>
          <span className="flex items-center gap-1.5"><Users className="size-3.5" /> {offering.filled_count} / {offering.capacity} seats</span>
        </div>
      </header>

      {mentor && (
        <Card className="p-4 flex items-center gap-3">
          <div className="size-10 rounded-full bg-emerald/15 text-emerald flex items-center justify-center font-semibold">
            {mentor.display_name.slice(0, 1).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Link href={mentor.slug ? `/p/${mentor.slug}` : "#"} className="font-medium hover:text-emerald">{mentor.display_name}</Link>
              <Badge color="emerald">Mentor</Badge>
            </div>
            {mentor.headline && <div className="text-xs text-muted truncate">{mentor.headline}</div>}
            {(mentor.city || mentor.country) && (
              <div className="text-[11px] text-muted flex items-center gap-1 mt-0.5">
                <Globe className="size-3" /> {[mentor.city, mentor.country].filter(Boolean).join(", ")}
              </div>
            )}
          </div>
        </Card>
      )}

      {offering.description && (
        <Card className="p-5">
          <h3 className="text-xs uppercase tracking-widest text-muted mb-2">About</h3>
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{offering.description}</p>
        </Card>
      )}

      <Card className="p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-xs uppercase tracking-widest text-muted">Price per seat</div>
            <div className="font-[family-name:var(--font-display)] text-3xl text-emerald mt-1">
              {free ? "Free" : formatPriceUsd(offering.price_per_seat_cents)}
            </div>
            {!free && isMentor && (
              <p className="text-[11px] text-muted mt-1">
                You take home {formatPriceUsd(mentorTotalTakeHomeCents(offering.price_per_seat_cents, 1, offering.application_fee_pct))} per seat after Sankofa&apos;s {offering.application_fee_pct}% fee.
              </p>
            )}
          </div>
          <div className="flex gap-2 flex-wrap">
            {!authed && (
              <Link href="/signin"><Button>Sign in to book</Button></Link>
            )}
            {authed && canBook && (
              <Button onClick={() => setBookOpen(true)} disabled={busy}>
                {free ? "Reserve seat" : "Book a seat"}
              </Button>
            )}
            {isMentor && offering.status === "open" && (
              <Button variant="danger" onClick={async () => {
                if (!confirm("Cancel this office hours? Pending seats are cancelled and paid seats are marked for refund.")) return;
                setBusy(true);
                const r = await profileApi.cancelOfficeHours(id);
                setBusy(false);
                if (r.ok) await load();
                else setErr(r.error || "Cancel failed");
              }}>
                <XCircle className="size-4" /> Cancel offering
              </Button>
            )}
          </div>
        </div>
      </Card>

      {mySeat && (
        <Card className="p-5 border-emerald/30">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="font-medium">Your seat</h3>
            <Badge color={SEAT_COLOR[mySeat.status]}>{seatStatusLabel(mySeat.status)}</Badge>
          </div>

          {mySeat.status === "pending" && !free && (
            <div className="flex items-center gap-2 mt-2">
              <Button onClick={() => payNow(mySeat)} disabled={busy}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <CreditCard className="size-4" />}
                Pay {formatPriceUsd(offering.price_per_seat_cents)} now
              </Button>
              <Button variant="ghost" onClick={async () => {
                if (!confirm("Cancel your seat?")) return;
                setBusy(true);
                await profileApi.updateOfficeHoursSeat(id, mySeat.id, { action: "cancel" });
                setBusy(false);
                await load();
              }}>Cancel</Button>
            </div>
          )}

          {(mySeat.status === "paid" || mySeat.status === "attended") && offering.location_url && (
            <div className="mt-2 text-sm">
              <a href={offering.location_url} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 text-emerald hover:underline">
                <ExternalLink className="size-3.5" /> Join meeting
              </a>
            </div>
          )}

          {(mySeat.status === "paid" || mySeat.status === "attended") && !offering.location_url && (
            <p className="text-xs text-muted mt-1">The mentor will share the meeting link before the session.</p>
          )}

          {(mySeat.status === "attended" || mySeat.status === "paid") && !mySeat.reviewed_at && isPast && (
            <div className="mt-3">
              <ReviewForm onSubmit={async ({ rating, body }) => {
                setBusy(true);
                await profileApi.updateOfficeHoursSeat(id, mySeat.id, { action: "review", rating, body });
                setBusy(false);
                await load();
              }} busy={busy} />
            </div>
          )}

          {mySeat.reviewed_at && (
            <p className="text-xs text-muted mt-2 flex items-center gap-1">
              <Star className="size-3 fill-current text-amber" /> Review submitted
            </p>
          )}
        </Card>
      )}

      {isMentor && roster.length > 0 && (
        <Card className="p-5">
          <h3 className="font-medium mb-3">Roster ({roster.length})</h3>
          <div className="space-y-2">
            {roster.map((s) => (
              <RosterRow
                key={s.id}
                seat={s}
                busy={busy}
                onMarkAttended={async () => {
                  setBusy(true);
                  await profileApi.updateOfficeHoursSeat(id, s.id, { action: "attended" });
                  setBusy(false);
                  await load();
                }}
                onRefund={async () => {
                  if (!confirm("Refund this attendee's seat?")) return;
                  setBusy(true);
                  await profileApi.updateOfficeHoursSeat(id, s.id, { action: "refund" });
                  setBusy(false);
                  await load();
                }}
              />
            ))}
          </div>
        </Card>
      )}

      <Dialog open={bookOpen} onClose={() => setBookOpen(false)} title="Book a seat" size="md">
        <BookForm
          free={free}
          price={offering.price_per_seat_cents}
          busy={busy}
          onCancel={() => setBookOpen(false)}
          onSubmit={async (question) => {
            setBusy(true); setErr(null);
            const r = await profileApi.bookOfficeHoursSeat(id, { question });
            if (!r.ok) {
              setBusy(false);
              setErr(r.error || "Booking failed");
              return;
            }
            setBookOpen(false);
            // For paid seats, jump straight into Stripe Checkout.
            if (!free && r.seat) {
              const c = await profileApi.checkoutOfficeHoursSeat(id, r.seat.id);
              setBusy(false);
              if (!c.ok) { setErr(c.error || "Checkout failed"); return; }
              if (c.url) { window.location.href = c.url; return; }
              if (c.alreadyPaid) { await load(); return; }
              return;
            }
            setBusy(false);
            await load();
          }}
        />
      </Dialog>
    </div>
  );
}

function RosterRow({
  seat, busy, onMarkAttended, onRefund,
}: {
  seat: OfficeHoursSeatRow & { founder: { display_name: string; slug: string | null; avatar_url: string | null } };
  busy: boolean;
  onMarkAttended: () => void;
  onRefund: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border p-3">
      <div className="size-8 rounded-full bg-indigo/15 text-indigo flex items-center justify-center text-sm font-semibold">
        {(seat.founder.display_name || "F").slice(0, 1).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Link href={seat.founder.slug ? `/p/${seat.founder.slug}` : "#"} className="text-sm font-medium hover:text-emerald">
            {seat.founder.display_name}
          </Link>
          <Badge color={SEAT_COLOR[seat.status]}>{seatStatusLabel(seat.status)}</Badge>
        </div>
        {seat.founder_question && (
          <p className="text-xs text-muted mt-1 italic line-clamp-2">&ldquo;{seat.founder_question}&rdquo;</p>
        )}
        <p className="text-[10px] text-muted mt-0.5">Booked {formatDistanceToNow(new Date(seat.created_at), { addSuffix: true })}</p>
      </div>
      <div className="flex gap-1">
        {seat.status === "paid" && (
          <button onClick={onMarkAttended} disabled={busy} className="p-1.5 rounded-lg hover:bg-surface-2 text-muted hover:text-emerald" aria-label="Mark attended">
            <CheckCircle2 className="size-4" />
          </button>
        )}
        {(seat.status === "paid" || seat.status === "attended") && (
          <button onClick={onRefund} disabled={busy} className="p-1.5 rounded-lg hover:bg-surface-2 text-muted hover:text-rust" aria-label="Refund">
            <RefreshCw className="size-4" />
          </button>
        )}
      </div>
    </div>
  );
}

function BookForm({
  free, price, busy, onSubmit, onCancel,
}: {
  free: boolean;
  price: number;
  busy: boolean;
  onSubmit: (question: string) => void;
  onCancel: () => void;
}) {
  const [question, setQuestion] = useState("");
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(question.trim()); }} className="space-y-4">
      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted mb-1.5">What do you want to ask? (optional)</div>
        <Textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={3}
          maxLength={1000}
          placeholder="So the mentor can prepare. Skip if your question is broad."
        />
      </div>
      <p className="text-xs text-muted">
        {free
          ? "Free seat — confirmation is instant."
          : <>You&apos;ll be redirected to Stripe to pay <strong className="text-emerald">{formatPriceUsd(price)}</strong>. Your seat is held while you pay.</>
        }
      </p>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" type="button" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button type="submit" disabled={busy}>
          {busy && <Loader2 className="size-4 animate-spin" />}
          {free ? "Reserve seat" : `Continue to payment`}
        </Button>
      </div>
    </form>
  );
}

function ReviewForm({ onSubmit, busy }: { onSubmit: (v: { rating: number; body: string }) => void; busy: boolean }) {
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  return (
    <div className="space-y-2 pt-2 border-t border-border">
      <div className="text-xs uppercase tracking-widest text-muted">Rate the session</div>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} onClick={() => setRating(n)} className={rating >= n ? "text-amber" : "text-muted"} aria-label={`${n} star`}>
            <Star className="size-5" fill={rating >= n ? "currentColor" : "none"} />
          </button>
        ))}
      </div>
      <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Optional notes." rows={2} maxLength={2000} />
      <Button onClick={() => onSubmit({ rating, body })} disabled={busy || rating === 0}>
        <MessageSquare className="size-4" /> Submit review
      </Button>
    </div>
  );
}
