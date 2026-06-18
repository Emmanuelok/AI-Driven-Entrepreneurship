"use client";

import { use, useState } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getMentor } from "@/lib/mentors";
import { useStore } from "@/store";
import { Card, Button, Badge, Input, Textarea, Dialog } from "@/components/ui";
import { Star, MapPin, Clock, ArrowLeft, Calendar, Sparkles, CheckCircle2 } from "lucide-react";
import { ConnectionsPanel } from "@/components/connections-panel";

export default function MentorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { bookMentor, unlockBadge } = useStore();
  const [booking, setBooking] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const mentor = getMentor(id);
  if (!mentor) { notFound(); return null; }

  return (
    <div className="max-w-4xl mx-auto px-5 sm:px-8 py-10">
      <Link href="/studio/mentors" className="text-sm text-muted hover:text-foreground inline-flex items-center gap-1.5 mb-6">
        <ArrowLeft className="size-3.5" /> All mentors
      </Link>

      <div className="mb-5 rounded-xl border border-amber/30 bg-amber/5 px-4 py-2.5 text-xs text-amber/90 leading-relaxed">
        This is a curated profile of a public figure in African tech — for research and inspiration. They&apos;re not a registered Sankofa account. To reach mentors who&apos;ve signed up, browse <Link href="/people?type=mentor" className="underline">registered mentors</Link>.
      </div>

      <div className="flex items-start gap-5 flex-wrap">
        <div className="size-24 rounded-3xl bg-gradient-to-br from-emerald to-amber flex items-center justify-center text-black font-bold text-3xl shadow-xl shadow-emerald/20 shrink-0">
          {mentor.initials}
        </div>
        <div className="flex-1 min-w-[260px]">
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold leading-tight">{mentor.name}</h1>
          <div className="text-muted">{mentor.role} · <span className="text-emerald">{mentor.org}</span></div>
          <div className="text-sm text-muted mt-1 flex items-center gap-1.5"><MapPin className="size-3.5" /> {mentor.city}, {mentor.country}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {mentor.badges.map((b) => <Badge key={b} color="amber">{b}</Badge>)}
            <Badge color="muted">{mentor.yearsExperience}y experience</Badge>
          </div>
        </div>
      </div>

      <div className="grid sm:grid-cols-4 gap-3 mt-6">
        <Card className="p-4 text-center">
          <div className="flex items-center justify-center gap-1 text-amber"><Star className="size-4 fill-amber" /> {mentor.rating}</div>
          <div className="text-xs text-muted">{mentor.sessions} sessions</div>
        </Card>
        <Card className="p-4 text-center">
          <div className="font-mono text-emerald">{mentor.pricePerHour === 0 ? "Pro-bono" : `$${mentor.pricePerHour}/hr`}</div>
          <div className="text-xs text-muted">Hourly rate</div>
        </Card>
        <Card className="p-4 text-center">
          <div className="text-emerald flex items-center justify-center gap-1"><Clock className="size-4" /> {mentor.responseHrs}h</div>
          <div className="text-xs text-muted">Avg response</div>
        </Card>
        <Card className="p-4 text-center">
          <div className={`${mentor.availability === "high" ? "text-emerald" : mentor.availability === "medium" ? "text-amber" : "text-rust"} capitalize`}>{mentor.availability}</div>
          <div className="text-xs text-muted">Availability</div>
        </Card>
      </div>

      <Card className="mt-6 p-6">
        <h2 className="font-medium mb-3">About</h2>
        <p className="text-foreground/90 leading-relaxed">{mentor.bio}</p>
      </Card>

      <Card className="mt-6 p-6">
        <h2 className="font-medium mb-3">Areas of expertise</h2>
        <div className="flex flex-wrap gap-2">
          {mentor.expertise.map((e) => (<span key={e} className="text-sm px-3 py-1.5 rounded-full bg-surface-2 border border-border">{e}</span>))}
        </div>
      </Card>

      <Card className="mt-6 p-6">
        <h2 className="font-medium mb-3">Languages</h2>
        <div className="flex flex-wrap gap-2">
          {mentor.languages.map((l) => (<Badge key={l} color="emerald">{l}</Badge>))}
        </div>
      </Card>

      <div className="mt-8 sticky bottom-4">
        <Card className="p-5 flex flex-wrap items-center gap-3 bg-gradient-to-r from-emerald/10 to-amber/10">
          <Sparkles className="size-5 text-amber" />
          <div className="flex-1 min-w-[200px]">
            <div className="font-medium">Want to learn from {mentor.name.split(" ")[0]}?</div>
            <div className="text-xs text-muted">Draft your ask and save it to your plan — then look for a registered mentor with the same expertise to actually talk to.</div>
          </div>
          <Button onClick={() => setBooking(true)} size="lg"><Calendar className="size-4" /> Draft an ask</Button>
        </Card>
      </div>

      <div className="mt-8">
        <ConnectionsPanel kind="mentor" id={id} title={mentor.name} />
      </div>

      <Dialog open={booking} onClose={() => { setBooking(false); setConfirmed(false); }} title={confirmed ? "Saved to your plan" : `Draft an ask for ${mentor.name.split(" ")[0]}`}>
        {confirmed ? (
          <div className="text-center py-6">
            <div className="size-16 mx-auto rounded-full bg-emerald/15 flex items-center justify-center mb-4">
              <CheckCircle2 className="size-8 text-emerald" />
            </div>
            <h3 className="font-[family-name:var(--font-display)] text-xl font-semibold">Saved</h3>
            <p className="mt-2 text-muted text-sm">Your ask is saved to your plan. Bring it to a registered mentor who shares {mentor.name.split(" ")[0]}&apos;s expertise — or a workspace advisor — to get a real answer.</p>
            <Button className="mt-6" onClick={() => { setBooking(false); setConfirmed(false); }}>Done</Button>
          </div>
        ) : (
          <BookingForm
            mentor={mentor}
            onConfirm={(date, topic) => {
              bookMentor(mentor.id, mentor.name, date, topic);
              unlockBadge("first-mentor-session");
              setConfirmed(true);
            }}
          />
        )}
      </Dialog>
    </div>
  );
}

function BookingForm({ mentor, onConfirm }: { mentor: ReturnType<typeof getMentor>; onConfirm: (date: string, topic: string) => void }) {
  const [date, setDate] = useState("");
  const [topic, setTopic] = useState("");
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted mb-1.5">Date</div>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <div className="text-xs uppercase tracking-widest text-muted mb-1.5">Cost</div>
          <div className="bg-surface-2 border border-border rounded-xl px-4 py-2.5 text-sm">
            {mentor?.pricePerHour === 0 ? <span className="text-emerald font-medium">Pro-bono</span> : `$${mentor?.pricePerHour ?? 0} / 30 min`}
          </div>
        </div>
      </div>
      <div>
        <div className="text-xs uppercase tracking-widest text-muted mb-1.5">What do you want to discuss?</div>
        <Textarea placeholder="My team has 11 customer interviews validating post-harvest tomato loss. We're trying to decide between selling per-crate or whole-cooperative subscriptions. Looking for your read." value={topic} onChange={(e) => setTopic(e.target.value)} rows={5} />
      </div>
      <div className="flex justify-end">
        <Button disabled={!date || !topic.trim()} onClick={() => onConfirm(date, topic)}>Confirm booking</Button>
      </div>
    </div>
  );
}
