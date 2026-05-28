"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSketch } from "@/store/sketch";
import { Card, Button, Input, Textarea, Dialog, EmptyState, Badge } from "@/components/ui";
import { SimilarButton } from "@/components/similar-button";
import { Lightbulb, Plus, ArrowRight, Pencil, Sparkles, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function BrainstormListPage() {
  const router = useRouter();
  const { boards, createBoard, deleteBoard } = useSketch();
  const [creating, setCreating] = useState(false);

  return (
    <div className="max-w-6xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <div className="flex items-end justify-between flex-wrap gap-3 mb-8">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-emerald mb-2 flex items-center gap-1.5">
            <Lightbulb className="size-3.5" /> Sketch Studio
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight">
            Bring anything in your mind <span className="text-emerald">to the canvas.</span>
          </h1>
          <p className="mt-3 text-muted max-w-2xl">
            Infinite whiteboard with pen, shapes, arrows, sticky notes, frames, text. Real drawing. Real connectors. AI co-pilot. No limits.
          </p>
        </div>
        <Button onClick={() => setCreating(true)} size="lg"><Plus className="size-4" /> New canvas</Button>
      </div>

      <Card className="p-5 mb-6 bg-gradient-to-br from-emerald/10 to-amber/10">
        <div className="flex items-start gap-3">
          <Sparkles className="size-5 text-amber shrink-0 mt-0.5" />
          <div className="text-sm">
            <div className="font-medium mb-1">11 tools. Infinite canvas. AI on tap.</div>
            <p className="text-muted leading-relaxed">
              <strong>Pen, eraser, rectangle, ellipse, line, arrow, text, sticky notes, frames, select, pan.</strong> Keyboard shortcuts on every tool (V/H/P/E/R/O/L/A/T/N/F). Undo/redo. SVG export. Pinch / ⌘+scroll to zoom. Drag to pan. Drag any element to move. Double-click stickies/text/frames to edit. Hit <span className="text-emerald">✦ AI suggest</span> any time and Akili drops 8 fresh stickies onto your board grounded in your prompt.
            </p>
          </div>
        </div>
      </Card>

      {boards.length === 0 ? (
        <EmptyState
          icon={Lightbulb}
          title="No canvases yet"
          body="Start with a prompt — 'why is post-harvest loss in Northern Ghana so high?' — and either sketch yourself in or let Akili populate your first 8 stickies."
          action={<Button onClick={() => setCreating(true)}><Plus className="size-4" /> Create canvas</Button>}
        />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {boards.map((b) => (
            <Card key={b.id} className="p-5 hover:border-emerald/40 transition group relative">
              <Link href={`/studio/brainstorm/${b.id}`} className="block">
                <div className="flex items-start justify-between mb-3">
                  <Lightbulb className="size-5 text-amber" />
                  <Badge color="muted">{b.elements.length} elements</Badge>
                </div>
                <h3 className="font-[family-name:var(--font-display)] text-xl font-semibold leading-tight">{b.title}</h3>
                <p className="text-sm text-muted mt-1 line-clamp-2">{b.prompt}</p>
                <div className="mt-4 flex items-center justify-between text-xs">
                  <span className="text-muted">Updated {formatDistanceToNow(b.updatedAt, { addSuffix: true })}</span>
                  <span className="text-emerald flex items-center gap-1">Open <ArrowRight className="size-3.5 group-hover:translate-x-0.5 transition" /></span>
                </div>
              </Link>
              <div className="absolute top-3 right-3 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition">
                <SimilarButton seedTitle={b.title} seedBody={b.prompt || b.title} kind="brainstorm" excludeRefId={b.id} />
                <button
                  onClick={() => { if (confirm(`Delete "${b.title}"?`)) deleteBoard(b.id); }}
                  className="text-muted hover:text-rust size-7 flex items-center justify-center rounded"
                  aria-label={`Delete ${b.title}`}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={creating} onClose={() => setCreating(false)} title="New canvas">
        <NewBrainstormForm
          onCreate={(title, prompt) => {
            const id = createBoard(title, prompt);
            setCreating(false);
            router.push(`/studio/brainstorm/${id}`);
          }}
        />
      </Dialog>
    </div>
  );
}

function NewBrainstormForm({ onCreate }: { onCreate: (title: string, prompt: string) => void }) {
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const SUGGESTIONS = [
    "Why is post-harvest tomato loss so high in Northern Ghana?",
    "How might a CHW in rural Uganda diagnose pneumonia with $0 of new equipment?",
    "What wedge could bring 1M new African creators onto a fair-payment platform?",
    "Map the supply chain of cassava from farm to plate in Lagos",
    "Sketch a system that gets cocoa farmers paid in cash, in 60 seconds, every Friday",
  ];
  return (
    <div className="space-y-4">
      <Input placeholder="Canvas title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <Textarea placeholder="What's the question / system / story driving this sketch?" value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} />
      <div>
        <div className="text-xs uppercase tracking-widest text-muted mb-2">Or pick a question to start</div>
        <div className="space-y-1.5">
          {SUGGESTIONS.map((s) => (
            <button key={s} onClick={() => { setPrompt(s); setTitle(s.slice(0, 50)); }} className="block text-left w-full text-sm text-muted hover:text-foreground hover:bg-surface-2 rounded-lg p-2 transition">
              {s}
            </button>
          ))}
        </div>
      </div>
      <div className="flex justify-end">
        <Button onClick={() => title.trim() && prompt.trim() && onCreate(title, prompt)} disabled={!title.trim() || !prompt.trim()}>
          Create canvas <ArrowRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
