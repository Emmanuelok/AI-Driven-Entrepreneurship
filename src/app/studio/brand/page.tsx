"use client";

import { useState } from "react";
import { Card, Button, Input, Textarea, Badge } from "@/components/ui";
import { Markdown } from "@/components/markdown";
import { Paintbrush, Sparkles, Copy, Download, Wand2 } from "lucide-react";

const PALETTES = [
  { name: "Sahel sunrise", colors: ["#0a0f0d", "#f4a949", "#d96444", "#2cc295"] },
  { name: "Forest at dusk", colors: ["#0a1814", "#2cc295", "#6c8cff", "#e7efe9"] },
  { name: "Kente night", colors: ["#0a0a0a", "#d4af37", "#7a1f1f", "#1f4a2a"] },
  { name: "Ocean trade winds", colors: ["#06162a", "#3aa9c7", "#f8efe1", "#a8c63a"] },
  { name: "Lagos midnight", colors: ["#0c0a18", "#7a4cff", "#ff7a4c", "#f1f1f1"] },
  { name: "Maasai bold", colors: ["#0d0d0d", "#c8202e", "#1956a8", "#f1c75a"] },
];

const FONT_PAIRS = [
  { display: "Fraunces", body: "Geist Sans", mood: "Editorial · trustworthy" },
  { display: "Inter Tight", body: "Inter", mood: "Crisp · technical" },
  { display: "Playfair Display", body: "Source Sans 3", mood: "Premium · considered" },
  { display: "Space Grotesk", body: "JetBrains Mono", mood: "Engineering · raw" },
];

export default function BrandStudioPage() {
  const [concept, setConcept] = useState("");
  const [generating, setGenerating] = useState(false);
  const [output, setOutput] = useState("");
  const [paletteIdx, setPaletteIdx] = useState(0);
  const [fontIdx, setFontIdx] = useState(0);

  async function generate() {
    if (!concept.trim()) return;
    setGenerating(true);
    setOutput("");
    try {
      const res = await fetch("/api/agents/brand-kit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ concept }),
      });
      const reader = res.body?.getReader();
      const dec = new TextDecoder();
      let acc = "";
      if (reader) { while (true) { const { done, value } = await reader.read(); if (done) break; acc += dec.decode(value, { stream: true }); setOutput(acc); } }
    } finally { setGenerating(false); }
  }

  const palette = PALETTES[paletteIdx];
  const fonts = FONT_PAIRS[fontIdx];

  return (
    <div className="max-w-6xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <div className="mb-8">
        <p className="text-xs uppercase tracking-[0.22em] text-emerald mb-2 flex items-center gap-1.5">
          <Paintbrush className="size-3.5" /> Brand Studio
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight">
          Name, palette, voice. <span className="text-emerald">In 30 seconds.</span>
        </h1>
        <p className="mt-3 text-muted max-w-2xl">
          Describe your venture in a paragraph. We surface 3 names, 2 taglines, a palette, font pairing, and brand voice you can ship on Friday.
        </p>
      </div>

      <Card className="p-5 mb-6">
        <div className="text-xs uppercase tracking-widest text-muted mb-1.5">Your venture concept</div>
        <Textarea
          value={concept}
          onChange={(e) => setConcept(e.target.value)}
          placeholder="A pay-per-crate solar microcold storage service for tomato cooperatives in Northern Ghana. We cut post-harvest loss from 35% to under 10%."
          rows={4}
        />
        <Button onClick={generate} disabled={generating || !concept.trim()} className="mt-3" size="lg">
          <Wand2 className="size-4" /> {generating ? "Generating…" : "Generate brand kit"}
        </Button>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-6">
          <h2 className="font-medium mb-4 flex items-center gap-2"><Paintbrush className="size-4 text-amber" /> Palette</h2>
          <div className="grid grid-cols-2 gap-2 mb-4">
            {PALETTES.map((p, i) => (
              <button key={p.name} onClick={() => setPaletteIdx(i)} className={`flex gap-1 p-2 rounded-xl border transition ${paletteIdx === i ? "border-emerald" : "border-border hover:border-muted"}`}>
                <div className="flex-1 text-left">
                  <div className="text-xs font-medium">{p.name}</div>
                </div>
                <div className="flex gap-0.5">
                  {p.colors.map((c) => <span key={c} className="size-4 rounded" style={{ background: c }} />)}
                </div>
              </button>
            ))}
          </div>
          <div className="rounded-2xl p-6 border border-border" style={{ background: palette.colors[0] }}>
            <div className="text-2xl font-semibold" style={{ color: palette.colors[3] }}>Headline</div>
            <div className="text-sm mt-2" style={{ color: palette.colors[2] }}>Subhead with secondary color</div>
            <button className="mt-4 px-4 py-2 rounded-full text-sm font-medium" style={{ background: palette.colors[1], color: palette.colors[0] }}>
              Primary CTA
            </button>
          </div>
          <div className="mt-3 grid grid-cols-4 gap-2 text-center">
            {palette.colors.map((c, i) => (
              <button key={c} onClick={() => { navigator.clipboard.writeText(c); }} className="rounded-lg p-2 border border-border hover:border-emerald transition">
                <div className="size-12 mx-auto rounded-md mb-1" style={{ background: c }} />
                <div className="text-[10px] font-mono">{c}</div>
              </button>
            ))}
          </div>
          <p className="text-xs text-muted mt-3">Click any swatch to copy hex.</p>
        </Card>

        <Card className="p-6">
          <h2 className="font-medium mb-4 flex items-center gap-2"><Sparkles className="size-4 text-amber" /> Typography</h2>
          <div className="grid grid-cols-2 gap-2 mb-4">
            {FONT_PAIRS.map((p, i) => (
              <button key={p.display} onClick={() => setFontIdx(i)} className={`p-3 rounded-xl border text-left transition ${fontIdx === i ? "border-emerald" : "border-border hover:border-muted"}`}>
                <div className="text-sm font-medium">{p.display} + {p.body}</div>
                <div className="text-xs text-muted">{p.mood}</div>
              </button>
            ))}
          </div>
          <div className="rounded-2xl p-6 border border-border bg-surface-2">
            <div style={{ fontFamily: fonts.display, fontWeight: 600 }} className="text-3xl">From classroom to creator.</div>
            <div style={{ fontFamily: fonts.body }} className="mt-3 text-muted leading-relaxed">
              We help African students go from learning to shipping. Real ventures, real customers, real revenue — before graduation.
            </div>
          </div>
        </Card>
      </div>

      {output && (
        <Card className="mt-6 p-6">
          <h2 className="font-medium mb-4 flex items-center gap-2"><Sparkles className="size-4 text-emerald" /> AI-drafted brand kit</h2>
          <Markdown src={output} />
        </Card>
      )}
    </div>
  );
}
