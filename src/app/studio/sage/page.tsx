"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useStore, level } from "@/store";
import { useMe } from "@/store/me";
import { useLetters } from "@/store/letters";
import { Markdown } from "@/components/markdown";
import { useVoice } from "@/hooks/use-voice";
import { genomeVoiceInstruction } from "@/lib/genome";
import { getRecommendations, resolveDepartment } from "@/lib/recommendations";
import { getDepartment } from "@/lib/disciplines";
import { Brain, Mic, MicOff, Send, ArrowLeft, Volume2, VolumeX, Sparkles, X, Mail, GraduationCap, Lightbulb } from "lucide-react";

type Msg = { role: "user" | "assistant"; content: string };

const OPENINGS = [
  (n: string) => `${n}. It's good to see you. What's on your mind?`,
  (n: string) => `${n}, sit with me for a moment. What's the most honest thing you could tell me about this week?`,
  (n: string) => `Take a breath, ${n}. We've got time. What are you turning over?`,
  (n: string) => `${n} — pick something small to start. I'm listening.`,
  (n: string) => `Welcome back, ${n}. Where did we leave off in your head?`,
];

export default function SagePage() {
  const { user, ventures, xp, streak, dueCards } = useStore();
  const { genome, recall, recentActivity, goals, todaysBrief, remember, logActivity } = useMe();
  const { startSession, appendMessage, endSession, writeLetter } = useLetters();
  const { listening, transcript, supported: voiceSupported, start: startListen, stop: stopListen, speak } = useVoice();

  const [opening, setOpening] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [referencedMemories, setReferencedMemories] = useState<string[]>([]);
  const [closing, setClosing] = useState(false);
  const [letter, setLetter] = useState<{ title: string; body: string } | null>(null);
  const [letterBusy, setLetterBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    const sid = startSession();
    setSessionId(sid);
    const first = user.name.split(" ")[0];
    setOpening(OPENINGS[Math.floor(Math.random() * OPENINGS.length)](first));
  }, [user]);

  useEffect(() => {
    if (transcript) setInput(transcript);
  }, [transcript]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, opening]);

  if (!user) return null;
  const rec = getRecommendations(user.field);
  const lvl = level(xp);

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || busy) return;
    setInput("");
    if (sessionId) appendMessage(sessionId, "user", content);

    const next: Msg[] = [...msgs, { role: "user", content }];
    setMsgs([...next, { role: "assistant", content: "" }]);
    setBusy(true);
    logActivity({ kind: "coach", title: `Sage session: ${content.slice(0, 60)}` });

    const memoriesSlice = recall().slice(0, 8);
    setReferencedMemories(memoriesSlice.map((m) => m.fact));

    const ctxPayload = {
      name: user!.name,
      first: user!.name.split(" ")[0],
      field: user!.field,
      institution: user!.institution,
      country: user!.country,
      language: user!.primaryLanguage,
      level: lvl,
      streak,
      activeVenture: ventures[0] ? `${ventures[0].name} — ${ventures[0].tagline} (phase: ${ventures[0].phase}, ${ventures[0].interviews.length} interviews, $${ventures[0].metrics.mrr} MRR)` : null,
      activeGoals: goals.filter((g) => g.status === "active").map((g) => g.text).join("; ") || "(none yet)",
      memorySummary: memoriesSlice.map((m) => `- ${m.fact}`).join("\n") || "(no facts yet)",
      recentActivity: recentActivity(8).map((a) => a.title).join(" / "),
      brief: todaysBrief()?.morning ?? null,
      dueCards: dueCards().length,
      genomeSummary: `${genome.totem} totem, motivated by ${genome.motivation}, primary fear: ${genome.primaryFear}`,
      genomeVoice: genomeVoiceInstruction(genome),
      department: rec.department?.name ?? "general",
      sessionMode: "sit-with-sage-1on1",
    };

    try {
      const res = await fetch("/api/coach/sage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next, context: ctxPayload }),
      });
      const reader = res.body?.getReader();
      const dec = new TextDecoder();
      let acc = "";
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += dec.decode(value, { stream: true });
          setMsgs((m) => { const c = m.slice(); c[c.length - 1] = { role: "assistant", content: acc }; return c; });
        }
      }
      if (sessionId) appendMessage(sessionId, "assistant", acc);
      // store the conversation seed in memory
      if (acc.length > 100) {
        remember({ fact: `Spoke with Sage about: ${content.slice(0, 100)}`, kind: "context", source: "chat", importance: 2 });
      }
      if (autoSpeak) {
        const cleaned = acc.replace(/[#*`_>\[\]]/g, "").slice(0, 1200);
        speak(cleaned);
      }
      if (voiceMode) {
        // auto-restart listening
        setTimeout(() => { if (voiceSupported) startListen(); }, 600);
      }
    } catch (err) {
      setMsgs((m) => { const c = m.slice(); c[c.length - 1] = { role: "assistant", content: `_Connection hiccup. ${(err as Error).message}_` }; return c; });
    } finally {
      setBusy(false);
    }
  }

  async function closeSession() {
    if (!sessionId || msgs.length === 0) {
      window.history.back();
      return;
    }
    setClosing(true);
    setLetterBusy(true);
    try {
      const topic = msgs[0]?.content?.slice(0, 200) ?? "this session";
      const res = await fetch("/api/generate/letter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: "session-end",
          name: user!.name,
          field: user!.field,
          genomeVoice: genomeVoiceInstruction(genome),
          triggerContext: topic,
          memorySummary: recall().slice(0, 6).map((m) => `- ${m.fact}`).join("\n"),
          recentActivity: recentActivity(6).map((a) => a.title).join(" / "),
        }),
      });
      const data = await res.json() as { title: string; body: string };
      const letterId = writeLetter({ reason: "Session reflection", title: data.title, body: data.body, triggeredBy: sessionId });
      endSession(sessionId, letterId);
      setLetter(data);
    } finally {
      setLetterBusy(false);
    }
  }

  function toggleVoiceMode() {
    if (voiceMode) {
      stopListen();
      setVoiceMode(false);
      setAutoSpeak(false);
    } else {
      setVoiceMode(true);
      setAutoSpeak(true);
      if (voiceSupported) startListen();
    }
  }

  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex flex-col relative overflow-hidden">
      {/* Ambient background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-32 -right-32 size-[28rem] rounded-full bg-emerald/15 blur-3xl" />
        <div className="absolute -bottom-32 -left-32 size-[28rem] rounded-full bg-amber/10 blur-3xl" />
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 80, repeat: Infinity, ease: "linear" }}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 size-[60rem] rounded-full border border-emerald/5"
        />
        <motion.div
          animate={{ rotate: -360 }}
          transition={{ duration: 120, repeat: Infinity, ease: "linear" }}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 size-[44rem] rounded-full border border-amber/5"
        />
      </div>

      <header className="relative px-5 sm:px-8 py-4 flex items-center justify-between border-b border-border/40 backdrop-blur z-10">
        <Link href="/studio" className="text-sm text-muted hover:text-foreground inline-flex items-center gap-1.5">
          <ArrowLeft className="size-3.5" /> Studio
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-[10px] uppercase tracking-[0.3em] text-emerald">Sit with Sage · 1:1</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoSpeak((v) => !v)}
            className={`size-9 rounded-xl border border-border flex items-center justify-center transition ${autoSpeak ? "bg-emerald/15 text-emerald" : "text-muted hover:text-foreground hover:bg-surface-2"}`}
            title={autoSpeak ? "Stop reading aloud" : "Read replies aloud"}
          >
            {autoSpeak ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
          </button>
          <Link
            href="/studio/letters"
            className="size-9 rounded-xl border border-border flex items-center justify-center text-muted hover:text-foreground hover:bg-surface-2 transition"
            title="Letters Sage has written you"
          >
            <Mail className="size-4" />
          </Link>
          <button onClick={closeSession} className="size-9 rounded-xl border border-border flex items-center justify-center text-muted hover:text-foreground hover:bg-surface-2 transition" title="End session">
            <X className="size-4" />
          </button>
        </div>
      </header>

      <div className="relative flex-1 flex">
        {/* Main thread */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 sm:px-12 py-12">
          <div className="max-w-2xl mx-auto">
            {/* Opening */}
            {opening && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 1 }}
                className="mb-12 text-center"
              >
                <motion.div
                  animate={{ scale: [1, 1.05, 1] }}
                  transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                  className="size-20 mx-auto rounded-full bg-gradient-to-br from-emerald to-emerald-deep flex items-center justify-center shadow-2xl shadow-emerald/30 mb-6"
                >
                  <Brain className="size-9 text-black" />
                </motion.div>
                <p className="font-[family-name:var(--font-display)] text-2xl sm:text-3xl leading-snug">
                  {opening}
                </p>
                <DisciplineStarters userField={user?.field} onPick={(text) => setInput(text)} />
              </motion.div>
            )}

            {/* Messages */}
            <div className="space-y-8">
              {msgs.map((m, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5 }}
                  className={m.role === "user" ? "flex justify-end" : ""}
                >
                  {m.role === "user" ? (
                    <div className="max-w-[80%] bg-emerald/10 border border-emerald/30 rounded-2xl rounded-tr-sm px-5 py-3 text-base">
                      {m.content}
                    </div>
                  ) : (
                    <div className="flex items-start gap-3">
                      <div className="size-9 rounded-xl bg-gradient-to-br from-emerald to-emerald-deep flex items-center justify-center shrink-0 mt-1">
                        <Brain className="size-4 text-black" />
                      </div>
                      <div className="flex-1 min-w-0 prose-chat text-lg leading-[1.7] text-foreground/95 font-[family-name:var(--font-display)] font-normal">
                        <Markdown src={m.content} />
                        {busy && i === msgs.length - 1 && (
                          <div className="mt-2 flex gap-1">
                            <span className="size-1.5 rounded-full bg-emerald animate-pulse" />
                            <span className="size-1.5 rounded-full bg-emerald animate-pulse" style={{ animationDelay: "0.15s" }} />
                            <span className="size-1.5 rounded-full bg-emerald animate-pulse" style={{ animationDelay: "0.3s" }} />
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </motion.div>
              ))}
            </div>

            {/* Voice-mode indicator */}
            {voiceMode && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-12 text-center"
              >
                <motion.div
                  animate={{ scale: listening ? [1, 1.15, 1] : 1 }}
                  transition={{ duration: 1.2, repeat: listening ? Infinity : 0 }}
                  className={`inline-flex items-center gap-3 px-5 py-3 rounded-full ${listening ? "bg-rust/15 border border-rust/40 text-rust" : "bg-surface-2 border border-border text-muted"}`}
                >
                  {listening ? <><Mic className="size-4" /> Listening…</> : <><MicOff className="size-4" /> Voice paused</>}
                </motion.div>
              </motion.div>
            )}
          </div>
        </div>

        {/* Side: memories pane (referenced) */}
        <aside className="hidden lg:flex w-72 border-l border-border/40 bg-surface/20 backdrop-blur p-5 flex-col gap-4 overflow-y-auto">
          <div>
            <div className="text-[10px] uppercase tracking-[0.25em] text-amber mb-2">Sage is thinking of</div>
            {referencedMemories.length === 0 ? (
              <p className="text-xs text-muted leading-relaxed">As you speak, the memories Sage is drawing on appear here.</p>
            ) : (
              <ul className="space-y-2.5">
                {referencedMemories.slice(0, 8).map((m, i) => (
                  <motion.li
                    key={i}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="text-xs text-muted leading-relaxed border-l-2 border-emerald/40 pl-3"
                  >
                    {m}
                  </motion.li>
                ))}
              </ul>
            )}
          </div>
          <div className="mt-auto pt-4 border-t border-border">
            <div className="text-[10px] uppercase tracking-[0.25em] text-emerald mb-2">Session context</div>
            <div className="text-xs text-muted space-y-1">
              <div>· {user.name.split(" ")[0]} · Lv {lvl} · {streak}d streak</div>
              <div>· Field: {rec.department?.name ?? user.field}</div>
              {ventures[0] && <div>· Venture: {ventures[0].name} ({ventures[0].phase})</div>}
              <div>· Totem: {genome.totem}</div>
            </div>
          </div>
        </aside>
      </div>

      {/* Input row */}
      <footer className="relative border-t border-border/40 px-5 sm:px-12 py-4 backdrop-blur">
        <div className="max-w-2xl mx-auto">
          <form
            onSubmit={(e) => { e.preventDefault(); send(); }}
            className="glass rounded-2xl flex items-end gap-2 p-2 pl-4 shadow-xl shadow-emerald/5"
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder={busy ? "Sage is thinking…" : listening ? "Listening…" : "Say what's on your mind. Sage is listening."}
              rows={1}
              disabled={busy}
              className="flex-1 bg-transparent resize-none outline-none py-2 placeholder:text-muted text-foreground text-base max-h-40"
            />
            {voiceSupported && (
              <button
                type="button"
                onClick={toggleVoiceMode}
                className={`size-10 rounded-xl flex items-center justify-center transition ${voiceMode ? "bg-rust text-white" : "text-muted hover:text-foreground hover:bg-surface-2"}`}
                title="Toggle hands-free voice mode"
              >
                {voiceMode ? <MicOff className="size-4" /> : <Mic className="size-4" />}
              </button>
            )}
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="size-10 rounded-xl bg-emerald text-black hover:bg-amber disabled:opacity-30 transition flex items-center justify-center"
            >
              <Send className="size-4" />
            </button>
          </form>
          <div className="mt-2 flex items-center justify-between text-[10px] text-muted">
            <span>Press Enter to send · Shift+Enter for newline · Mic for voice mode</span>
            {msgs.length > 0 && (
              <button onClick={closeSession} className="text-emerald hover:underline">End session & get a letter →</button>
            )}
          </div>
        </div>
      </footer>

      {/* End-of-session letter overlay */}
      <AnimatePresence>
        {closing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-background flex items-center justify-center p-5 overflow-y-auto"
          >
            <div className="absolute inset-0 grid-paper opacity-20" />
            <div className="absolute -top-32 -right-32 size-96 rounded-full bg-emerald/15 blur-3xl" />
            <div className="absolute -bottom-32 -left-32 size-96 rounded-full bg-amber/15 blur-3xl" />
            <div className="relative max-w-2xl w-full">
              {letterBusy && !letter && (
                <div className="text-center">
                  <motion.div animate={{ rotate: 360 }} transition={{ duration: 6, repeat: Infinity, ease: "linear" }} className="size-16 mx-auto rounded-full border-4 border-emerald/30 border-t-emerald mb-6" />
                  <p className="text-muted">Sage is writing you a letter to remember this session by…</p>
                </div>
              )}
              {letter && (
                <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }}>
                  <div className="text-center mb-8">
                    <Mail className="size-9 text-amber mx-auto mb-3" />
                    <div className="text-[10px] uppercase tracking-[0.3em] text-emerald">A letter from Sage</div>
                    <h2 className="font-[family-name:var(--font-display)] text-3xl sm:text-4xl font-semibold mt-2">{letter.title}</h2>
                  </div>
                  <div className="glass rounded-3xl p-8 sm:p-12 font-[family-name:var(--font-display)] text-lg leading-[1.7]">
                    <Markdown src={letter.body} />
                  </div>
                  <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
                    <Link href="/studio/letters" className="bg-emerald text-black font-medium px-6 py-3 rounded-full hover:bg-amber transition flex items-center justify-center gap-2">
                      <Mail className="size-4" /> Keep this letter
                    </Link>
                    <Link href="/studio" className="border border-border bg-surface px-6 py-3 rounded-full hover:bg-surface-2 transition flex items-center justify-center gap-2">
                      Back to studio
                    </Link>
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Discipline-aware starter prompts. Mirrors the Build Studio's
// "Start from a <Department> angle" strip: surfaces three of the
// student's discipline-grounded angles as one-click chat starters.
// Sage's [DISCIPLINE] brain block keeps the follow-up grounded.
function DisciplineStarters({ userField, onPick }: { userField: string | undefined; onPick: (text: string) => void }) {
  const dept = userField ? resolveDepartment(userField) : undefined;
  const full = dept ? getDepartment(dept.id)?.department : null;
  if (!full || full.aiOpportunities.length === 0) return null;
  return (
    <div className="mt-10 mx-auto max-w-3xl">
      <div className="flex items-center justify-center gap-2 mb-3 text-[10px] uppercase tracking-[0.22em] text-emerald">
        <GraduationCap className="size-3" /> Start from your discipline
      </div>
      <div className="grid sm:grid-cols-3 gap-2.5">
        {full.aiOpportunities.slice(0, 3).map((op) => {
          const seed = `I want to think with you about "${op.title}". My discipline's angle: ${op.why}. What's the smallest version of this I could test with one real person this week?`;
          return (
            <button
              key={op.title}
              onClick={() => onPick(seed)}
              className="text-left rounded-2xl border border-emerald/30 bg-emerald/5 hover:bg-emerald/10 hover:border-emerald/50 transition p-3.5 group"
            >
              <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-widest text-emerald mb-1.5">
                <Lightbulb className="size-2.5" /> Angle
              </div>
              <div className="text-xs font-medium leading-snug line-clamp-3">{op.title}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
