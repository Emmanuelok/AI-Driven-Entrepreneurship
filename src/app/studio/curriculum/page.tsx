"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { curriculumApi } from "@/lib/cohort-api-v2";
import { type CurriculumTrack, type TrackLevel, totalMinutesFromModules } from "@/lib/curriculum-track";
import { Card, Button, Badge, Dialog, Input, Textarea } from "@/components/ui";
import { BookOpen, Plus, ArrowRight, Sparkles, Loader2, GitFork, Hourglass, Globe2 } from "lucide-react";

// /studio/curriculum — the curriculum library.
//
// Three lists: "Your tracks" (owned + org-owned), "Public library"
// (system + community tracks marked public). Create button opens an
// empty-track wizard; users can clone from the library by visiting a
// track detail and forking.

const LEVEL_COLOR: Record<TrackLevel, "muted" | "emerald" | "amber"> = {
  foundation: "emerald", intermediate: "amber", advanced: "muted",
};

export default function CurriculumLibraryPage() {
  const router = useRouter();
  const [mine, setMine] = useState<CurriculumTrack[]>([]);
  const [pub, setPub] = useState<CurriculumTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  async function load() {
    const r = await curriculumApi.list();
    if (r.ok) { setMine(r.mine); setPub(r.public); }
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  return (
    <div className="max-w-6xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <div className="flex items-end justify-between gap-3 flex-wrap mb-8">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-emerald mb-2 flex items-center gap-1.5">
            <BookOpen className="size-3.5" /> Curriculum library
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight">
            Curriculum that&apos;s yours to fork.
          </h1>
          <p className="mt-3 text-muted max-w-2xl leading-relaxed">
            Tracks are sequences of modules instructors run inside cohorts. Use the public library as-is, fork one to make it your own, or build a track from scratch.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}><Plus className="size-4" /> New track</Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="size-6 text-emerald animate-spin" /></div>
      ) : (
        <>
          <section className="mb-10">
            <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold mb-3 flex items-center gap-2">
              Your tracks
              {mine.length > 0 && <span className="text-xs text-muted font-normal">({mine.length})</span>}
            </h2>
            {mine.length === 0 ? (
              <Card className="p-8 text-center">
                <Sparkles className="size-7 text-emerald mx-auto mb-3" />
                <p className="text-muted leading-relaxed max-w-md mx-auto mb-4">
                  You don&apos;t own any tracks yet. Fork one from the public library below, or build your own from scratch.
                </p>
                <Button onClick={() => setCreating(true)}><Plus className="size-4" /> New track</Button>
              </Card>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {mine.map((t) => <TrackCard key={t.id} track={t} owned />)}
              </div>
            )}
          </section>

          <section>
            <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold mb-3 flex items-center gap-2">
              <Globe2 className="size-4 text-amber" /> Public library
              {pub.length > 0 && <span className="text-xs text-muted font-normal">({pub.length})</span>}
            </h2>
            <p className="text-sm text-muted mb-4 max-w-2xl">
              Sankofa-seeded tracks + community tracks anyone can fork. Open one to see the modules; fork to make a private copy you can edit.
            </p>
            {pub.length === 0 ? (
              <Card className="p-6 text-center">
                <p className="text-sm text-muted italic">No public tracks yet.</p>
              </Card>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {pub.map((t) => <TrackCard key={t.id} track={t} />)}
              </div>
            )}
          </section>
        </>
      )}

      <Dialog open={creating} onClose={() => setCreating(false)} title="New curriculum track">
        <NewTrackForm onCreated={(t) => { setCreating(false); router.push(`/studio/curriculum/${t.slug}`); }} />
      </Dialog>
    </div>
  );
}

function TrackCard({ track, owned = false }: { track: CurriculumTrack; owned?: boolean }) {
  const moduleCount = Array.isArray(track.modules) ? track.modules.length : 0;
  const totalMin = totalMinutesFromModules(track.modules);
  const totalHours = track.duration_hours ?? Math.round(totalMin / 60);
  return (
    <Link href={`/studio/curriculum/${track.slug}`} className="block group">
      <Card className="p-5 h-full hover:border-emerald/40 transition flex flex-col">
        <div className="flex items-start justify-between gap-2 mb-2">
          <Badge color={LEVEL_COLOR[track.level]}>{track.level}</Badge>
          {!track.is_published && owned && <Badge color="amber">draft</Badge>}
          {track.fork_count > 0 && (
            <span className="text-[10px] text-muted inline-flex items-center gap-0.5">
              <GitFork className="size-2.5" /> {track.fork_count}
            </span>
          )}
        </div>
        <h3 className="font-medium leading-tight group-hover:text-emerald transition">{track.title}</h3>
        {track.tagline && <p className="mt-1 text-xs text-muted leading-relaxed line-clamp-3">{track.tagline}</p>}
        <div className="mt-auto pt-3 flex items-center justify-between text-[11px] text-muted">
          <span className="inline-flex items-center gap-1"><BookOpen className="size-3" /> {moduleCount} module{moduleCount === 1 ? "" : "s"}</span>
          <span className="inline-flex items-center gap-1"><Hourglass className="size-3" /> {totalHours}h</span>
        </div>
      </Card>
    </Link>
  );
}

function NewTrackForm({ onCreated }: { onCreated: (t: CurriculumTrack) => void }) {
  const [title, setTitle] = useState("");
  const [tagline, setTagline] = useState("");
  const [level, setLevel] = useState<TrackLevel>("foundation");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!title.trim() || busy) return;
    setBusy(true); setErr(null);
    const r = await curriculumApi.create({
      title: title.trim(),
      tagline: tagline.trim() || undefined,
      level,
      modules: [],
    });
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    onCreated(r.track);
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted leading-relaxed">
        Start with a title; you&apos;ll add modules on the next screen.
      </p>
      <Field label="Title">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. AI for African Lawyers" autoFocus />
      </Field>
      <Field label="Tagline" hint="One line — shows on the library card.">
        <Textarea value={tagline} onChange={(e) => setTagline(e.target.value)} rows={2} maxLength={280} />
      </Field>
      <Field label="Level">
        <select
          value={level}
          onChange={(e) => setLevel(e.target.value as TrackLevel)}
          className="bg-surface-2 border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-emerald w-full"
        >
          <option value="foundation">Foundation</option>
          <option value="intermediate">Intermediate</option>
          <option value="advanced">Advanced</option>
        </select>
      </Field>
      {err && <p className="text-xs text-rust">{err}</p>}
      <div className="flex justify-end">
        <Button onClick={submit} disabled={!title.trim() || busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />} Create + open editor
        </Button>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs uppercase tracking-widest text-muted mb-1.5">{label}</div>
      {children}
      {hint && <p className="text-[11px] text-muted mt-1">{hint}</p>}
    </label>
  );
}
