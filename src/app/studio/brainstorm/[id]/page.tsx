"use client";

import { use, useRef, useState } from "react";
import { notFound, useRouter } from "next/navigation";
import { useExt, Sticky } from "@/store/extensions";
import { Button, Badge, Dialog, Textarea } from "@/components/ui";
import { ArrowLeft, Plus, Sparkles, Trash2, Save, Wand2 } from "lucide-react";
import Link from "next/link";

const COLORS: Sticky["color"][] = ["emerald", "amber", "rust", "indigo", "muted"];
const COLOR_HEX: Record<Sticky["color"], { bg: string; border: string; text: string }> = {
  emerald: { bg: "#0d3a2c", border: "#2cc295", text: "#7ee8c1" },
  amber: { bg: "#3a290c", border: "#f4a949", text: "#fdd28e" },
  rust: { bg: "#3a1a14", border: "#d96444", text: "#fca28a" },
  indigo: { bg: "#1a2046", border: "#6c8cff", text: "#aab9ff" },
  muted: { bg: "#1a1f1d", border: "#3a4f48", text: "#8aa39a" },
};

export default function BrainstormCanvasPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { brainstorms, updateBrainstorm, addSticky, updateSticky, removeSticky } = useExt();
  const found = brainstorms.find((b) => b.id === id);
  if (!found) { notFound(); return null; }
  const board = found;

  const [generating, setGenerating] = useState(false);
  const [clusteringResult, setClusteringResult] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const dragState = useRef<{ id: string; offX: number; offY: number } | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  function startDrag(e: React.PointerEvent, s: Sticky) {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    dragState.current = { id: s.id, offX: e.clientX - rect.left - s.x, offY: e.clientY - rect.top - s.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onDrag(e: React.PointerEvent) {
    if (!dragState.current || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width - 180, e.clientX - rect.left - dragState.current.offX));
    const y = Math.max(0, Math.min(rect.height - 100, e.clientY - rect.top - dragState.current.offY));
    updateSticky(board.id, dragState.current.id, { x, y });
  }
  function endDrag(e: React.PointerEvent) {
    dragState.current = null;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
  }

  function add() {
    addSticky(board.id, {
      x: 80 + Math.random() * 320,
      y: 80 + Math.random() * 220,
      w: 180,
      h: 120,
      text: "New idea",
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    });
  }

  async function aiPopulate() {
    setGenerating(true);
    try {
      const res = await fetch("/api/generate/brainstorm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: board.prompt, existing: board.stickies.map((s) => s.text) }),
      });
      const data = await res.json() as { stickies: { text: string; color: Sticky["color"]; category: string }[] };
      data.stickies.forEach((s, i) => {
        addSticky(board.id, {
          x: 60 + (i % 4) * 220,
          y: 60 + Math.floor(i / 4) * 160,
          w: 200,
          h: 120,
          text: s.text,
          color: s.color,
          category: s.category,
        });
      });
    } finally {
      setGenerating(false);
    }
  }

  async function aiCluster() {
    setGenerating(true);
    setClusteringResult(null);
    try {
      const res = await fetch("/api/generate/cluster", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: board.prompt, stickies: board.stickies.map((s) => s.text) }),
      });
      const data = await res.json() as { summary: string };
      setClusteringResult(data.summary);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col">
      <header className="border-b border-border px-5 sm:px-8 py-4 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4 min-w-0">
          <Link href="/studio/brainstorm" className="text-sm text-muted hover:text-foreground inline-flex items-center gap-1.5 shrink-0">
            <ArrowLeft className="size-3.5" /> Canvases
          </Link>
          <div className="min-w-0">
            <h1 className="font-[family-name:var(--font-display)] text-xl font-semibold truncate">{board.title}</h1>
            <p className="text-xs text-muted truncate">{board.prompt}</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Badge color="muted">{board.stickies.length} stickies</Badge>
          <Button variant="secondary" onClick={add}><Plus className="size-4" /> Sticky</Button>
          <Button variant="secondary" onClick={aiPopulate} disabled={generating}>
            <Wand2 className="size-4" /> {generating ? "Thinking…" : "AI populate"}
          </Button>
          <Button onClick={aiCluster} disabled={generating || board.stickies.length < 3}>
            <Sparkles className="size-4" /> Cluster + summarize
          </Button>
        </div>
      </header>

      {clusteringResult && (
        <div className="px-5 sm:px-8 py-4 border-b border-border bg-emerald/5">
          <div className="flex items-start gap-3">
            <Sparkles className="size-5 text-emerald shrink-0 mt-0.5" />
            <div className="text-sm whitespace-pre-wrap">{clusteringResult}</div>
            <button onClick={() => setClusteringResult(null)} className="text-xs text-muted hover:text-foreground shrink-0">Dismiss</button>
          </div>
        </div>
      )}

      <div
        ref={canvasRef}
        className="flex-1 relative overflow-auto grid-paper"
        onPointerMove={onDrag}
        onPointerUp={endDrag}
      >
        {board.stickies.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-center pointer-events-none">
            <div>
              <Lightbulb className="size-12 text-amber mx-auto mb-3 opacity-60" />
              <p className="text-muted">Drag in your thoughts. Or hit <span className="text-emerald">AI populate</span> to seed 10 directions.</p>
            </div>
          </div>
        )}
        {board.stickies.map((s) => {
          const c = COLOR_HEX[s.color];
          return (
            <div
              key={s.id}
              className="absolute rounded-xl p-3 select-none transition-shadow hover:shadow-2xl"
              style={{
                left: s.x,
                top: s.y,
                width: s.w,
                minHeight: s.h,
                background: c.bg,
                border: `1.5px solid ${c.border}`,
                color: c.text,
                touchAction: "none",
                cursor: dragState.current?.id === s.id ? "grabbing" : "grab",
                boxShadow: dragState.current?.id === s.id ? "0 12px 32px rgba(0,0,0,0.5)" : "0 4px 12px rgba(0,0,0,0.3)",
                zIndex: dragState.current?.id === s.id ? 50 : 1,
              }}
              onPointerDown={(e) => startDrag(e, s)}
              onDoubleClick={() => { setEditing(s.id); setEditText(s.text); }}
            >
              {s.category && (
                <div className="text-[9px] uppercase tracking-widest opacity-70 mb-1">{s.category}</div>
              )}
              <div className="text-sm leading-snug whitespace-pre-wrap break-words">{s.text}</div>
              <button
                onClick={(e) => { e.stopPropagation(); removeSticky(board.id, s.id); }}
                onPointerDown={(e) => e.stopPropagation()}
                className="absolute top-1.5 right-1.5 opacity-0 hover:opacity-100 group-hover:opacity-50 text-xs px-1.5"
                style={{ color: c.text }}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>

      <Dialog open={editing !== null} onClose={() => setEditing(null)} title="Edit sticky">
        <div className="space-y-4">
          <Textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={5} />
          <div className="flex justify-between">
            <Button variant="danger" onClick={() => { if (editing) removeSticky(board.id, editing); setEditing(null); }}>
              <Trash2 className="size-4" /> Delete
            </Button>
            <Button onClick={() => { if (editing) updateSticky(board.id, editing, { text: editText }); setEditing(null); }}>
              <Save className="size-4" /> Save
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

function Lightbulb({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.74V18h8v-3.26A7 7 0 0 0 12 2Z" />
    </svg>
  );
}
