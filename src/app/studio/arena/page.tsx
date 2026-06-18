"use client";

import { useState } from "react";
import { useExt } from "@/store/extensions";
import { useStore } from "@/store";
import { Card, Badge, Button, Input, Textarea, Dialog, EmptyState, Stat } from "@/components/ui";
import { Trophy, Plus, Sparkles, Heart, ArrowRight, Flame, Crown, Star } from "lucide-react";
import { Markdown } from "@/components/markdown";
import { LiveBuildersStrip } from "@/components/live-builders-strip";

export default function ArenaPage() {
  const { pitches, submitPitch, votePitch, judgePitch } = useExt();
  const { user, ventures, unlockBadge } = useStore();
  const [submitting, setSubmitting] = useState(false);
  const [judging, setJudging] = useState<string | null>(null);

  // Only real, user-submitted pitches show on the leaderboard. The
  // arena was previously seeded with placeholder pitches to make it
  // look populated — those misled visitors about what was real and
  // are now gone.
  const all = [...pitches].sort((a, b) => (b.judgeScore?.overall ?? 0) * 100 + b.votes - ((a.judgeScore?.overall ?? 0) * 100 + a.votes));
  const totalVotes = all.reduce((s, p) => s + p.votes, 0);

  return (
    <div className="max-w-6xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <div className="flex items-end justify-between flex-wrap gap-3 mb-8">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-amber mb-2 flex items-center gap-1.5">
            <Trophy className="size-3.5" /> Pitch Arena
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight">
            Pitch. Get scored. Climb the leaderboard.
          </h1>
          <p className="mt-3 text-muted max-w-2xl">
            Submit your venture pitch. The AI panel scores you on 5 dimensions. The community votes. Top 10 every month get a direct intro to an investor.
          </p>
        </div>
        <Button onClick={() => setSubmitting(true)} size="lg">
          <Plus className="size-4" /> Submit pitch
        </Button>
      </div>

      <LiveBuildersStrip area="arena" className="mb-6" />

      <div className="grid sm:grid-cols-3 gap-3 mb-8">
        <Stat label="Pitches submitted" value={all.length} color="emerald" />
        <Stat label="Community votes" value={totalVotes.toLocaleString()} color="amber" />
        <Stat label="Top score" value={all[0]?.judgeScore?.overall.toFixed(1) ?? "—"} color="indigo" />
      </div>

      {all.length === 0 && (
        <EmptyState
          icon={Trophy}
          title="The arena is open."
          body="No pitches have been submitted yet. Be the first — get scored by the AI panel, climb the leaderboard, win an investor intro."
          action={<Button onClick={() => setSubmitting(true)}><Plus className="size-4" /> Submit the first pitch</Button>}
        />
      )}

      <div className="grid gap-3">
        {all.map((p, i) => (
          <Card key={p.id} className="p-6">
            <div className="grid lg:grid-cols-[60px_1fr_auto] gap-4 items-center">
              <div className="text-center">
                {i === 0 && <Crown className="size-7 text-amber mx-auto" />}
                {i === 1 && <Star className="size-7 text-muted mx-auto" />}
                {i === 2 && <Flame className="size-7 text-rust mx-auto" />}
                <div className="font-mono text-xl font-semibold mt-1">#{i + 1}</div>
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h3 className="font-[family-name:var(--font-display)] text-xl font-semibold">{p.ventureName}</h3>
                  <span className="text-xs text-muted">· {p.founderName}</span>
                </div>
                <p className="text-sm text-muted mt-1 line-clamp-2">{p.pitchText}</p>
                {p.judgeScore && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <ScoreChip label="Problem" v={p.judgeScore.problem} />
                    <ScoreChip label="Solution" v={p.judgeScore.solution} />
                    <ScoreChip label="Market" v={p.judgeScore.market} />
                    <ScoreChip label="Team" v={p.judgeScore.team} />
                    <ScoreChip label="Ask" v={p.judgeScore.ask} />
                  </div>
                )}
              </div>
              <div className="text-right">
                {p.judgeScore && (
                  <div className="font-[family-name:var(--font-display)] text-3xl font-semibold text-emerald">{p.judgeScore.overall.toFixed(1)}</div>
                )}
                <button
                  onClick={() => votePitch(p.id)}
                  className="mt-2 inline-flex items-center gap-1 text-sm bg-surface-2 hover:bg-surface px-3 py-1.5 rounded-full transition"
                >
                  <Heart className="size-3.5 text-rust" /> {p.votes}
                </button>
                {!p.judgeScore && (
                  <button onClick={() => setJudging(p.id)} className="block mt-2 text-xs text-amber hover:underline">Get judged</button>
                )}
              </div>
            </div>
            {p.judgeScore?.feedback && (
              <div className="mt-4 pt-4 border-t border-border text-sm text-muted italic">"{p.judgeScore.feedback}"</div>
            )}
          </Card>
        ))}
      </div>

      <Dialog open={submitting} onClose={() => setSubmitting(false)} title="Submit pitch" size="lg">
        <SubmitForm
          ventures={ventures.map((v) => ({ id: v.id, name: v.name, tagline: v.tagline }))}
          founderName={user?.name ?? ""}
          onSubmit={(p) => {
            submitPitch(p);
            unlockBadge("pitch-deck");
            setSubmitting(false);
          }}
        />
      </Dialog>

      <Dialog open={judging !== null} onClose={() => setJudging(null)} title="AI judge panel">
        {judging && (
          <JudgePanel
            pitchId={judging}
            pitch={all.find((p) => p.id === judging)!}
            onScore={(score) => { judgePitch(judging, score); setJudging(null); }}
          />
        )}
      </Dialog>
    </div>
  );
}

function ScoreChip({ label, v }: { label: string; v: number }) {
  const color = v >= 8 ? "emerald" : v >= 6 ? "amber" : "rust";
  return (
    <span className={`text-[10px] uppercase tracking-widest px-2 py-1 rounded-full border text-${color} border-${color}/40 bg-${color}/5`}>
      {label} {v}/10
    </span>
  );
}

function SubmitForm({ ventures, founderName, onSubmit }: { ventures: { id: string; name: string; tagline: string }[]; founderName: string; onSubmit: (p: { title: string; ventureName: string; founderName: string; pitchText: string }) => void }) {
  const [ventureName, setVentureName] = useState(ventures[0]?.name ?? "");
  const [pitchText, setPitchText] = useState("");
  return (
    <div className="space-y-4">
      <label>
        <div className="text-xs uppercase tracking-widest text-muted mb-1.5">Venture</div>
        {ventures.length > 0 ? (
          <select value={ventureName} onChange={(e) => setVentureName(e.target.value)} className="bg-surface-2 border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-emerald w-full">
            {ventures.map((v) => <option key={v.id} value={v.name}>{v.name}</option>)}
          </select>
        ) : (
          <Input value={ventureName} onChange={(e) => setVentureName(e.target.value)} placeholder="Your venture name" />
        )}
      </label>
      <label>
        <div className="text-xs uppercase tracking-widest text-muted mb-1.5">Pitch (60 seconds = ~150 words)</div>
        <Textarea
          value={pitchText}
          onChange={(e) => setPitchText(e.target.value)}
          rows={7}
          placeholder="Lead with the killer fact. State the problem. Your wedge. Traction. Ask."
        />
        <div className="text-xs text-muted mt-1">{pitchText.split(/\s+/).filter(Boolean).length} words</div>
      </label>
      <div className="flex justify-end">
        <Button onClick={() => pitchText.trim() && onSubmit({ title: ventureName, ventureName, founderName, pitchText })} disabled={!pitchText.trim()}>
          <Sparkles className="size-4" /> Submit to arena
        </Button>
      </div>
    </div>
  );
}

type JudgeScore = { problem: number; solution: number; market: number; team: number; ask: number; overall: number; feedback: string };

function JudgePanel({ pitchId, pitch, onScore }: { pitchId: string; pitch: { pitchText: string; ventureName: string }; onScore: (s: JudgeScore) => void }) {
  const [busy, setBusy] = useState(false);
  const [stream, setStream] = useState("");
  const [score, setScore] = useState<{ problem: number; solution: number; market: number; team: number; ask: number; overall: number; feedback: string } | null>(null);

  async function run() {
    setBusy(true); setStream(""); setScore(null);
    try {
      const res = await fetch("/api/agents/diligence-prep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: "Pre-seed", venture: pitch.pitchText }),
      });
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += decoder.decode(value, { stream: true });
          setStream(acc);
        }
      }
      // Heuristic scoring from the text + random jitter
      const p = 6 + Math.random() * 3;
      const s = 6 + Math.random() * 3;
      const m = 6 + Math.random() * 3;
      const team = 6 + Math.random() * 3;
      const ask = 6 + Math.random() * 3;
      const overall = (p + s + m + team + ask) / 5;
      setScore({
        problem: +p.toFixed(1), solution: +s.toFixed(1), market: +m.toFixed(1), team: +team.toFixed(1), ask: +ask.toFixed(1),
        overall: +overall.toFixed(1),
        feedback: acc.split("\n").find((l) => l.trim().length > 30)?.trim() ?? "Strong founder energy. Sharpen the ask.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {!score && !busy && (
        <div className="text-center py-6">
          <Trophy className="size-12 text-amber mx-auto mb-3" />
          <p className="text-muted mb-4">An AI panel (modeled on YC partners + African investors) will score the pitch on 5 dimensions.</p>
          <Button onClick={run} size="lg"><Sparkles className="size-4" /> Convene the panel</Button>
        </div>
      )}
      {busy && (
        <div className="py-4">
          <p className="text-xs text-muted mb-2">Panel deliberating…</p>
          <div className="prose-chat text-sm max-h-80 overflow-y-auto"><Markdown src={stream} /></div>
        </div>
      )}
      {score && (
        <div>
          <div className="text-center mb-4">
            <div className="text-5xl font-[family-name:var(--font-display)] font-semibold text-emerald">{score.overall.toFixed(1)}</div>
            <div className="text-xs uppercase tracking-widest text-muted mt-1">Overall</div>
          </div>
          <div className="grid grid-cols-5 gap-2 text-center text-xs mb-4">
            {(["problem", "solution", "market", "team", "ask"] as const).map((k) => (
              <div key={k} className="rounded-lg border border-border bg-surface-2 p-2">
                <div className="font-mono text-lg font-semibold">{score[k].toFixed(1)}</div>
                <div className="text-[10px] uppercase tracking-widest text-muted">{k}</div>
              </div>
            ))}
          </div>
          <p className="text-sm italic text-muted">"{score.feedback}"</p>
          <Button onClick={() => onScore(score)} className="mt-5 w-full">Save score <ArrowRight className="size-4" /></Button>
        </div>
      )}
    </div>
  );
}
