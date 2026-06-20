"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { profileApi, type OfficeHoursListRow } from "@/lib/profile-api";
import { supabaseBrowser } from "@/lib/supabase";
import { Card, Badge, Button, Input, Textarea, Dialog } from "@/components/ui";
import {
  Loader2, Users, Plus, Calendar, Clock, Sparkles, Globe, ArrowRight,
} from "lucide-react";
import { format } from "date-fns";
import {
  formatPriceUsd, isValidCapacity, isValidSeatPriceCents, MIN_CAPACITY, MAX_CAPACITY,
} from "@/lib/office-hours-state";

// /studio/office-hours — index of upcoming office hours offerings.
// Anyone can browse + book. Mentors get an extra "+ New office hours"
// button that opens a dialog to publish a new offering.

export default function OfficeHoursPage() {
  const [rows, setRows] = useState<OfficeHoursListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"upcoming" | "mine">("upcoming");
  const [accountType, setAccountType] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const r = await profileApi.listOfficeHours({ mine: filter === "mine" });
    if (r.ok) setRows(r.results);
    setLoading(false);
  }

  useEffect(() => {
    (async () => {
      const sb = supabaseBrowser();
      if (sb) {
        const { data } = await sb.auth.getSession();
        const uid = data.session?.user.id;
        if (uid) {
          const me = await profileApi.getMyProfile();
          if (me.ok) setAccountType(me.profile.account_type);
        }
      }
      await load();
    })();
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [filter]);

  const isMentor = accountType === "mentor";

  return (
    <div className="max-w-4xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-emerald mb-2 flex items-center gap-1.5">
            <Users className="size-3.5" /> Office hours
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight">
            Group sessions with mentors.
          </h1>
          <p className="mt-3 text-muted max-w-2xl leading-relaxed">
            Mentors publish a single time slot at a low per-seat price; founders book individually. Cheaper than 1:1 and good for narrow questions.
          </p>
        </div>
        {isMentor && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" /> New office hours
          </Button>
        )}
      </div>

      <div className="flex items-center gap-2 mb-5">
        {(["upcoming", "mine"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3.5 py-1.5 rounded-full border text-xs transition ${filter === f ? "border-emerald bg-emerald/10 text-emerald" : "border-border text-muted hover:text-foreground"}`}
          >
            {f === "upcoming" ? "Upcoming" : "My offerings"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="size-6 text-emerald animate-spin" /></div>
      ) : rows.length === 0 ? (
        <Card className="p-10 text-center">
          <Sparkles className="size-8 text-emerald mx-auto mb-3" />
          <p className="text-muted max-w-md mx-auto leading-relaxed">
            {filter === "mine"
              ? "No office hours yet. Click + New office hours to publish your first one."
              : "No upcoming office hours yet. Check back soon — mentors are still loading the calendar."}
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => <OfferingRow key={r.id} row={r} />)}
        </div>
      )}

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="Publish office hours" size="md">
        <CreateForm
          busy={busy}
          err={err}
          onCancel={() => setCreateOpen(false)}
          onSubmit={async (payload) => {
            setBusy(true); setErr(null);
            const r = await profileApi.createOfficeHours(payload);
            setBusy(false);
            if (r.ok) { setCreateOpen(false); await load(); }
            else setErr(r.error || "Create failed");
          }}
        />
      </Dialog>
    </div>
  );
}

function OfferingRow({ row }: { row: OfficeHoursListRow }) {
  const full = row.filled_count >= row.capacity;
  const free = row.price_per_seat_cents === 0;
  return (
    <Link href={`/studio/office-hours/${row.id}`}>
      <Card className="p-5 hover:border-emerald/40 transition cursor-pointer">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-medium truncate">{row.title}</h3>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted">
              <span className="flex items-center gap-1"><Calendar className="size-3" /> {format(new Date(row.scheduled_at), "PP, p")}</span>
              <span className="flex items-center gap-1"><Clock className="size-3" /> {row.duration_minutes}m</span>
              <span className="flex items-center gap-1"><Users className="size-3" /> {row.filled_count} / {row.capacity}</span>
              {row.mentor && <span className="flex items-center gap-1"><Globe className="size-3" /> {row.mentor.display_name}</span>}
            </div>
            {row.description && (
              <p className="mt-2 text-sm text-muted line-clamp-2">{row.description}</p>
            )}
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <div className="font-[family-name:var(--font-display)] text-xl text-emerald">
              {free ? "Free" : formatPriceUsd(row.price_per_seat_cents)}
            </div>
            {full ? <Badge color="rust">Full</Badge> : <Badge color="emerald">Open</Badge>}
            <ArrowRight className="size-3.5 text-muted" />
          </div>
        </div>
      </Card>
    </Link>
  );
}

type CreatePayload = {
  title: string;
  description: string;
  scheduledAt: string;
  durationMinutes: number;
  capacity: number;
  pricePerSeatCents: number;
  locationUrl: string;
};

function CreateForm({
  busy, err, onSubmit, onCancel,
}: {
  busy: boolean;
  err: string | null;
  onSubmit: (p: CreatePayload) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  // Default to one week out at 6pm local.
  const defaultDate = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    d.setHours(18, 0, 0, 0);
    return d.toISOString().slice(0, 16);
  })();
  const [scheduledAt, setScheduledAt] = useState(defaultDate);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [capacity, setCapacity] = useState(8);
  const [priceUsd, setPriceUsd] = useState("15");
  const [locationUrl, setLocationUrl] = useState("");

  const priceCents = Math.round((parseFloat(priceUsd) || 0) * 100);
  const valid = title.trim().length >= 4
    && isValidCapacity(capacity)
    && isValidSeatPriceCents(priceCents)
    && scheduledAt.length > 0;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        onSubmit({
          title: title.trim(),
          description: description.trim(),
          scheduledAt: new Date(scheduledAt).toISOString(),
          durationMinutes,
          capacity,
          pricePerSeatCents: priceCents,
          locationUrl: locationUrl.trim(),
        });
      }}
      className="space-y-4"
    >
      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted mb-1.5">Title</div>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Fundraising Q&A — pre-seed in Lagos" required maxLength={200} />
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted mb-1.5">Description</div>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What will attendees learn? Who is this for?" rows={3} maxLength={4000} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted mb-1.5">When</div>
          <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} required />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted mb-1.5">Length</div>
          <select value={durationMinutes} onChange={(e) => setDurationMinutes(Number(e.target.value))} className="bg-surface-2 border border-border rounded-xl px-4 py-2.5 text-sm w-full outline-none focus:border-emerald">
            {[15, 30, 45, 60, 90, 120].map((m) => <option key={m} value={m}>{m} minutes</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted mb-1.5">Capacity ({MIN_CAPACITY}-{MAX_CAPACITY})</div>
          <Input type="number" min={MIN_CAPACITY} max={MAX_CAPACITY} value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} required />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted mb-1.5">Price / seat (USD)</div>
          <Input value={priceUsd} onChange={(e) => setPriceUsd(e.target.value)} placeholder="15" />
          <p className="text-[10px] text-muted mt-1">0 = free office hours.</p>
        </div>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted mb-1.5">Meeting URL (Zoom / Meet / WhatsApp Live)</div>
        <Input value={locationUrl} onChange={(e) => setLocationUrl(e.target.value)} placeholder="https://meet.google.com/…" />
        <p className="text-[10px] text-muted mt-1">Visible only to paid attendees.</p>
      </div>

      {err && <p className="text-xs text-rust">{err}</p>}

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" type="button" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button type="submit" disabled={busy || !valid}>
          {busy && <Loader2 className="size-4 animate-spin" />}
          Publish
        </Button>
      </div>
    </form>
  );
}
