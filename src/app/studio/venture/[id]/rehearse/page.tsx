"use client";

import { use, useEffect, useRef, useState } from "react";
import { notFound } from "next/navigation";
import { useStore } from "@/store";
import { Card, Button, Badge } from "@/components/ui";
import { Mic, Video, Square, Play, Sparkles, Clock, Volume2, RotateCcw, Brain, AlertCircle } from "lucide-react";

// Demo-day rehearsal — webcam + browser STT + Claude critique.
// Records on-device only. No upload of video. Transcript goes to Claude.

type Dimension = { id: string; label: string; score: number; note: string };
type Critique = {
  overall: number;
  oneLine: string;
  dimensions: Dimension[];
  fillerCounts: { word: string; count: number }[];
  pacing: { wordsPerMin: number; verdict: string };
  rewrites: { original: string; better: string }[];
  topFix: string;
};

const FILLERS = ["um", "uh", "like", "you know", "kind of", "sort of", "basically", "actually", "literally", "right", "so"];

export default function RehearsePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { ventures } = useStore();
  const found = ventures.find((x) => x.id === id);

  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const [critique, setCritique] = useState<Critique | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<"prep" | "record" | "review">("prep");
  const [targetMinutes, setTargetMinutes] = useState(3);
  const [videoOn, setVideoOn] = useState(true);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recogRef = useRef<unknown>(null);
  const timerRef = useRef<number | null>(null);
  const startTsRef = useRef<number>(0);
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (timerRef.current) window.clearInterval(timerRef.current);
      if (playbackUrl) URL.revokeObjectURL(playbackUrl);
    };
  }, [playbackUrl]);

  if (!found) { notFound(); return null; }
  const v = found;
  const slides = v.pitchDeck?.slides ?? [];

  async function startRecording() {
    setError(null);
    setTranscript("");
    setInterim("");
    setElapsed(0);
    setCritique(null);
    setPlaybackUrl(null);
    chunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: videoOn, audio: true });
      streamRef.current = stream;
      if (videoRef.current && videoOn) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }

      // Media recorder for replay
      try {
        const rec = new MediaRecorder(stream);
        rec.ondataavailable = (ev) => { if (ev.data.size > 0) chunksRef.current.push(ev.data); };
        rec.onstop = () => {
          const blob = new Blob(chunksRef.current, { type: rec.mimeType || "video/webm" });
          setPlaybackUrl(URL.createObjectURL(blob));
        };
        rec.start(1000);
        recRef.current = rec;
      } catch {
        // No MediaRecorder support — silent fallback (Safari sometimes).
      }

      // Web Speech transcript
      type SR = new () => {
        continuous: boolean;
        interimResults: boolean;
        lang: string;
        onresult: (e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void;
        onerror: (e: { error: string }) => void;
        onend: () => void;
        start: () => void;
        stop: () => void;
      };
      const Win = window as unknown as { SpeechRecognition?: SR; webkitSpeechRecognition?: SR };
      const SRCtor = Win.SpeechRecognition || Win.webkitSpeechRecognition;
      if (SRCtor) {
        const r = new SRCtor();
        r.continuous = true;
        r.interimResults = true;
        r.lang = "en-US";
        r.onresult = (e) => {
          let finalAdd = "";
          let interimText = "";
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const part = e.results[i][0].transcript;
            if (e.results[i].isFinal) finalAdd += part + " "; else interimText += part;
          }
          if (finalAdd) setTranscript((t) => t + finalAdd);
          setInterim(interimText);
        };
        r.onerror = (e) => { if (e.error !== "no-speech") setError(`Speech recognition: ${e.error}`); };
        r.onend = () => {
          // auto-restart if still recording
          if (recRef.current?.state === "recording") {
            try { r.start(); } catch { /* noop */ }
          }
        };
        r.start();
        recogRef.current = r;
      } else {
        setError("Your browser doesn't support live transcription. Chrome/Edge work best.");
      }

      startTsRef.current = Date.now();
      timerRef.current = window.setInterval(() => {
        setElapsed(Math.floor((Date.now() - startTsRef.current) / 1000));
      }, 500);
      setRecording(true);
      setStage("record");
    } catch (e) {
      setError(`Couldn't access mic/camera: ${(e as Error).message}`);
    }
  }

  function stopRecording() {
    setRecording(false);
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
    try { recRef.current?.stop(); } catch { /* noop */ }
    const r = recogRef.current as { stop?: () => void } | null;
    try { r?.stop?.(); } catch { /* noop */ }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setStage("review");
  }

  async function getCritique() {
    if (!transcript.trim()) {
      setError("No transcript captured. Try again with the mic enabled.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/venture/rehearse-critique", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ventureName: v.name,
          tagline: v.tagline,
          transcript,
          slides: slides.map((s) => ({ title: s.title, body: s.body })),
          targetSeconds: targetMinutes * 60,
          actualSeconds: elapsed,
        }),
      });
      const data = await res.json();
      if (data.overall != null) setCritique(data);
      else setError(data.error || "Couldn't grade your pitch. Try again.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setStage("prep");
    setTranscript("");
    setInterim("");
    setCritique(null);
    setElapsed(0);
    if (playbackUrl) { URL.revokeObjectURL(playbackUrl); setPlaybackUrl(null); }
  }

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const wordCount = transcript.trim().split(/\s+/).filter(Boolean).length;
  const localFillerCounts = FILLERS.map((w) => ({
    word: w,
    count: (transcript.toLowerCase().match(new RegExp(`\\b${w.replace(" ", "\\s+")}\\b`, "g")) || []).length,
  })).filter((x) => x.count > 0).sort((a, b) => b.count - a.count);

  return (
    <div className="max-w-6xl mx-auto px-5 sm:px-8 py-10 space-y-6">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-amber mb-1 flex items-center gap-1.5">
            <Mic className="size-3.5" /> Pitch rehearsal
          </p>
          <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold">Practice the pitch that decides everything.</h2>
          <p className="text-sm text-muted mt-1 max-w-2xl">
            Hit record, deliver your pitch, get an honest critique from Akili — pace, filler words, narrative arc,
            conviction, the rewrites that will make every line sharper. Everything stays in your browser unless you ship it.
          </p>
        </div>
      </header>

      {!slides.length && (
        <Card className="p-5 border border-amber/30 bg-amber/5">
          <div className="flex items-start gap-3">
            <AlertCircle className="size-5 text-amber shrink-0 mt-0.5" />
            <div className="text-sm">
              No pitch deck yet — head to the <a href={`/studio/venture/${id}/pitch`} className="text-emerald hover:underline">Pitch tab</a> first and generate one. Rehearsal works without a deck, but the critique is sharper when Akili can see your slides.
            </div>
          </div>
        </Card>
      )}

      {/* Prep stage */}
      {stage === "prep" && (
        <Card className="p-6">
          <div className="grid lg:grid-cols-2 gap-6">
            <div>
              <h3 className="font-medium mb-3">Settings</h3>
              <div className="space-y-3 text-sm">
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-muted mb-1">Target length</div>
                  <div className="flex items-center gap-2">
                    {[1, 2, 3, 5, 10].map((m) => (
                      <button key={m} onClick={() => setTargetMinutes(m)} className={`px-3 py-1.5 rounded-full text-xs transition border ${targetMinutes === m ? "bg-emerald text-black border-emerald" : "border-border text-muted hover:border-emerald/40"}`}>
                        {m} min
                      </button>
                    ))}
                  </div>
                  <div className="text-[10px] text-muted mt-1.5">1-min = elevator. 3-min = demo day. 10-min = full investor meeting.</div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={videoOn} onChange={(e) => setVideoOn(e.target.checked)} className="accent-emerald" />
                  <span>Record video too (audio always)</span>
                </label>
              </div>
            </div>

            <div>
              <h3 className="font-medium mb-3">Pre-flight</h3>
              <ul className="space-y-2 text-sm">
                {[
                  "Find a quiet room. No background music.",
                  "Stand up. Posture changes voice.",
                  "Open your deck on a second screen if you have one.",
                  "Time yourself — the clock is your friend.",
                  "Talk to one specific investor in your head. Not 'investors'.",
                ].map((tip) => (
                  <li key={tip} className="flex gap-2 text-foreground/90"><span className="text-emerald">·</span>{tip}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-6">
            <Button onClick={startRecording} size="lg" className="bg-rust hover:bg-rust/90">
              <Mic className="size-4" /> Start rehearsal · target {targetMinutes}:00
            </Button>
          </div>
          {error && <p className="mt-3 text-sm text-rust">{error}</p>}
        </Card>
      )}

      {/* Recording stage */}
      {stage === "record" && (
        <div className="grid lg:grid-cols-[1fr_360px] gap-4">
          <Card className="p-0 overflow-hidden">
            <div className="relative bg-black aspect-video">
              {videoOn ? (
                <video ref={videoRef} muted playsInline className="w-full h-full object-cover" />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Volume2 className="size-16 text-emerald animate-pulse" />
                </div>
              )}
              <div className="absolute top-3 left-3 flex items-center gap-2">
                <span className="bg-rust text-white text-xs px-2 py-1 rounded-full font-medium flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-white animate-pulse" /> REC {fmt(elapsed)}
                </span>
                <span className="bg-black/60 text-white text-xs px-2 py-1 rounded-full font-mono">
                  target {fmt(targetMinutes * 60)}
                </span>
              </div>
            </div>
            <div className="p-4 border-t border-border flex items-center justify-between gap-3">
              <div className="text-xs text-muted">
                {wordCount} words · {wordCount > 0 && elapsed > 0 ? `${Math.round((wordCount / elapsed) * 60)} wpm` : "—"}
              </div>
              <Button onClick={stopRecording} variant="secondary"><Square className="size-3.5" /> Stop</Button>
            </div>
          </Card>

          <Card className="p-4 flex flex-col max-h-[70vh]">
            <h3 className="text-xs uppercase tracking-widest text-emerald mb-3 flex items-center gap-1.5"><Mic className="size-3" /> Live transcript</h3>
            <div className="flex-1 overflow-y-auto text-sm leading-relaxed">
              {transcript ? (
                <span className="text-foreground/95 whitespace-pre-wrap">{transcript}</span>
              ) : (
                <span className="text-muted italic">Start speaking — your words appear here…</span>
              )}
              {interim && <span className="text-muted italic"> {interim}</span>}
            </div>
          </Card>
        </div>
      )}

      {/* Review stage */}
      {stage === "review" && (
        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
              <div>
                <h3 className="font-medium">Your rehearsal · {fmt(elapsed)}</h3>
                <p className="text-xs text-muted">{wordCount} words · {wordCount > 0 ? Math.round((wordCount / Math.max(1, elapsed)) * 60) : 0} wpm · target {fmt(targetMinutes * 60)}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={reset}><RotateCcw className="size-3.5" /> Reset</Button>
                <Button variant="secondary" onClick={startRecording}><Mic className="size-3.5" /> Re-record</Button>
                <Button onClick={getCritique} disabled={busy || !transcript.trim()}>
                  <Sparkles className={`size-4 ${busy ? "animate-pulse" : ""}`} /> {busy ? "Akili is critiquing…" : critique ? "Re-critique" : "Get critique"}
                </Button>
              </div>
            </div>

            <div className="grid lg:grid-cols-2 gap-4">
              {playbackUrl && (
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-muted mb-1.5 flex items-center gap-1"><Video className="size-3" /> Playback</div>
                  <video src={playbackUrl} controls className="w-full rounded-xl bg-black aspect-video" />
                </div>
              )}
              <div>
                <div className="text-[10px] uppercase tracking-widest text-muted mb-1.5">Transcript</div>
                <pre className="text-sm whitespace-pre-wrap leading-relaxed bg-surface-2/40 border border-border rounded-xl p-3 max-h-[260px] overflow-y-auto">{transcript || <span className="text-muted italic">No transcript captured</span>}</pre>
              </div>
            </div>
          </Card>

          {/* Local filler-word readout — instant, before Claude weighs in */}
          {localFillerCounts.length > 0 && (
            <Card className="p-5">
              <h3 className="text-xs uppercase tracking-widest text-rust mb-3 flex items-center gap-1.5">
                <Clock className="size-3" /> Filler-word audit (browser-counted)
              </h3>
              <div className="flex flex-wrap gap-2">
                {localFillerCounts.map((f) => (
                  <span key={f.word} className="text-xs px-3 py-1.5 rounded-full bg-rust/10 border border-rust/30 text-rust">
                    &ldquo;{f.word}&rdquo; · {f.count}×
                  </span>
                ))}
              </div>
            </Card>
          )}

          {/* Claude critique */}
          {critique && (
            <Card className="p-6">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <Brain className="size-5 text-amber" />
                  <h3 className="font-medium">Akili&apos;s critique</h3>
                </div>
                <div className={`text-4xl font-[family-name:var(--font-display)] font-semibold ${critique.overall >= 7 ? "text-emerald" : critique.overall >= 5 ? "text-amber" : "text-rust"}`}>
                  {critique.overall.toFixed(1)}<span className="text-muted text-base font-normal">/10</span>
                </div>
              </div>

              <p className="text-base text-foreground/95 mb-5 italic">&ldquo;{critique.oneLine}&rdquo;</p>

              <div className="grid sm:grid-cols-2 gap-3 mb-5">
                {critique.dimensions.map((d) => (
                  <div key={d.id} className="rounded-xl border border-border bg-surface-2/40 p-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="text-sm font-medium">{d.label}</div>
                      <Badge color={d.score >= 7 ? "emerald" : d.score >= 5 ? "amber" : "rust"}>{d.score.toFixed(1)}</Badge>
                    </div>
                    <p className="text-xs text-muted leading-relaxed">{d.note}</p>
                  </div>
                ))}
              </div>

              <div className="grid sm:grid-cols-2 gap-3 mb-5">
                <div className="rounded-xl border border-border bg-surface-2/40 p-3">
                  <div className="text-[10px] uppercase tracking-widest text-emerald mb-1">Pacing</div>
                  <div className="text-2xl font-[family-name:var(--font-display)] font-semibold">{critique.pacing.wordsPerMin} <span className="text-muted text-sm">wpm</span></div>
                  <p className="text-xs text-muted mt-1">{critique.pacing.verdict}</p>
                </div>
                <div className="rounded-xl border border-rust/30 bg-rust/5 p-3">
                  <div className="text-[10px] uppercase tracking-widest text-rust mb-1">Top fix right now</div>
                  <p className="text-sm text-foreground/95 leading-relaxed">{critique.topFix}</p>
                </div>
              </div>

              {critique.rewrites.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-amber mb-2">Sharper rewrites</div>
                  <div className="space-y-2">
                    {critique.rewrites.map((r, i) => (
                      <div key={i} className="rounded-xl border border-border p-3">
                        <div className="text-xs text-muted line-through mb-1">{r.original}</div>
                        <div className="text-sm text-emerald">{r.better}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          )}

          {error && <Card className="p-4 border border-rust/30 bg-rust/5 text-sm text-rust">{error}</Card>}
        </div>
      )}
    </div>
  );
}
