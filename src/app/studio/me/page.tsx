"use client";

import { useState } from "react";
import Link from "next/link";
import { useStore, level, xpInLevel, xpToNextLevel } from "@/store";
import { useMe } from "@/store/me";
import { Card, Button, Badge, Input, Dialog, Stat, EmptyState, Textarea } from "@/components/ui";
import { KnowledgeGraph } from "@/components/knowledge-graph";
import { Sparkline } from "@/components/sparkline";
import { getRecommendations } from "@/lib/recommendations";
import { User, Target, Brain, Sparkles, Trash2, Plus, Flame, Trophy, Activity, Clock, BookOpen, GraduationCap, ArrowRight, Compass, Network, CheckCircle2, Mic, Sun, Calendar, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function MePage() {
  const { user, xp, streak, ventures, dueCards } = useStore();
  const { memories, goals, recentActivity, concepts, focusSessions, voiceNotes, todaysBrief, momentumSamples, forget, completeGoal, setGoal, checkinGoal, remember, addVoiceNote } = useMe();
  const [goalDialog, setGoalDialog] = useState(false);
  const [memDialog, setMemDialog] = useState(false);
  if (!user) return null;

  const rec = getRecommendations(user.field);
  const lvl = level(xp);
  const acts = recentActivity(40);
  const activeGoals = goals.filter((g) => g.status === "active");
  const doneGoals = goals.filter((g) => g.status === "done");

  const totalMastery = concepts.reduce((s, c) => s + c.mastery, 0);
  const focusMinutes = focusSessions.filter((f) => f.completed).reduce((s, f) => s + f.durationMin, 0);

  // Momentum trajectory — last 30 samples. Delta compares the latest
  // reading to a week ago (or the earliest sample we have).
  const samples = momentumSamples.slice(-30);
  const momentumSeries = samples.map((s) => s.momentum);
  const velocitySeries = samples.map((s) => s.learningVelocity);
  const sampleLabels = samples.map((s) => s.date.slice(5));
  const latestMomentum = samples[samples.length - 1]?.momentum ?? 0;
  const weekAgoIdx = Math.max(0, samples.length - 8);
  const momentumDelta = samples.length > 1 ? latestMomentum - samples[weekAgoIdx].momentum : 0;

  return (
    <div className="max-w-7xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      {/* Hero */}
      <div className="flex items-start justify-between gap-6 flex-wrap mb-8">
        <div className="flex items-start gap-5">
          <div className="size-20 rounded-3xl bg-gradient-to-br from-emerald to-amber flex items-center justify-center text-black font-bold text-3xl shadow-xl shadow-emerald/20">
            {user.name[0]}
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-emerald mb-1 flex items-center gap-1.5">
              <User className="size-3.5" /> Me · Your living trajectory
            </p>
            <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight">{user.name}</h1>
            <div className="text-muted mt-1">{rec.department?.name ?? user.field} · {user.institution}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge color="emerald">Lv {lvl}</Badge>
              <Badge color="amber">🔥 {streak}d streak</Badge>
              <Badge color="muted">{xp.toLocaleString()} XP</Badge>
              <Badge color="indigo">{ventures.length} ventures</Badge>
            </div>
          </div>
        </div>
        <Card className="p-4 max-w-md">
          <div className="text-[10px] uppercase tracking-widest text-muted mb-1">Sage&apos;s read on you</div>
          <p className="text-sm leading-relaxed">
            <span className="text-foreground">{user.name.split(" ")[0]}</span> is a <span className="text-emerald">{rec.department?.name ?? "general"}</span> student at <span className="text-emerald">{user.institution}</span>, working on{" "}
            {ventures[0] ? <><span className="text-emerald">{ventures[0].name}</span> ({ventures[0].phase} phase)</> : "no venture yet"}.
            {memories.length > 0 && <> I have <span className="text-amber">{memories.length}</span> memories about your goals, preferences, and patterns.</>}
            {dueCards().length > 0 && <> Right now: <span className="text-rust">{dueCards().length} cards due</span>.</>}
          </p>
        </Card>
      </div>

      {/* Level progress */}
      <Card className="p-5 mb-6">
        <div className="flex items-center justify-between text-sm mb-3">
          <span className="text-muted">Level {lvl} → Level {lvl + 1}</span>
          <span className="font-mono text-emerald">{xpInLevel(xp)} / {xpToNextLevel()} XP</span>
        </div>
        <div className="h-2.5 bg-surface-2 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-emerald to-amber rounded-full transition-all" style={{ width: `${(xpInLevel(xp) / xpToNextLevel()) * 100}%` }} />
        </div>
      </Card>

      {/* Momentum trajectory */}
      <Card className="p-6 mb-6">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold flex items-center gap-2">
            <Activity className="size-4 text-emerald" /> Your trajectory
          </h2>
          {samples.length > 1 && (
            <div className="flex items-center gap-1.5 text-sm">
              {momentumDelta > 2 ? <TrendingUp className="size-4 text-emerald" /> : momentumDelta < -2 ? <TrendingDown className="size-4 text-rust" /> : <Minus className="size-4 text-muted" />}
              <span className={momentumDelta > 2 ? "text-emerald" : momentumDelta < -2 ? "text-rust" : "text-muted"}>
                {momentumDelta > 0 ? "+" : ""}{Math.round(momentumDelta)} vs last week
              </span>
            </div>
          )}
        </div>
        <div className="grid sm:grid-cols-2 gap-6">
          <div>
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="text-[10px] uppercase tracking-widest text-muted">Momentum</span>
              <span className="font-mono text-emerald">{latestMomentum}/100</span>
            </div>
            <Sparkline data={momentumSeries} labels={sampleLabels} color="#2cc295" />
          </div>
          <div>
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="text-[10px] uppercase tracking-widest text-muted">Learning velocity</span>
              <span className="font-mono text-amber">{samples[samples.length - 1]?.learningVelocity ?? 0}/100</span>
            </div>
            <Sparkline data={velocitySeries} labels={sampleLabels} color="#f4a949" />
          </div>
        </div>
        {samples.length <= 1 && (
          <p className="mt-4 text-xs text-muted">One point so far. Visit your dashboard daily and this chart fills in — momentum is sampled once per day.</p>
        )}
      </Card>

      <div className="grid sm:grid-cols-5 gap-3 mb-8">
        <Stat label="Concepts touched" value={concepts.length} color="emerald" sub={`mastery sum ${totalMastery.toFixed(1)}`} />
        <Stat label="Memory facts" value={memories.length} color="amber" sub="What Sage knows" />
        <Stat label="Active goals" value={activeGoals.length} color="indigo" sub={`${doneGoals.length} completed`} />
        <Stat label="Focus minutes" value={focusMinutes} color="rust" sub={`${focusSessions.length} sessions`} />
        <Stat label="Voice notes" value={voiceNotes.length} color="emerald" />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left: goals + timeline */}
        <div className="lg:col-span-2 space-y-6">
          {/* Goals */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold flex items-center gap-2"><Target className="size-4 text-emerald" /> Goals</h2>
              <Button size="sm" onClick={() => setGoalDialog(true)}><Plus className="size-3.5" /> New goal</Button>
            </div>
            {goals.length === 0 ? (
              <p className="text-sm text-muted">No goals yet. Goals let Sage know what to nudge you about and what to prioritize. Try: "Validate KubaCold with 20 interviews by April 30."</p>
            ) : (
              <div className="space-y-2">
                {activeGoals.map((g) => {
                  const latest = g.checkins[g.checkins.length - 1];
                  const progress = latest?.progress ?? 0;
                  return (
                    <div key={g.id} className="p-3 rounded-xl border border-border bg-surface-2/40">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 text-xs">
                            <Badge color="emerald">{g.category}</Badge>
                            {g.deadline && <span className="text-muted">by {g.deadline}</span>}
                          </div>
                          <div className="font-medium text-sm mt-1">{g.text}</div>
                        </div>
                        <button onClick={() => completeGoal(g.id)} className="size-7 rounded-lg text-muted hover:text-emerald hover:bg-emerald/10 flex items-center justify-center transition" title="Mark complete">
                          <CheckCircle2 className="size-4" />
                        </button>
                      </div>
                      <div className="mt-3 h-1.5 bg-surface-2 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald rounded-full" style={{ width: `${progress * 100}%` }} />
                      </div>
                      <div className="mt-2 flex items-center justify-between text-xs text-muted">
                        <span>{g.checkins.length} check-ins</span>
                        <button onClick={() => { const n = prompt("Quick check-in note"); if (n !== null) { const p = parseFloat(prompt("Progress 0-1") ?? "0.1"); checkinGoal(g.id, n, isNaN(p) ? 0 : Math.max(0, Math.min(1, p))); } }} className="text-emerald hover:underline">+ Check-in</button>
                      </div>
                    </div>
                  );
                })}
                {doneGoals.length > 0 && (
                  <details className="text-xs text-muted">
                    <summary className="cursor-pointer hover:text-foreground">{doneGoals.length} completed</summary>
                    <div className="mt-2 space-y-1">
                      {doneGoals.map((g) => <div key={g.id} className="line-through">{g.text}</div>)}
                    </div>
                  </details>
                )}
              </div>
            )}
          </Card>

          {/* Knowledge graph */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold flex items-center gap-2">
                <Network className="size-4 text-emerald" /> Knowledge graph
              </h2>
              <Badge color="muted">{concepts.length} nodes</Badge>
            </div>
            <KnowledgeGraph concepts={concepts} />
            <p className="text-xs text-muted text-center mt-3">Hover any node. Larger = more mastery. Connected nodes = concepts you encountered together.</p>
          </Card>

          {/* Activity timeline */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold flex items-center gap-2"><Activity className="size-4 text-emerald" /> Your story</h2>
              <Badge color="muted">{acts.length} recent events</Badge>
            </div>
            {acts.length === 0 ? (
              <p className="text-sm text-muted">As you use the studio, your activity will appear here. Sage uses this story to give you better suggestions.</p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {acts.map((a) => (
                  <div key={a.id} className="flex items-start gap-3 py-1.5 px-2 rounded hover:bg-surface-2 transition text-sm">
                    <div className="text-[10px] text-muted shrink-0 mt-0.5 w-16">{formatDistanceToNow(a.ts, { addSuffix: false })}</div>
                    <Badge color="muted">{a.kind}</Badge>
                    {a.href ? <Link href={a.href} className="flex-1 hover:text-emerald transition truncate">{a.title}</Link> : <div className="flex-1 truncate">{a.title}</div>}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Right: memories + voice notes + brief */}
        <div className="space-y-6">
          {/* Brief */}
          {todaysBrief() && (
            <Card className="p-5 bg-gradient-to-br from-emerald/10 to-amber/10 border-emerald/30">
              <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-amber mb-2"><Sun className="size-3.5" /> Today&apos;s brief</div>
              <p className="text-sm leading-relaxed">{todaysBrief()?.morning}</p>
              {(todaysBrief()?.priorities ?? []).length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {todaysBrief()?.priorities.map((p) => (
                    <div key={p.id} className={`text-xs flex items-center gap-2 ${p.done ? "line-through text-muted" : ""}`}>
                      <span className={`size-1.5 rounded-full ${p.done ? "bg-emerald" : "bg-amber"}`} />
                      {p.text} <span className="text-muted">· {p.estMin}m</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {/* Memory */}
          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium flex items-center gap-2"><Brain className="size-4 text-emerald" /> Memory</h3>
              <Button size="sm" variant="ghost" onClick={() => setMemDialog(true)}><Plus className="size-3.5" /></Button>
            </div>
            {memories.length === 0 ? (
              <p className="text-xs text-muted">As Sage learns about you, facts appear here. You can add or forget any of them.</p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {memories.slice(0, 20).map((m) => (
                  <div key={m.id} className="group flex items-start gap-2 text-xs p-2 rounded hover:bg-surface-2 transition">
                    <span className={`size-1.5 rounded-full mt-1.5 ${m.kind === "achievement" ? "bg-emerald" : m.kind === "challenge" ? "bg-rust" : m.kind === "preference" ? "bg-amber" : "bg-indigo"}`} />
                    <div className="flex-1 min-w-0">
                      <div className="leading-snug">{m.fact}</div>
                      <div className="text-[10px] text-muted mt-0.5">{m.kind} · {formatDistanceToNow(m.lastSeenAt, { addSuffix: true })}</div>
                    </div>
                    <button onClick={() => forget(m.id)} className="opacity-0 group-hover:opacity-100 text-muted hover:text-rust transition">
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Voice notes */}
          <Card className="p-5">
            <h3 className="font-medium flex items-center gap-2 mb-3"><Mic className="size-4 text-emerald" /> Voice notes</h3>
            {voiceNotes.length === 0 ? (
              <p className="text-xs text-muted">Tap the mic in the Companion to capture voice notes. They live here, tagged and searchable.</p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {voiceNotes.map((v) => (
                  <div key={v.id} className="text-xs p-2 rounded border border-border bg-surface-2/40">
                    <div className="text-[10px] text-muted">{formatDistanceToNow(v.ts, { addSuffix: true })} · {v.duration}s</div>
                    <div className="leading-snug mt-1">{v.transcript}</div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Next moves */}
          <Card className="p-5 bg-gradient-to-br from-amber/10 to-emerald/10">
            <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-amber mb-3"><Sparkles className="size-3.5" /> What to try next</div>
            <div className="space-y-2 text-sm">
              <Link href="/studio/path" className="flex items-center justify-between p-2 rounded-lg hover:bg-surface-2 transition">
                <span><GraduationCap className="size-3.5 inline text-emerald mr-1.5" /> Open Your Path</span>
                <ArrowRight className="size-3.5 text-muted" />
              </Link>
              <Link href="/studio/srs" className="flex items-center justify-between p-2 rounded-lg hover:bg-surface-2 transition">
                <span><BookOpen className="size-3.5 inline text-emerald mr-1.5" /> Clear {dueCards().length} cards</span>
                <ArrowRight className="size-3.5 text-muted" />
              </Link>
              <Link href="/studio/brainstorm" className="flex items-center justify-between p-2 rounded-lg hover:bg-surface-2 transition">
                <span><Compass className="size-3.5 inline text-emerald mr-1.5" /> Start a sketch</span>
                <ArrowRight className="size-3.5 text-muted" />
              </Link>
            </div>
          </Card>
        </div>
      </div>

      <Dialog open={goalDialog} onClose={() => setGoalDialog(false)} title="New goal">
        <GoalForm onCreate={(g) => { setGoal(g); setGoalDialog(false); }} />
      </Dialog>
      <Dialog open={memDialog} onClose={() => setMemDialog(false)} title="Teach Sage something about you">
        <MemoryForm onCreate={(m) => { remember(m); setMemDialog(false); }} />
      </Dialog>
    </div>
  );
}

function GoalForm({ onCreate }: { onCreate: (g: { text: string; category: "learning" | "venture" | "personal" | "career"; deadline?: string }) => void }) {
  const [text, setText] = useState("");
  const [category, setCategory] = useState<"learning" | "venture" | "personal" | "career">("venture");
  const [deadline, setDeadline] = useState("");
  return (
    <div className="space-y-3">
      <div>
        <div className="text-xs uppercase tracking-widest text-muted mb-1.5">Goal</div>
        <Textarea placeholder="e.g. Validate KubaCold with 20 interviews by April 30" value={text} onChange={(e) => setText(e.target.value)} rows={3} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted mb-1.5">Category</div>
          <select value={category} onChange={(e) => setCategory(e.target.value as "learning" | "venture" | "personal" | "career")} className="bg-surface-2 border border-border rounded-xl px-3 py-2 text-sm outline-none w-full">
            <option value="venture">Venture</option><option value="learning">Learning</option><option value="career">Career</option><option value="personal">Personal</option>
          </select>
        </div>
        <div>
          <div className="text-xs uppercase tracking-widest text-muted mb-1.5">Deadline (optional)</div>
          <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </div>
      </div>
      <Button onClick={() => text.trim() && onCreate({ text, category, deadline: deadline || undefined })} disabled={!text.trim()} className="w-full">Set goal</Button>
    </div>
  );
}

function MemoryForm({ onCreate }: { onCreate: (m: { fact: string; kind: "preference" | "context" | "challenge" | "achievement" | "goal" | "venture" | "person"; source: "explicit"; importance: 1 | 2 | 3 | 4 | 5 }) => void }) {
  const [fact, setFact] = useState("");
  const [kind, setKind] = useState<"preference" | "context" | "challenge" | "achievement" | "goal" | "venture" | "person">("preference");
  return (
    <div className="space-y-3">
      <div>
        <div className="text-xs uppercase tracking-widest text-muted mb-1.5">Fact</div>
        <Textarea placeholder="e.g. I prefer Twi explanations · My mom runs a cocoa farm · I'm scared of cold-calling" value={fact} onChange={(e) => setFact(e.target.value)} rows={3} />
      </div>
      <div>
        <div className="text-xs uppercase tracking-widest text-muted mb-1.5">Kind</div>
        <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className="bg-surface-2 border border-border rounded-xl px-3 py-2 text-sm outline-none w-full">
          {["preference", "context", "challenge", "achievement", "goal", "venture", "person"].map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
      </div>
      <Button onClick={() => fact.trim() && onCreate({ fact, kind, source: "explicit", importance: 4 })} disabled={!fact.trim()} className="w-full">Add to memory</Button>
    </div>
  );
}
