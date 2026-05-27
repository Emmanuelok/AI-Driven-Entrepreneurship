"use client";

import { use } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTrack } from "@/lib/curriculum";
import { LESSON_CONTENT } from "@/lib/lesson-content";
import { useStore } from "@/store";
import { Card, Badge, Button } from "@/components/ui";
import { ArrowLeft, Play, CheckCircle2, Lock, Clock, ChevronRight } from "lucide-react";

export default function TrackPage({ params }: { params: Promise<{ trackId: string }> }) {
  const { trackId } = use(params);
  const track = getTrack(trackId);
  if (!track) { notFound(); return null; }

  const { progress } = useStore();
  const completed = track.lessons.filter((l) => progress[`${track.id}/${l.id}`]?.status === "completed").length;
  const pct = (completed / track.lessons.length) * 100;

  return (
    <div className="max-w-4xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <Link href="/studio/learn" className="text-sm text-muted hover:text-foreground inline-flex items-center gap-1.5 mb-6">
        <ArrowLeft className="size-3.5" /> All tracks
      </Link>

      <div className="flex items-center gap-3 mb-3">
        <span className="size-3 rounded-full" style={{ background: track.color }} />
        <Badge color="emerald">{track.pillar}</Badge>
        <Badge color="muted">{track.level}</Badge>
      </div>
      <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight">{track.title}</h1>
      <p className="mt-3 text-lg text-muted">{track.tagline}</p>

      <Card className="mt-8 p-5">
        <div className="flex justify-between text-sm mb-3">
          <span className="text-muted">{completed} of {track.lessons.length} lessons complete</span>
          <span className="font-mono" style={{ color: track.color }}>{Math.round(pct)}%</span>
        </div>
        <div className="h-2.5 bg-surface-2 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: track.color }} />
        </div>
      </Card>

      <div className="mt-8 space-y-2">
        {track.lessons.map((l, i) => {
          const key = `${track.id}/${l.id}`;
          const p = progress[key];
          const status = p?.status ?? "not-started";
          const hasContent = !!LESSON_CONTENT[l.id];
          return (
            <Link
              key={l.id}
              href={hasContent ? `/studio/learn/${track.id}/${l.id}` : "#"}
              className={`glass rounded-2xl p-5 flex items-center gap-5 hover:border-emerald/40 transition group ${!hasContent ? "opacity-60 cursor-not-allowed" : ""}`}
              onClick={(e) => {
                if (!hasContent) e.preventDefault();
              }}
            >
              <div className="size-12 rounded-2xl bg-surface-2 flex items-center justify-center shrink-0 border border-border">
                {status === "completed" ? (
                  <CheckCircle2 className="size-5 text-emerald" />
                ) : status === "in-progress" ? (
                  <Play className="size-4 text-amber" />
                ) : !hasContent ? (
                  <Lock className="size-4 text-muted" />
                ) : (
                  <span className="text-sm font-mono text-muted">{String(i + 1).padStart(2, "0")}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium">{l.title}</div>
                <div className="text-sm text-muted mt-0.5 line-clamp-1">{l.summary}</div>
                <div className="mt-2 flex items-center gap-3 text-xs text-muted">
                  <span className="flex items-center gap-1"><Clock className="size-3" /> {l.minutes} min</span>
                  <Badge color={l.kind === "interactive" ? "emerald" : l.kind === "code" ? "indigo" : l.kind === "venture" ? "amber" : "muted"}>
                    {l.kind}
                  </Badge>
                  {p?.scorePct !== undefined && <span className="text-emerald">Score: {Math.round(p.scorePct)}%</span>}
                </div>
              </div>
              {hasContent && <ChevronRight className="size-5 text-muted group-hover:text-emerald transition shrink-0" />}
            </Link>
          );
        })}
      </div>

      <Card className="mt-10 p-6 text-center">
        <p className="text-sm text-muted">
          More lessons in this track are being authored. Want to author or contribute a lesson? <Link href="/studio/settings" className="text-emerald hover:underline">Apply to be a Sankofa contributor →</Link>
        </p>
      </Card>
    </div>
  );
}
