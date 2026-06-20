"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { profileApi, type MentorSession } from "@/lib/profile-api";
import { Card, Badge, Button } from "@/components/ui";
import { formatDistanceToNow, format } from "date-fns";
import { Loader2, ArrowRight, GraduationCap, Sparkles, CreditCard, Star } from "lucide-react";
import { statusLabel, formatPriceUsd, type MentorSessionStatus } from "@/lib/mentor-session-state";
import { supabaseBrowser } from "@/lib/supabase";

// /studio/mentor-sessions — list of every paid session involving the
// caller (as either mentor or founder). The detail page handles the
// per-row state machine + payment + review.

const STATUS_COLOR: Record<MentorSessionStatus, "muted" | "amber" | "emerald" | "indigo" | "rust"> = {
  requested: "amber",
  accepted: "indigo",
  paid: "emerald",
  completed: "emerald",
  reviewed: "muted",
  cancelled: "muted",
  refunded: "rust",
};

export default function MentorSessionsPage() {
  const [rows, setRows] = useState<MentorSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "as_founder" | "as_mentor">("all");

  async function load() {
    const r = await profileApi.listMentorSessions();
    if (r.ok) setRows(r.results);
    setLoading(false);
  }
  useEffect(() => {
    (async () => {
      const sb = supabaseBrowser();
      if (sb) {
        const { data } = await sb.auth.getSession();
        setMyUserId(data.session?.user.id ?? null);
      }
      await load();
    })();
  }, []);

  const visible = rows.filter((r) => {
    if (filter === "as_founder") return r.founder_user_id === myUserId;
    if (filter === "as_mentor") return r.mentor_user_id === myUserId;
    return true;
  });

  return (
    <div className="max-w-3xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <div className="mb-7 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-emerald mb-2 flex items-center gap-1.5">
            <GraduationCap className="size-3.5" /> Mentor sessions
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight">
            Paid sessions, both sides.
          </h1>
          <p className="mt-3 text-muted max-w-2xl leading-relaxed">
            Sessions you&apos;ve requested as a founder + sessions founders have requested from you as a mentor. Money moves only after both sides agree.
          </p>
        </div>
        <Link href="/studio/mentor-dashboard">
          <Button variant="secondary">Earnings dashboard</Button>
        </Link>
      </div>

      {!loading && rows.length > 0 && (
        <div className="flex items-center gap-2 mb-5">
          {(["all", "as_founder", "as_mentor"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3.5 py-1.5 rounded-full border text-xs transition ${filter === f ? "border-emerald bg-emerald/10 text-emerald" : "border-border text-muted hover:text-foreground"}`}
            >
              {f === "all" ? "All" : f === "as_founder" ? "As founder" : "As mentor"}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="size-6 text-emerald animate-spin" /></div>
      ) : rows.length === 0 ? (
        <Card className="p-10 text-center">
          <Sparkles className="size-8 text-emerald mx-auto mb-3" />
          <p className="text-muted max-w-md mx-auto leading-relaxed mb-4">
            No sessions yet. Visit a mentor&apos;s profile to request your first one — or set your hourly rate in your profile to make yourself bookable.
          </p>
          <Link href="/people?type=mentor"><Button><GraduationCap className="size-4" /> Browse mentors</Button></Link>
        </Card>
      ) : visible.length === 0 ? (
        <Card className="p-8 text-center"><p className="text-muted">Nothing matches this filter.</p></Card>
      ) : (
        <div className="space-y-3">
          {visible.map((s) => (
            <SessionCard key={s.id} session={s} amMentor={s.mentor_user_id === myUserId} />
          ))}
        </div>
      )}
    </div>
  );
}

function SessionCard({ session, amMentor }: { session: MentorSession; amMentor: boolean }) {
  return (
    <Link href={`/studio/mentor-sessions/${session.id}`} className="block group">
      <Card className="p-5 hover:border-emerald/40 transition">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="min-w-0">
            <h3 className="font-medium text-sm">
              <span className="text-muted">{amMentor ? "From founder" : "With mentor"} · </span>
              {session.duration_minutes} min
            </h3>
            <p className="text-[11px] text-muted mt-0.5">{formatDistanceToNow(new Date(session.created_at))} ago</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge color={STATUS_COLOR[session.status]}>{statusLabel(session.status)}</Badge>
            {session.review_rating != null && (
              <span className="inline-flex items-center gap-0.5 text-xs text-amber">
                <Star className="size-3 fill-amber" /> {session.review_rating}
              </span>
            )}
          </div>
        </div>
        <p className="text-sm text-foreground/90 leading-relaxed line-clamp-2">{session.topic}</p>
        <div className="mt-3 flex items-center justify-between text-[11px] text-muted">
          <span className="inline-flex items-center gap-1.5">
            <CreditCard className="size-3" /> {formatPriceUsd(session.price_cents)}
            {session.scheduled_at && <> · scheduled {format(new Date(session.scheduled_at), "MMM d, h:mm a")}</>}
          </span>
          <ArrowRight className="size-3 opacity-0 group-hover:opacity-100 transition" />
        </div>
      </Card>
    </Link>
  );
}
