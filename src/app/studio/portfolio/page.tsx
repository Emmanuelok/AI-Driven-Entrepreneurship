"use client";

import { useStore, level } from "@/store";
import { Card, Badge, Button } from "@/components/ui";
import { Folder, Share2, ExternalLink, Rocket, GraduationCap, Trophy } from "lucide-react";
import { BADGES } from "@/lib/badges";
import { TRACKS } from "@/lib/curriculum";

export default function PortfolioPage() {
  const { user, xp, ventures, unlockedBadges, progress } = useStore();
  if (!user) return null;

  const completedLessons = Object.values(progress).filter((p) => p.status === "completed");
  const completedByTrack = TRACKS.map((t) => ({
    t,
    n: completedLessons.filter((p) => p.trackId === t.id).length,
  })).filter((x) => x.n > 0);

  return (
    <div className="max-w-4xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <div className="flex items-end justify-between mb-8 flex-wrap gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-emerald mb-2">Public portfolio</p>
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight">
            sankofa.studio/<span className="text-emerald">{user.email.split("@")[0]}</span>
          </h1>
          <p className="mt-2 text-muted">Your verifiable record of learning + ventures shipped. Share with recruiters and investors.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary"><Share2 className="size-4" /> Share link</Button>
          <Button><ExternalLink className="size-4" /> View public</Button>
        </div>
      </div>

      <Card className="p-8 mb-6 relative overflow-hidden">
        <div className="absolute -top-24 -right-24 size-72 rounded-full bg-emerald opacity-10 blur-3xl" />
        <div className="relative flex items-start gap-5 flex-wrap">
          <div className="size-20 rounded-3xl bg-gradient-to-br from-emerald to-amber flex items-center justify-center text-black font-bold text-3xl shadow-xl shadow-emerald/20">
            {user.name[0]}
          </div>
          <div className="flex-1 min-w-[200px]">
            <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold leading-tight">{user.name}</h2>
            <div className="text-muted">{user.program} · {user.institution}</div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge color="emerald">Level {level(xp)}</Badge>
              <Badge color="amber">{xp} XP</Badge>
              <Badge color="muted">{user.country}</Badge>
              <Badge color="indigo">{user.primaryLanguage}</Badge>
            </div>
          </div>
        </div>
      </Card>

      {/* Ventures */}
      <section className="mb-6">
        <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold mb-4 flex items-center gap-2">
          <Rocket className="size-5 text-emerald" /> Ventures shipped
        </h2>
        {ventures.length === 0 ? (
          <Card className="p-6 text-muted text-sm">No ventures yet. Start one in the Venture Studio.</Card>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {ventures.map((v) => (
              <Card key={v.id} className="p-5">
                <Badge color="emerald">Phase: {v.phase}</Badge>
                <h3 className="font-semibold mt-2">{v.name}</h3>
                <p className="text-sm text-muted mt-1">{v.tagline}</p>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                  <span>{v.interviews.length} interviews</span>
                  <span>${v.metrics.mrr} MRR</span>
                  <span>{v.mvpTasks.filter((t) => t.done).length}/{v.mvpTasks.length} shipped</span>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Skills mastered */}
      <section className="mb-6">
        <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold mb-4 flex items-center gap-2">
          <GraduationCap className="size-5 text-emerald" /> Skills mastered
        </h2>
        {completedByTrack.length === 0 ? (
          <Card className="p-6 text-muted text-sm">Complete lessons to populate your verified skills.</Card>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {completedByTrack.map(({ t, n }) => (
              <Card key={t.id} className="p-5 flex items-center justify-between">
                <div>
                  <div className="text-xs text-muted">{t.pillar}</div>
                  <div className="font-medium">{t.title}</div>
                  <div className="text-xs text-emerald mt-1">{n} / {t.lessons.length} lessons verified</div>
                </div>
                <span className="size-2 rounded-full" style={{ background: t.color }} />
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Badges */}
      <section>
        <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold mb-4 flex items-center gap-2">
          <Trophy className="size-5 text-amber" /> Achievements
        </h2>
        {unlockedBadges.length === 0 ? (
          <Card className="p-6 text-muted text-sm">No achievements yet — they unlock as you learn and ship.</Card>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {unlockedBadges.map((id) => {
              const b = BADGES.find((x) => x.id === id);
              if (!b) return null;
              return (
                <Card key={id} className="p-5 text-center">
                  <div className="text-4xl mb-2">{b.emoji}</div>
                  <div className="font-medium text-sm">{b.name}</div>
                  <div className="text-xs text-muted mt-1">{b.description}</div>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
