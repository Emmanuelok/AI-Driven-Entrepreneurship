"use client";

import { use, useEffect, useState } from "react";
import { notFound } from "next/navigation";
import { useStore } from "@/store";
import { PROBLEMS } from "@/lib/problems";
import { Card, Button, Badge } from "@/components/ui";
import { Sparkles, FileText, Download, ArrowLeft, ArrowRight, Brain } from "lucide-react";

type Slide = { title: string; body: string };

export default function PitchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { ventures, updateVenture, unlockBadge } = useStore();
  const [generating, setGenerating] = useState(false);
  const [slideIdx, setSlideIdx] = useState(0);
  const [deck, setDeck] = useState<Slide[] | null>(null);

  const found = ventures.find((x) => x.id === id);

  useEffect(() => {
    if (found?.pitchDeck?.slides) setDeck(found.pitchDeck.slides);
  }, [found?.id]);

  if (!found) { notFound(); return null; }
  const v = found;

  async function generate() {
    setGenerating(true);
    try {
      const problem = v.problemId ? PROBLEMS.find((p) => p.id === v.problemId) : undefined;
      const res = await fetch("/api/generate/pitch-deck", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ventureName: v.name,
          tagline: v.tagline,
          problem: problem?.title ?? v.canvas.Problem ?? "an unsolved problem",
          solution: v.canvas.Solution ?? v.canvas["Value prop"] ?? "our solution",
          market: v.canvas.Customer ?? "the market",
          team: v.team.map((t) => `${t.name} (${t.role})`).join(", "),
        }),
      });
      const data = await res.json();
      setDeck(data.slides);
      updateVenture(v.id, { pitchDeck: { id: "v1", title: `${v.name} pitch deck`, slides: data.slides } });
      unlockBadge("pitch-deck");
      setSlideIdx(0);
    } finally {
      setGenerating(false);
    }
  }

  function downloadJson() {
    if (!deck) return;
    const blob = new Blob([JSON.stringify({ name: v.name, slides: deck }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${v.name}-pitch-deck.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="max-w-5xl mx-auto px-5 sm:px-8 py-10">
      <div className="flex items-end justify-between flex-wrap gap-3 mb-6">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-amber mb-1 flex items-center gap-1.5">
            <FileText className="size-3.5" /> Phase 4 — Pitch
          </p>
          <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold">12-slide investor deck</h2>
          <p className="text-sm text-muted mt-1">AI-drafted from your venture's data. Edit, rehearse, then have Tariq drill you.</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={generate} disabled={generating}>
            <Sparkles className="size-4" /> {generating ? "Drafting…" : deck ? "Regenerate" : "Generate deck"}
          </Button>
          {deck && <Button variant="secondary" onClick={downloadJson}><Download className="size-4" /> Export JSON</Button>}
          <a href="/studio/coaches/tariq" className="inline-flex items-center gap-2 bg-amber text-black font-medium px-4 py-2 rounded-full text-sm hover:bg-emerald transition">
            <Brain className="size-4" /> Drill with Tariq
          </a>
        </div>
      </div>

      {!deck ? (
        <Card className="p-12 text-center">
          <Sparkles className="size-10 text-amber mx-auto mb-4" />
          <h3 className="font-[family-name:var(--font-display)] text-xl font-semibold">Generate your pitch deck</h3>
          <p className="text-muted mt-2 max-w-md mx-auto">We'll combine your canvas, interviews, and team into a 12-slide investor-grade narrative.</p>
        </Card>
      ) : (
        <>
          <Card className="p-10 sm:p-16 min-h-[420px] flex flex-col">
            <Badge color="emerald" className="self-start mb-6">Slide {slideIdx + 1} of {deck.length}</Badge>
            <h3 className="font-[family-name:var(--font-display)] text-3xl sm:text-5xl font-semibold leading-tight">{deck[slideIdx].title}</h3>
            <p className="mt-6 text-lg text-foreground/90 leading-relaxed">{deck[slideIdx].body}</p>
          </Card>
          <div className="mt-4 flex items-center justify-between">
            <Button variant="ghost" disabled={slideIdx === 0} onClick={() => setSlideIdx(slideIdx - 1)}><ArrowLeft className="size-4" /> Previous</Button>
            <div className="flex gap-1 overflow-x-auto">
              {deck.map((_, i) => (
                <button key={i} onClick={() => setSlideIdx(i)} className={`h-1.5 w-6 rounded-full transition ${i === slideIdx ? "bg-emerald" : "bg-border hover:bg-muted"}`} />
              ))}
            </div>
            <Button variant="ghost" disabled={slideIdx === deck.length - 1} onClick={() => setSlideIdx(slideIdx + 1)}>Next <ArrowRight className="size-4" /></Button>
          </div>

          <Card className="mt-6 p-6">
            <h3 className="font-medium mb-3">Full deck outline</h3>
            <ol className="space-y-2">
              {deck.map((s, i) => (
                <li key={i} onClick={() => setSlideIdx(i)} className={`px-3 py-2 rounded-lg cursor-pointer text-sm flex items-start gap-3 hover:bg-surface-2 transition ${i === slideIdx ? "bg-emerald/10" : ""}`}>
                  <span className="font-mono text-xs text-muted w-6">{String(i + 1).padStart(2, "0")}</span>
                  <span className="flex-1"><strong>{s.title}</strong></span>
                </li>
              ))}
            </ol>
          </Card>
        </>
      )}
    </div>
  );
}
