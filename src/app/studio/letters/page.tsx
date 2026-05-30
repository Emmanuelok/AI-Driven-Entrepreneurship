"use client";

import { useState } from "react";
import Link from "next/link";
import { useLetters } from "@/store/letters";
import { useStore } from "@/store";
import { useMe } from "@/store/me";
import { genomeVoiceInstruction } from "@/lib/genome";
import { Card, Badge, Button, EmptyState } from "@/components/ui";
import { Markdown } from "@/components/markdown";
import { Mail, ArrowLeft, Archive, Sparkles, Clock, GraduationCap } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ConnectionsPanel } from "@/components/connections-panel";
import { buildSiteContextSnapshotAsync } from "@/lib/site-brain-snapshot";

export default function LettersPage() {
  const { letters, markLetterRead, archiveLetter, writeLetter } = useLetters();
  const { user, ventures, streak, xp } = useStore();
  const { genome, recall, recentActivity } = useMe();
  const [selectedId, setSelectedId] = useState<string | null>(letters[0]?.id ?? null);
  const [generating, setGenerating] = useState(false);
  const visible = letters.filter((l) => !l.archived);
  const selected = visible.find((l) => l.id === selectedId);

  async function requestLetter(reason: "weekly" | "discipline-checkin") {
    if (!user || generating) return;
    setGenerating(true);
    try {
      const res = await fetch("/api/generate/letter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason,
          name: user.name,
          field: user.field,
          genomeVoice: genomeVoiceInstruction(genome),
          triggerContext: `${streak}-day streak, ${xp.toLocaleString()} XP, ${ventures.length} venture(s).`,
          memorySummary: recall().slice(0, 6).map((m) => `- ${m.fact}`).join("\n"),
          recentActivity: recentActivity(10).map((a) => a.title).join(" / "),
          siteContext: await buildSiteContextSnapshotAsync("letter"),
        }),
      });
      const data = await res.json() as { title: string; body: string };
      const label = reason === "discipline-checkin" ? "Discipline check-in" : "Weekly reflection";
      const id = writeLetter({ reason: label, title: data.title, body: data.body });
      setSelectedId(id);
    } finally {
      setGenerating(false);
    }
  }

  const requestWeekly = () => requestLetter("weekly");
  const requestCheckin = () => requestLetter("discipline-checkin");

  return (
    <div className="max-w-7xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <Link href="/studio/sage" className="text-sm text-muted hover:text-foreground inline-flex items-center gap-1.5 mb-6"><ArrowLeft className="size-3.5" /> Sit with Sage</Link>

      <div className="flex items-end justify-between flex-wrap gap-4 mb-8">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-emerald mb-2 flex items-center gap-1.5">
            <Mail className="size-3.5" /> Letters from Sage
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight">
            Considered words, kept.
          </h1>
          <p className="mt-2 text-muted max-w-xl">
            Sage writes occasionally — after a real session, at milestones, when patterns are worth noticing. Not chat messages. Considered letters, like a real mentor would write.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {user?.field && user.field !== "General" && (
            <Button variant="secondary" onClick={requestCheckin} disabled={generating}>
              <GraduationCap className="size-4" /> Discipline check-in
            </Button>
          )}
          <Button onClick={requestWeekly} disabled={generating}>
            <Sparkles className="size-4" /> {generating ? "Sage is writing…" : "Ask for a weekly letter"}
          </Button>
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={Mail}
          title="No letters yet"
          body="Sage will write you a letter after your first real session, when you cross a milestone, and at the end of each week. Or ask for one above."
          action={<Button onClick={requestWeekly} disabled={generating}><Sparkles className="size-4" /> Ask for the first letter</Button>}
        />
      ) : (
        <div className="grid lg:grid-cols-[320px_1fr] gap-5">
          {/* Inbox */}
          <div className="space-y-2 max-h-[80vh] overflow-y-auto">
            {visible.map((l) => (
              <button
                key={l.id}
                onClick={() => { setSelectedId(l.id); if (!l.read) markLetterRead(l.id); }}
                className={`block w-full text-left p-4 rounded-2xl border transition ${selectedId === l.id ? "border-emerald bg-emerald/10" : "border-border hover:border-muted hover:bg-surface-2"} ${!l.read ? "ring-1 ring-amber/40" : ""}`}
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <Badge color={l.read ? "muted" : "amber"}>{l.reason}</Badge>
                  {!l.read && <span className="size-1.5 rounded-full bg-amber" />}
                </div>
                <div className="font-medium text-sm leading-snug">{l.title}</div>
                <div className="text-xs text-muted mt-1 flex items-center gap-1.5"><Clock className="size-3" /> {formatDistanceToNow(l.ts, { addSuffix: true })}</div>
              </button>
            ))}
          </div>

          {/* Letter */}
          {selected && (
            <Card className="p-8 sm:p-12 relative overflow-hidden">
              <div className="absolute -top-20 -right-20 size-64 rounded-full bg-amber/10 blur-3xl" />
              <div className="absolute -bottom-20 -left-20 size-64 rounded-full bg-emerald/10 blur-3xl" />
              <div className="relative">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.3em] text-emerald">{selected.reason}</div>
                    <div className="text-xs text-muted mt-1">{new Date(selected.ts).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</div>
                  </div>
                  <button onClick={() => { archiveLetter(selected.id); setSelectedId(visible.find((l) => l.id !== selected.id)?.id ?? null); }} className="text-xs text-muted hover:text-foreground transition flex items-center gap-1">
                    <Archive className="size-3" /> Archive
                  </button>
                </div>
                <h2 className="font-[family-name:var(--font-display)] text-3xl sm:text-4xl font-semibold leading-tight">{selected.title}</h2>
                <div className="mt-8 font-[family-name:var(--font-display)] text-lg leading-[1.8] text-foreground/95 prose-chat">
                  <Markdown src={selected.body} />
                </div>
                {selected.cta && (
                  <Link href={selected.cta.href} className="mt-8 inline-flex items-center gap-2 bg-emerald text-black font-medium px-5 py-2.5 rounded-full hover:bg-amber transition">
                    {selected.cta.label} →
                  </Link>
                )}
                <div className="mt-8 pt-6 border-t border-border">
                  <ConnectionsPanel kind="letter" id={selected.id} title={selected.title} compact />
                </div>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
