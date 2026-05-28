"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { useStore } from "@/store";
import { PROBLEMS } from "@/lib/problems";
import { Card, Button, Badge, Textarea, Input } from "@/components/ui";
import { Sparkles, FileText, Download, ArrowLeft, ArrowRight, Brain, Save, Maximize2, Edit3, Eye } from "lucide-react";

type Slide = { title: string; body: string; notes?: string };

// Sequoia-standard 12-slide investor narrative. We seed this so even
// founders who haven't generated yet have a runnable skeleton.
const SEQUOIA: Slide[] = [
  { title: "Company purpose", body: "Define the company in one declarative sentence.", notes: "Read your line out loud. If it has a buzzword, rewrite it." },
  { title: "Problem", body: "Describe the pain. Today's status quo and why it's broken.", notes: "Anchor with a real story, not a stat." },
  { title: "Solution", body: "Show — don't tell. The product, the demo, the 'aha' moment.", notes: "If you can show a 30s product clip here, do." },
  { title: "Why now?", body: "What changed in the world that makes this possible / urgent now?", notes: "Tech, regulation, behavior, climate. Pick one." },
  { title: "Market size", body: "TAM, SAM, SOM. Top-down credibility, bottom-up honesty.", notes: "Bottom-up = customers × price × frequency. Defend it." },
  { title: "Competition", body: "Who else? Why you win. Address the 'why hasn't X done this?' question.", notes: "Don't dismiss competitors — explain your wedge." },
  { title: "Product", body: "How it actually works. Key flows, what's built, what's planned.", notes: "Screenshots > paragraphs." },
  { title: "Business model", body: "How you make money. Unit economics. Path to $100M revenue.", notes: "ARPU × customers = revenue. Show the math." },
  { title: "Team", body: "Why this team can win this market — unique insight, domain proximity, prior wins.", notes: "Investors invest in founders. Lead with you." },
  { title: "Traction", body: "Concrete proof: revenue, customers, retention, LOIs, pilots.", notes: "Real numbers > 'great feedback'. Even small numbers, real." },
  { title: "Financials", body: "12-month plan. Burn, runway, what the next round buys.", notes: "Match this to your ask. Don't double-count revenue." },
  { title: "The ask", body: "How much. At what cap. To do what specific things in 18 months.", notes: "Be specific. 'Raise $750k post-money $5M to reach $50k MRR by Q4.'" },
];

export default function PitchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { ventures, updateVenture, unlockBadge } = useStore();
  const [generating, setGenerating] = useState(false);
  const [slideIdx, setSlideIdx] = useState(0);
  const [deck, setDeck] = useState<Slide[]>(SEQUOIA);
  const [mode, setMode] = useState<"present" | "edit">("present");
  const [presentation, setPresentation] = useState(false);

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
      if (Array.isArray(data.slides)) {
        setDeck(data.slides);
        updateVenture(v.id, { pitchDeck: { id: "v1", title: `${v.name} pitch deck`, slides: data.slides } });
        unlockBadge("pitch-deck");
        setSlideIdx(0);
      }
    } finally {
      setGenerating(false);
    }
  }

  function saveDeck() {
    updateVenture(v.id, { pitchDeck: { id: v.pitchDeck?.id ?? "v1", title: `${v.name} pitch deck`, slides: deck } });
  }

  function updateSlide(idx: number, patch: Partial<Slide>) {
    setDeck(deck.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }

  function downloadJson() {
    const blob = new Blob([JSON.stringify({ name: v.name, slides: deck }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${v.name}-pitch-deck.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadHtml() {
    const html = `<!doctype html><html><head><meta charset="utf-8"/><title>${v.name} — Pitch</title><style>
      body{margin:0;background:#0a0f0d;color:#e7efe9;font-family:-apple-system,sans-serif;}
      .slide{min-height:100vh;display:flex;flex-direction:column;justify-content:center;padding:8vw;border-bottom:1px solid #1f2c28;page-break-after:always;}
      h1{font-size:64px;font-weight:600;line-height:1.1;margin:0;}
      p{font-size:24px;line-height:1.5;margin-top:32px;color:#cfe0d8;max-width:900px;}
      .num{font-size:14px;letter-spacing:0.2em;text-transform:uppercase;color:#2cc295;margin-bottom:24px;}
      .notes{margin-top:48px;padding-top:24px;border-top:1px dashed #1f2c28;color:#8aa39a;font-size:14px;font-style:italic;max-width:700px;}
      @media print { .slide { min-height: 0; } }
    </style></head><body>${deck.map((s, i) => `
      <section class="slide">
        <div class="num">${String(i + 1).padStart(2, "0")} / ${deck.length}</div>
        <h1>${escapeHtml(s.title)}</h1>
        <p>${escapeHtml(s.body).replace(/\n/g, "<br/>")}</p>
        ${s.notes ? `<div class="notes">📝 ${escapeHtml(s.notes)}</div>` : ""}
      </section>`).join("")}</body></html>`;
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${v.name}-pitch.html`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (presentation) {
    return (
      <div className="fixed inset-0 z-50 bg-[#0a0f0d] text-foreground">
        <div className="h-full flex flex-col">
          <div className="absolute top-4 right-4 z-10 flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setPresentation(false)}>Exit</Button>
          </div>
          <div className="flex-1 flex flex-col justify-center p-[8vw]">
            <div className="text-[10px] uppercase tracking-[0.3em] text-emerald mb-6">{String(slideIdx + 1).padStart(2, "0")} / {deck.length}</div>
            <h1 className="font-[family-name:var(--font-display)] text-5xl sm:text-7xl font-semibold leading-tight">{deck[slideIdx].title}</h1>
            <p className="mt-8 text-xl sm:text-2xl leading-relaxed text-foreground/90 max-w-4xl whitespace-pre-wrap">{deck[slideIdx].body}</p>
          </div>
          <div className="p-6 flex items-center justify-between border-t border-border">
            <button onClick={() => setSlideIdx(Math.max(0, slideIdx - 1))} disabled={slideIdx === 0} className="text-muted hover:text-foreground disabled:opacity-30 flex items-center gap-2"><ArrowLeft className="size-4" /> Previous</button>
            <span className="text-xs text-muted">←/→ keys to navigate · Esc to exit</span>
            <button onClick={() => setSlideIdx(Math.min(deck.length - 1, slideIdx + 1))} disabled={slideIdx === deck.length - 1} className="text-muted hover:text-foreground disabled:opacity-30 flex items-center gap-2">Next <ArrowRight className="size-4" /></button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-5 sm:px-8 py-10">
      <div className="flex items-end justify-between flex-wrap gap-3 mb-6">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-amber mb-1 flex items-center gap-1.5">
            <FileText className="size-3.5" /> Phase 4 — Pitch
          </p>
          <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold">{deck.length}-slide investor deck</h2>
          <p className="text-sm text-muted mt-1">Sequoia narrative. Editable. Export to JSON, HTML (print-to-PDF works), or present full-screen.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex bg-surface-2 rounded-full p-1 text-xs">
            <button onClick={() => setMode("present")} className={`px-3 py-1.5 rounded-full transition flex items-center gap-1.5 ${mode === "present" ? "bg-emerald text-black" : "text-muted hover:text-foreground"}`}><Eye className="size-3" /> View</button>
            <button onClick={() => setMode("edit")} className={`px-3 py-1.5 rounded-full transition flex items-center gap-1.5 ${mode === "edit" ? "bg-emerald text-black" : "text-muted hover:text-foreground"}`}><Edit3 className="size-3" /> Edit</button>
          </div>
          <Button onClick={generate} disabled={generating}>
            <Sparkles className="size-4" /> {generating ? "Drafting…" : v.pitchDeck ? "Regenerate" : "AI draft"}
          </Button>
          <Button variant="secondary" onClick={() => setPresentation(true)}><Maximize2 className="size-4" /> Present</Button>
          <Button variant="secondary" onClick={downloadHtml}><Download className="size-4" /> Export</Button>
        </div>
      </div>

      {/* Slide view */}
      <Card className="p-8 sm:p-12 min-h-[420px] flex flex-col">
        <div className="flex items-center justify-between mb-6">
          <Badge color="emerald">Slide {slideIdx + 1} of {deck.length}</Badge>
          {mode === "edit" && <Button size="sm" onClick={saveDeck}><Save className="size-3" /> Save</Button>}
        </div>
        {mode === "present" ? (
          <>
            <h3 className="font-[family-name:var(--font-display)] text-3xl sm:text-5xl font-semibold leading-tight">{deck[slideIdx].title}</h3>
            <p className="mt-6 text-lg text-foreground/90 leading-relaxed whitespace-pre-wrap">{deck[slideIdx].body}</p>
            {deck[slideIdx].notes && (
              <div className="mt-auto pt-6 border-t border-dashed border-border text-xs text-muted italic">
                <span className="text-amber not-italic font-medium">Speaker note:</span> {deck[slideIdx].notes}
              </div>
            )}
          </>
        ) : (
          <div className="space-y-4 flex-1">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted mb-1">Slide title</div>
              <Input value={deck[slideIdx].title} onChange={(e) => updateSlide(slideIdx, { title: e.target.value })} className="text-2xl font-[family-name:var(--font-display)] font-semibold" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted mb-1">Body</div>
              <Textarea value={deck[slideIdx].body} onChange={(e) => updateSlide(slideIdx, { body: e.target.value })} rows={8} />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted mb-1">Speaker note (not shown when presenting full-screen)</div>
              <Textarea value={deck[slideIdx].notes ?? ""} onChange={(e) => updateSlide(slideIdx, { notes: e.target.value })} rows={2} />
            </div>
          </div>
        )}
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

      <div className="mt-6 grid lg:grid-cols-[1fr_auto] gap-4">
        <Card className="p-6">
          <h3 className="font-medium mb-3">Full deck outline</h3>
          <ol className="space-y-1.5">
            {deck.map((s, i) => (
              <li key={i} onClick={() => setSlideIdx(i)} className={`px-3 py-2 rounded-lg cursor-pointer text-sm flex items-start gap-3 hover:bg-surface-2 transition ${i === slideIdx ? "bg-emerald/10" : ""}`}>
                <span className="font-mono text-xs text-muted w-6">{String(i + 1).padStart(2, "0")}</span>
                <span className="flex-1 truncate"><strong>{s.title}</strong></span>
              </li>
            ))}
          </ol>
        </Card>
        <div className="space-y-2">
          <Link href="/studio/coaches/tariq" className="inline-flex w-full items-center justify-center gap-2 bg-amber text-black font-medium px-4 py-3 rounded-full text-sm hover:bg-emerald transition">
            <Brain className="size-4" /> Drill with Tariq
          </Link>
          <Button variant="secondary" onClick={downloadJson} className="w-full"><Download className="size-4" /> Export JSON</Button>
        </div>
      </div>
    </div>
  );
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[c] ?? c));
}
