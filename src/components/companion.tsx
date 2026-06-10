"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Brain, Mic, MicOff, Send, X, Maximize2, Minimize2, Volume2, VolumeX, Sparkles, Lightbulb, Target, Rocket, BookMarked, Compass, Bot, Globe2, GraduationCap } from "lucide-react";
import { useStore, level } from "@/store";
import { useMe } from "@/store/me";
import { Markdown } from "@/components/markdown";
import { useVoice } from "@/hooks/use-voice";
import { getRecommendations } from "@/lib/recommendations";
import { genomeVoiceInstruction, genomeSummary } from "@/lib/genome";
import { buildSiteContextSnapshotAsync } from "@/lib/site-brain-snapshot";
import { insightStarter } from "@/lib/insights";
import { logUxEvent } from "@/lib/ux-events";
import { usePulse } from "@/lib/use-pulse";

type Msg = { role: "user" | "assistant"; content: string };

const QUICK_ACTIONS_FOR_PATH: Record<string, { icon: typeof Sparkles; label: string; href?: string; action?: () => void }[]> = {};

export function Companion() {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const { user, ventures, xp, streak, dueCards } = useStore();
  const { prefs, toggleCompanion, trackRoute, recall, recentActivity, todaysBrief, logActivity, remember, pushInsight, goals, genome } = useMe();
  const { listening, transcript, supported, start, stop, speak } = useVoice();
  const pulse = usePulse();

  const [open, setOpen] = useState(prefs.companionOpen);
  const [expanded, setExpanded] = useState(false);
  const [voiceOn, setVoiceOn] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [proactiveDismissed, setProactiveDismissed] = useState(false);
  // One personalized starter derived from the user's connection graph
  // (e.g. "Why does post-harvest-loss keep pulling me back?"). Computed
  // lazily once the companion first opens — the snapshot fetch hits a
  // 60s cache so subsequent opens are free.
  const [graphStarter, setGraphStarter] = useState<string | null>(null);
  // Same starter, but pre-resolved on first mount when the user has
  // recent graph activity (≥1 edge in the last 7 days) so we can
  // surface it as the closed-fab proactive nudge — the only way users
  // who never tap the companion ever see the insight chain.
  const [graphProactive, setGraphProactive] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Hoisted: see proactiveImpression effect below, after `proactive`
  // is computed.
  const proactiveLoggedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await buildSiteContextSnapshotAsync("companion");
        if (cancelled) return;
        const s = insightStarter(snap.insights ? {
          topProblem: snap.insights.topProblem ?? null,
          ventureFromSketch: snap.insights.ventureFromSketch ?? [],
          orphanBuilds: snap.insights.orphanBuilds ?? [],
          byKind: [],
        } : null);
        if (!s) return;
        setGraphStarter(s);

        // Freshness gate for the proactive surface: only nudge when the
        // user has touched their graph in the last 7 days. Otherwise
        // the nudge feels like a ghost of past activity.
        const { fetchUserConnectionsCached } = await import("@/lib/connections-client");
        const rows = await fetchUserConnectionsCached();
        if (cancelled) return;
        const sevenDayMs = 7 * 86_400_000;
        const fresh = rows.filter((r) => Date.now() - new Date(r.created_at).getTime() < sevenDayMs).length;
        if (fresh >= 1) setGraphProactive(s);
      } catch { /* no starter, no problem */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // Track route changes
  useEffect(() => {
    trackRoute(pathname);
    logActivity({ kind: "system", title: `Visited ${pathname}`, href: pathname });
  }, [pathname]);

  // Push transcript into input as user speaks
  useEffect(() => {
    if (transcript) setInput(transcript);
  }, [transcript]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, open]);

  // Hide on onboarding
  if (pathname === "/studio/onboarding") return null;
  if (!user) return null;
  const me = user;

  const due = dueCards();
  const activeVenture = ventures[0];
  const memorySummary = recall().slice(0, 6).map((m) => `- ${m.fact}`).join("\n");
  const rec = getRecommendations(user.field);
  const dept = rec.department;
  const lvl = level(xp);

  // Contextual suggestions based on current page
  const ctx = pageContext(pathname);
  const proactive = makeProactive({
    user, due, ventures, dept, goals, brief: todaysBrief(), pathname,
  });
  // The Pulse Engine's top action — surfaced as the proactive nudge on
  // every page except the dashboard (which already renders the full
  // queue). Graph-derived nudges still win when fresh.
  const pulseAction = pathname !== "/studio" ? pulse?.actions[0] ?? null : null;

  // Log the proactive impression once when it first becomes visible.
  // Dedupe via the ref so re-renders don't multi-fire.
  useEffect(() => {
    if (open || proactiveDismissed) return;
    if (proactiveLoggedRef.current) return;
    const text = graphProactive ?? pulseAction?.title ?? proactive;
    if (!text) return;
    proactiveLoggedRef.current = true;
    logUxEvent("companion_proactive_shown", { source: graphProactive ? "graph" : pulseAction ? "pulse" : "page" });
  }, [open, proactiveDismissed, graphProactive, pulseAction, proactive]);

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || busy) return;
    setInput("");
    const next: Msg[] = [...msgs, { role: "user", content }];
    setMsgs([...next, { role: "assistant", content: "" }]);
    setBusy(true);
    logActivity({ kind: "coach", title: `Companion: ${content.slice(0, 60)}` });

    const ctxPayload = {
      page: pathname,
      pageContext: ctx,
      name: me.name,
      field: me.field,
      institution: me.institution,
      level: lvl,
      streak,
      activeVenture: activeVenture ? `${activeVenture.name} — ${activeVenture.tagline} (phase: ${activeVenture.phase})` : null,
      activeGoals: goals.filter((g) => g.status === "active").map((g) => g.text).join("; "),
      memorySummary: memorySummary || "(none yet)",
      recentActivity: recentActivity(5).map((a) => a.title).join(" / "),
      brief: todaysBrief()?.morning ?? null,
      genomeSummary: genomeSummary(genome),
      genomeVoice: genomeVoiceInstruction(genome),
    };

    try {
      const res = await fetch("/api/coach/sage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next, context: ctxPayload, siteContext: await buildSiteContextSnapshotAsync("companion") }),
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
      // Stash a memory fact if Sage said something the user might want recalled later
      if (acc.length > 80) {
        remember({ fact: `User asked: ${content.slice(0, 100)}`, kind: "context", source: "chat", importance: 2 });
      }
      if (voiceOn) speak(acc.replace(/[#*`_>\[\]]/g, "").slice(0, 800));
    } catch (e) {
      setMsgs((m) => { const c = m.slice(); c[c.length - 1] = { role: "assistant", content: `_Hiccup: ${(e as Error).message}_` }; return c; });
    } finally {
      setBusy(false);
    }
  }

  function togglePanel() {
    setOpen((o) => !o);
    toggleCompanion();
  }

  return (
    <>
      {/* Floating button (always visible) */}
      {!open && (
        <button
          onClick={() => { setOpen(true); }}
          className="fixed bottom-5 right-5 z-[60] size-14 rounded-2xl bg-gradient-to-br from-emerald to-amber shadow-2xl shadow-emerald/40 flex items-center justify-center hover:scale-110 transition group"
          title="Talk to Sage"
        >
          <Brain className="size-6 text-black" />
          {(due.length > 0 || (proactive && !proactiveDismissed)) && (
            <span className="absolute -top-1 -right-1 size-3 rounded-full bg-rust border-2 border-background pulse-dot" />
          )}
          <span className="absolute -top-9 right-0 px-2 py-1 rounded-md bg-surface text-xs text-foreground opacity-0 group-hover:opacity-100 transition pointer-events-none whitespace-nowrap border border-border">
            Sage · ⌘J
          </span>
        </button>
      )}

      {/* Proactive nudge bubble. Priority: fresh graph insight → Pulse
          Engine's top next-best-action → page heuristic. The pulse
          variant deep-links straight to the action instead of routing
          through a chat turn. */}
      {!open && (graphProactive || pulseAction || proactive) && !proactiveDismissed && (() => {
        const text = graphProactive ?? pulseAction?.title ?? proactive;
        const source = graphProactive ? "graph" : pulseAction ? "pulse" : "page";
        return (
          <div className="fixed bottom-24 right-5 z-[59] max-w-xs glass rounded-2xl p-4 shadow-2xl border border-amber/30 animate-fade-in" data-source={source}>
            <button onClick={() => setProactiveDismissed(true)} className="absolute top-2 right-2 text-muted hover:text-foreground"><X className="size-3.5" /></button>
            <div className="flex items-start gap-3">
              <Sparkles className="size-4 text-amber shrink-0 mt-0.5" />
              <div className="text-sm">
                {source === "graph" && <div className="text-[10px] uppercase tracking-widest text-emerald mb-1">From your graph</div>}
                {source === "pulse" && <div className="text-[10px] uppercase tracking-widest text-emerald mb-1 flex items-center gap-1"><span className="size-1 rounded-full bg-emerald pulse-dot" /> Live engine</div>}
                {text}
                {source === "pulse" && pulseAction && <p className="mt-1 text-xs text-muted">{pulseAction.reason}</p>}
              </div>
            </div>
            {source === "pulse" && pulseAction ? (
              <button
                onClick={() => {
                  logUxEvent("companion_proactive_clicked", { source });
                  setProactiveDismissed(true);
                  router.push(pulseAction.href);
                }}
                className="mt-3 text-xs text-emerald hover:underline"
              >
                Do it now (~{pulseAction.estMin}m) →
              </button>
            ) : (
              <button
                onClick={() => {
                  logUxEvent("companion_proactive_clicked", { source });
                  setOpen(true);
                  setProactiveDismissed(true);
                  setMsgs([{ role: "user", content: text! }, { role: "assistant", content: "" }]);
                  send(text!);
                }}
                className="mt-3 text-xs text-emerald hover:underline"
              >
                Talk to Sage about this →
              </button>
            )}
          </div>
        );
      })()}

      {/* Companion panel */}
      {open && (
        <div className={`fixed z-[60] glass rounded-2xl shadow-2xl shadow-emerald/20 border border-emerald/30 flex flex-col overflow-hidden transition-all ${expanded ? "inset-4 sm:inset-8" : "bottom-5 right-5 w-[400px] max-w-[calc(100vw-2rem)] h-[600px] max-h-[calc(100vh-2rem)]"}`}>
          {/* Header */}
          <header className="px-4 py-3 border-b border-border flex items-center justify-between gap-2 shrink-0 bg-gradient-to-r from-emerald/10 to-amber/10">
            <div className="flex items-center gap-2.5">
              <div className="size-9 rounded-xl bg-gradient-to-br from-emerald to-emerald-deep flex items-center justify-center shrink-0">
                <Brain className="size-4 text-black" />
              </div>
              <div className="leading-tight">
                <div className="font-medium text-sm flex items-center gap-1.5">Sage <span className="size-1.5 rounded-full bg-emerald pulse-dot" /></div>
                <div className="text-[10px] text-muted truncate">Knows: {user.name.split(" ")[0]} · {dept?.name ?? user.field}</div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setVoiceOn((v) => !v)} title="Read replies aloud" className={`size-8 rounded-lg flex items-center justify-center transition ${voiceOn ? "text-emerald bg-emerald/15" : "text-muted hover:text-foreground hover:bg-surface-2"}`}>
                {voiceOn ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
              </button>
              <button onClick={() => setExpanded((e) => !e)} title={expanded ? "Shrink" : "Expand"} className="size-8 rounded-lg text-muted hover:text-foreground hover:bg-surface-2 flex items-center justify-center transition">
                {expanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
              </button>
              <button onClick={togglePanel} title="Close" className="size-8 rounded-lg text-muted hover:text-foreground hover:bg-surface-2 flex items-center justify-center transition">
                <X className="size-4" />
              </button>
            </div>
          </header>

          {/* Context strip */}
          <div className="px-4 py-2 border-b border-border bg-surface-2/40 flex items-center gap-2 text-[10px] uppercase tracking-widest shrink-0">
            <span className="text-muted">Now:</span>
            <span className="text-emerald truncate">{ctx.label}</span>
            <span className="ml-auto text-muted">Lv {lvl} · 🔥{streak}d{pulse ? ` · ⚡${pulse.momentum}` : ""}</span>
          </div>

          {/* Conversation */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
            {msgs.length === 0 && (
              <div className="space-y-3">
                <div className="text-sm">
                  <p className="text-foreground/90">
                    Akwaaba, <span className="text-emerald font-medium">{user.name.split(" ")[0]}</span>. I&apos;m on this page with you.
                  </p>
                  {proactive && <p className="mt-2 text-muted text-xs italic">💡 {proactive}</p>}
                </div>
                <div className="space-y-1">
                  <div className="text-[10px] uppercase tracking-widest text-muted">Try saying</div>
                  {graphStarter && (
                    <button
                      onClick={() => { logUxEvent("companion_starter_clicked", { source: "graph" }); send(graphStarter); }}
                      className="block w-full text-left text-xs px-3 py-2 rounded-lg border border-emerald/40 bg-emerald/5 hover:bg-emerald/10 transition"
                      title="Suggested from a pattern in your connection graph"
                    >
                      <span className="text-[10px] uppercase tracking-widest text-emerald mr-1.5">From your graph</span>
                      {graphStarter}
                    </button>
                  )}
                  {ctx.suggestions.map((s) => (
                    <button key={s} onClick={() => { logUxEvent("companion_starter_clicked", { source: "page" }); send(s); }} className="block w-full text-left text-xs px-3 py-2 rounded-lg border border-border hover:border-emerald/40 hover:bg-surface-2 transition">
                      {s}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-1.5 pt-2">
                  {ctx.quickActions.map((a) => (
                    <button key={a.label} onClick={() => a.href ? router.push(a.href) : a.action?.()} className="flex flex-col items-center gap-1 p-2 rounded-lg border border-border hover:border-emerald/40 transition">
                      <a.icon className="size-4 text-emerald" />
                      <span className="text-[10px] text-muted">{a.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "flex items-start gap-2"}>
                {m.role === "assistant" && (<div className="size-7 rounded-lg bg-gradient-to-br from-emerald to-emerald-deep flex items-center justify-center shrink-0"><Brain className="size-3.5 text-black" /></div>)}
                <div className={m.role === "user" ? "max-w-[80%] bg-emerald/15 border border-emerald/30 rounded-2xl rounded-tr-sm px-3 py-2 text-sm" : "flex-1 min-w-0 bg-surface-2/50 border border-border rounded-2xl rounded-tl-sm px-3 py-2"}>
                  {m.role === "user" ? m.content : (<Markdown src={m.content} />)}
                  {m.role === "assistant" && busy && i === msgs.length - 1 && (
                    <div className="mt-1 flex gap-1">
                      <span className="size-1 rounded-full bg-emerald animate-pulse" />
                      <span className="size-1 rounded-full bg-emerald animate-pulse" style={{ animationDelay: "0.15s" }} />
                      <span className="size-1 rounded-full bg-emerald animate-pulse" style={{ animationDelay: "0.3s" }} />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Input */}
          <form
            onSubmit={(e) => { e.preventDefault(); send(); }}
            className="border-t border-border p-3 shrink-0"
          >
            <div className="glass rounded-xl flex items-end gap-1 p-1.5 pl-3 bg-surface-2/50">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder={busy ? "Sage is thinking…" : listening ? "Listening…" : "Ask anything · ↑↓ for history"}
                rows={1}
                disabled={busy}
                className="flex-1 bg-transparent resize-none outline-none py-1.5 placeholder:text-muted text-foreground text-sm max-h-32"
              />
              {supported && (
                <button
                  type="button"
                  onClick={listening ? stop : start}
                  className={`size-8 rounded-lg flex items-center justify-center transition ${listening ? "bg-rust text-white animate-pulse" : "text-muted hover:text-foreground hover:bg-surface"}`}
                  title="Voice input"
                >
                  {listening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
                </button>
              )}
              <button
                type="submit"
                disabled={busy || !input.trim()}
                className="size-8 rounded-lg bg-emerald text-black hover:bg-amber disabled:opacity-30 transition flex items-center justify-center"
              >
                <Send className="size-3.5" />
              </button>
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[10px] text-muted px-1">
              <span>⌘J to toggle · ⌘K for command palette</span>
              {voiceOn && <span className="text-emerald">🔊 Reading aloud</span>}
            </div>
          </form>
        </div>
      )}
    </>
  );
}

function pageContext(pathname: string): { label: string; suggestions: string[]; quickActions: { icon: typeof Sparkles; label: string; href?: string; action?: () => void }[] } {
  if (pathname.startsWith("/studio/venture/")) {
    return {
      label: "Venture room",
      suggestions: ["What's the riskiest assumption I haven't tested?", "Critique my lean canvas", "Help me write a customer-discovery script"],
      quickActions: [{ icon: Target, label: "OKRs", href: "/studio/okrs" }, { icon: Lightbulb, label: "Brainstorm", href: "/studio/brainstorm" }, { icon: Bot, label: "Agents", href: "/studio/agents" }],
    };
  }
  if (pathname.startsWith("/studio/learn")) {
    return {
      label: "Learning",
      suggestions: ["Explain this concept using my home context", "Quiz me on what I just read", "What should I learn next given my field?"],
      quickActions: [{ icon: BookMarked, label: "Review", href: "/studio/srs" }, { icon: GraduationCap, label: "My Path", href: "/studio/path" }, { icon: Compass, label: "All tracks", href: "/studio/learn" }],
    };
  }
  if (pathname.startsWith("/studio/lab")) {
    return {
      label: "Practice lab",
      suggestions: ["Walk me through a circuit experiment", "Help debug my Python", "Give me an applied physics challenge"],
      quickActions: [{ icon: Bot, label: "Agents", href: "/studio/agents" }, { icon: BookMarked, label: "Review", href: "/studio/srs" }, { icon: Compass, label: "Lessons", href: "/studio/learn" }],
    };
  }
  if (pathname.startsWith("/studio/brainstorm")) {
    return {
      label: "Sketch Studio",
      suggestions: ["Suggest the next 5 stickies", "Cluster what I have so far", "What's the unspoken assumption on this board?"],
      quickActions: [{ icon: Rocket, label: "Ventures", href: "/studio/venture" }, { icon: Lightbulb, label: "Notebook", href: "/studio/notebook" }, { icon: Globe2, label: "Atlas", href: "/studio/atlas" }],
    };
  }
  if (pathname.startsWith("/studio/atlas")) {
    return {
      label: "Continent map",
      suggestions: ["Which 3 problems best match my field?", "Show me ventures near my city", "Find a mentor in my country"],
      quickActions: [{ icon: GraduationCap, label: "My Path", href: "/studio/path" }, { icon: Rocket, label: "Ventures", href: "/studio/venture" }, { icon: Globe2, label: "Problems", href: "/studio/problems" }],
    };
  }
  if (pathname.startsWith("/studio/problems")) {
    return {
      label: "Problem Hub",
      suggestions: ["Which problem fits my field best?", "Scope this problem to a 14-day wedge", "Who's already working on this?"],
      quickActions: [{ icon: GraduationCap, label: "My Path", href: "/studio/path" }, { icon: Rocket, label: "Start venture", href: "/studio/venture" }, { icon: Lightbulb, label: "Brainstorm", href: "/studio/brainstorm" }],
    };
  }
  if (pathname === "/studio" || pathname === "/studio/me") {
    return {
      label: "Home / Me",
      suggestions: ["What should I do right now?", "Plan my day", "What's the one thing I'm avoiding?"],
      quickActions: [{ icon: BookMarked, label: "Review", href: "/studio/srs" }, { icon: Target, label: "OKRs", href: "/studio/okrs" }, { icon: Rocket, label: "Ventures", href: "/studio/venture" }],
    };
  }
  return {
    label: pathname.replace("/studio/", "") || "studio",
    suggestions: ["What should I focus on today?", "Where am I weakest right now?", "Suggest my next move"],
    quickActions: [{ icon: BookMarked, label: "Review", href: "/studio/srs" }, { icon: Rocket, label: "Ventures", href: "/studio/venture" }, { icon: Compass, label: "Learn", href: "/studio/learn" }],
  };
}

function makeProactive({ user, due, ventures, dept, goals, brief, pathname }: {
  user: { name: string; field: string } | null;
  due: { id: string }[];
  ventures: { name: string; interviews: { id: string }[]; metrics: { interviewsTarget: number; mrr: number } }[];
  dept?: { name: string; suggestedVentureSeed: string } | undefined;
  goals: { id: string; status: string; text: string }[];
  brief?: { morning: string } | undefined;
  pathname: string;
}): string | null {
  if (!user) return null;
  const v = ventures[0];
  const activeGoals = goals.filter((g) => g.status === "active");
  if (pathname === "/studio" && due.length >= 5) return `You have ${due.length} flashcards due — 8 minutes to clear them and protect your streak.`;
  if (v && v.interviews.length < 3) return `Your venture "${v.name}" has only ${v.interviews.length} interviews. Let's draft a discovery script.`;
  if (v && v.interviews.length >= 5 && v.metrics.mrr === 0) return `${v.name} has solid discovery (${v.interviews.length} interviews) — time to pitch. Want me to generate the deck?`;
  if (activeGoals.length === 0) return `You don't have any active goals yet. Want me to draft 3 from what I know about you?`;
  if (dept && pathname === "/studio") return `Your discipline (${dept.name}) has a recommended first venture: ${dept.suggestedVentureSeed.slice(0, 80)}…`;
  if (brief?.morning) return brief.morning.slice(0, 140);
  return null;
}
