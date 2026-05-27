"use client";

import { useEffect, useRef, useState } from "react";
import { useSketch, Tool, Element } from "@/store/sketch";
import {
  MousePointer2, Hand, Pencil, Eraser, Square, Circle, Minus, ArrowUpRight,
  Type, StickyNote, Frame, Undo2, Redo2, Download, Trash2, ZoomIn, ZoomOut,
  Wand2, Save,
} from "lucide-react";

const COLORS = ["#e7efe9", "#2cc295", "#f4a949", "#d96444", "#6c8cff", "#9b6cff", "#ec4899", "#0a0f0d"];
const STICKY_COLORS = ["#fde68a", "#bbf7d0", "#fca5a5", "#a5b4fc", "#f9a8d4", "#e7efe9"];

export function SketchCanvas({ boardId }: { boardId: string }) {
  const board = useSketch((s) => s.boards.find((b) => b.id === boardId))!;
  const { addElement, updateElement, removeElement, setElements, pushHistory, undo, redo, setView, updateBoardMeta } = useSketch();

  const [tool, setTool] = useState<Tool>("select");
  const [color, setColor] = useState("#2cc295");
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [stickyColor, setStickyColor] = useState("#fde68a");
  const [textSize, setTextSize] = useState(18);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawing, setDrawing] = useState<Element | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [editingTextValue, setEditingTextValue] = useState("");
  const [aiBusy, setAiBusy] = useState(false);

  const svgRef = useRef<SVGSVGElement>(null);
  const panStart = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const dragStart = useRef<{ id: string; ox: number; oy: number; el: Element } | null>(null);

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA") return;
      if (e.key === "v") setTool("select");
      else if (e.key === "h") setTool("pan");
      else if (e.key === "p") setTool("pen");
      else if (e.key === "e") setTool("eraser");
      else if (e.key === "r") setTool("rect");
      else if (e.key === "o") setTool("ellipse");
      else if (e.key === "l") setTool("line");
      else if (e.key === "a") setTool("arrow");
      else if (e.key === "t") setTool("text");
      else if (e.key === "n") setTool("sticky");
      else if (e.key === "f") setTool("frame");
      else if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(boardId); }
      else if ((e.metaKey || e.ctrlKey) && (e.key === "z" && e.shiftKey || e.key === "y")) { e.preventDefault(); redo(boardId); }
      else if ((e.key === "Backspace" || e.key === "Delete") && selectedId) {
        e.preventDefault();
        pushHistory(boardId);
        removeElement(boardId, selectedId);
        setSelectedId(null);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [boardId, selectedId, undo, redo, removeElement, pushHistory]);

  // Convert client coords to canvas coords accounting for pan + zoom
  function clientToCanvas(clientX: number, clientY: number) {
    const svg = svgRef.current; if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * svg.viewBox.baseVal.width;
    const y = ((clientY - rect.top) / rect.height) * svg.viewBox.baseVal.height;
    return {
      x: (x - board.viewX) / board.zoom,
      y: (y - board.viewY) / board.zoom,
    };
  }

  function onPointerDown(e: React.PointerEvent) {
    if (editingTextId) return;
    (e.currentTarget as Element & SVGSVGElement).setPointerCapture(e.pointerId);
    const { x, y } = clientToCanvas(e.clientX, e.clientY);

    if (tool === "pan" || (tool === "select" && e.button === 1)) {
      panStart.current = { x: e.clientX, y: e.clientY, vx: board.viewX, vy: board.viewY };
      return;
    }

    if (tool === "select") {
      setSelectedId(null);
      return;
    }

    pushHistory(boardId);

    if (tool === "pen") {
      setDrawing({ id: "tmp", kind: "pen", points: [[x, y]], color, width: strokeWidth });
    } else if (tool === "rect") {
      setDrawing({ id: "tmp", kind: "rect", x, y, w: 0, h: 0, color, fillOpacity: 0.1, strokeWidth });
    } else if (tool === "ellipse") {
      setDrawing({ id: "tmp", kind: "ellipse", x, y, w: 0, h: 0, color, fillOpacity: 0.1, strokeWidth });
    } else if (tool === "line") {
      setDrawing({ id: "tmp", kind: "line", x1: x, y1: y, x2: x, y2: y, color, width: strokeWidth });
    } else if (tool === "arrow") {
      setDrawing({ id: "tmp", kind: "arrow", x1: x, y1: y, x2: x, y2: y, color, width: strokeWidth });
    } else if (tool === "frame") {
      setDrawing({ id: "tmp", kind: "frame", x, y, w: 0, h: 0, label: "Frame", color });
    } else if (tool === "text") {
      const id = addElement(boardId, { kind: "text", x, y, text: "Double-click to edit", color, size: textSize });
      setEditingTextId(id);
      setEditingTextValue("Double-click to edit");
    } else if (tool === "sticky") {
      const id = addElement(boardId, { kind: "sticky", x, y, w: 180, h: 140, text: "New note", color: stickyColor });
      setEditingTextId(id);
      setEditingTextValue("New note");
    } else if (tool === "eraser") {
      // Erase on hit
      eraseAt(x, y);
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    const { x, y } = clientToCanvas(e.clientX, e.clientY);

    if (panStart.current) {
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      setView(boardId, panStart.current.vx + dx, panStart.current.vy + dy, board.zoom);
      return;
    }

    if (dragStart.current && selectedId) {
      const dx = x - dragStart.current.ox;
      const dy = y - dragStart.current.oy;
      const orig = dragStart.current.el;
      if ("x" in orig) {
        updateElement(boardId, selectedId, { x: (orig.x ?? 0) + dx, y: (orig.y ?? 0) + dy } as Partial<Element>);
      } else if ("x1" in orig) {
        updateElement(boardId, selectedId, { x1: orig.x1 + dx, y1: orig.y1 + dy, x2: orig.x2 + dx, y2: orig.y2 + dy } as Partial<Element>);
      }
      return;
    }

    if (drawing) {
      if (drawing.kind === "pen") {
        setDrawing({ ...drawing, points: [...drawing.points, [x, y]] });
      } else if (drawing.kind === "rect" || drawing.kind === "ellipse" || drawing.kind === "frame") {
        setDrawing({ ...drawing, w: x - drawing.x, h: y - drawing.y });
      } else if (drawing.kind === "line" || drawing.kind === "arrow") {
        setDrawing({ ...drawing, x2: x, y2: y });
      }
    }

    if (tool === "eraser" && (e.buttons & 1)) {
      eraseAt(x, y);
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    (e.currentTarget as Element & SVGSVGElement).releasePointerCapture(e.pointerId);

    if (panStart.current) { panStart.current = null; return; }
    if (dragStart.current) { dragStart.current = null; return; }

    if (drawing) {
      const d = drawing;
      const tooSmall = ((d.kind === "rect" || d.kind === "ellipse" || d.kind === "frame") && Math.abs(d.w) < 4) ||
        ((d.kind === "line" || d.kind === "arrow") && Math.abs(d.x2 - d.x1) < 4 && Math.abs(d.y2 - d.y1) < 4);
      if (!tooSmall) {
        if (d.kind === "rect" || d.kind === "ellipse" || d.kind === "frame") {
          let nx = d.x, ny = d.y, nw = d.w, nh = d.h;
          if (nw < 0) { nx = nx + nw; nw = Math.abs(nw); }
          if (nh < 0) { ny = ny + nh; nh = Math.abs(nh); }
          if (d.kind === "frame") {
            addElement(boardId, { kind: "frame", x: nx, y: ny, w: nw, h: nh, label: d.label, color: d.color });
          } else if (d.kind === "rect") {
            addElement(boardId, { kind: "rect", x: nx, y: ny, w: nw, h: nh, color: d.color, fillOpacity: d.fillOpacity, strokeWidth: d.strokeWidth });
          } else {
            addElement(boardId, { kind: "ellipse", x: nx, y: ny, w: nw, h: nh, color: d.color, fillOpacity: d.fillOpacity, strokeWidth: d.strokeWidth });
          }
        } else if (d.kind === "pen") {
          addElement(boardId, { kind: "pen", points: d.points, color: d.color, width: d.width });
        } else if (d.kind === "line") {
          addElement(boardId, { kind: "line", x1: d.x1, y1: d.y1, x2: d.x2, y2: d.y2, color: d.color, width: d.width });
        } else if (d.kind === "arrow") {
          addElement(boardId, { kind: "arrow", x1: d.x1, y1: d.y1, x2: d.x2, y2: d.y2, color: d.color, width: d.width });
        }
      }
      setDrawing(null);
    }
  }

  function eraseAt(x: number, y: number) {
    const candidates = board.elements.filter((e) => hitTest(e, x, y, 8));
    if (candidates.length === 0) return;
    const next = board.elements.filter((e) => !candidates.includes(e));
    setElements(boardId, next);
  }

  function hitTest(el: Element, x: number, y: number, padding = 0): boolean {
    if (el.kind === "pen") {
      return el.points.some((p) => Math.hypot(p[0] - x, p[1] - y) <= el.width + padding);
    }
    if (el.kind === "rect" || el.kind === "ellipse" || el.kind === "sticky" || el.kind === "frame") {
      return x >= el.x - padding && x <= el.x + el.w + padding && y >= el.y - padding && y <= el.y + el.h + padding;
    }
    if (el.kind === "line" || el.kind === "arrow") {
      const A = { x: el.x1, y: el.y1 }, B = { x: el.x2, y: el.y2 };
      const lenSq = (B.x - A.x) ** 2 + (B.y - A.y) ** 2 || 1;
      const t = Math.max(0, Math.min(1, ((x - A.x) * (B.x - A.x) + (y - A.y) * (B.y - A.y)) / lenSq));
      const px = A.x + t * (B.x - A.x), py = A.y + t * (B.y - A.y);
      return Math.hypot(px - x, py - y) <= el.width + padding;
    }
    if (el.kind === "text") {
      return x >= el.x - padding && x <= el.x + el.text.length * el.size * 0.6 + padding && y >= el.y - el.size && y <= el.y + padding;
    }
    return false;
  }

  function startDragElement(e: React.PointerEvent, el: Element) {
    if (tool !== "select") return;
    e.stopPropagation();
    setSelectedId(el.id);
    const { x, y } = clientToCanvas(e.clientX, e.clientY);
    dragStart.current = { id: el.id, ox: x, oy: y, el };
    pushHistory(boardId);
  }

  function onWheel(e: React.WheelEvent) {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const newZoom = Math.max(0.2, Math.min(4, board.zoom * (e.deltaY > 0 ? 0.9 : 1.1)));
    setView(boardId, board.viewX, board.viewY, newZoom);
  }

  async function aiSuggest() {
    setAiBusy(true);
    try {
      const text = board.elements
        .map((e) => e.kind === "sticky" ? e.text : e.kind === "text" ? e.text : null)
        .filter(Boolean)
        .join("\n");
      const res = await fetch("/api/generate/sketch-suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: board.prompt, content: text }),
      });
      const data = await res.json() as { stickies: { text: string; color: string; category: string }[] };
      pushHistory(boardId);
      data.stickies.forEach((s, i) => {
        const col = STICKY_COLORS[i % STICKY_COLORS.length];
        addElement(boardId, {
          kind: "sticky",
          x: 200 + (i % 4) * 220 - board.viewX / board.zoom,
          y: 200 + Math.floor(i / 4) * 170 - board.viewY / board.zoom,
          w: 200, h: 140, text: s.text, color: col,
        });
      });
    } finally { setAiBusy(false); }
  }

  function exportSvg() {
    const svg = svgRef.current; if (!svg) return;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `${board.title}-${Date.now()}.svg`; a.click();
    URL.revokeObjectURL(url);
  }

  const allElements: Element[] = drawing ? [...board.elements, drawing] : board.elements;

  const TOOLS: { id: Tool; icon: typeof Pencil; label: string; key: string }[] = [
    { id: "select", icon: MousePointer2, label: "Select", key: "V" },
    { id: "pan", icon: Hand, label: "Pan", key: "H" },
    { id: "pen", icon: Pencil, label: "Pen", key: "P" },
    { id: "eraser", icon: Eraser, label: "Eraser", key: "E" },
    { id: "rect", icon: Square, label: "Rectangle", key: "R" },
    { id: "ellipse", icon: Circle, label: "Ellipse", key: "O" },
    { id: "line", icon: Minus, label: "Line", key: "L" },
    { id: "arrow", icon: ArrowUpRight, label: "Arrow", key: "A" },
    { id: "text", icon: Type, label: "Text", key: "T" },
    { id: "sticky", icon: StickyNote, label: "Sticky", key: "N" },
    { id: "frame", icon: Frame, label: "Frame", key: "F" },
  ];

  return (
    <div className="relative h-full flex flex-col">
      {/* Top toolbar */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-0.5 glass rounded-2xl p-1.5 shadow-2xl border border-emerald/20">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTool(t.id)}
            title={`${t.label} (${t.key})`}
            className={`size-9 rounded-xl flex items-center justify-center transition relative group ${tool === t.id ? "bg-emerald text-black" : "text-muted hover:text-foreground hover:bg-surface-2"}`}
          >
            <t.icon className="size-4" />
            <span className="absolute -bottom-7 px-1.5 py-0.5 text-[10px] bg-surface-2 rounded opacity-0 group-hover:opacity-100 transition pointer-events-none whitespace-nowrap">{t.label} ({t.key})</span>
          </button>
        ))}
        <div className="w-px h-6 bg-border mx-1" />
        <button onClick={() => undo(boardId)} title="Undo (⌘Z)" className="size-9 rounded-xl flex items-center justify-center text-muted hover:text-foreground hover:bg-surface-2 transition"><Undo2 className="size-4" /></button>
        <button onClick={() => redo(boardId)} title="Redo (⌘⇧Z)" className="size-9 rounded-xl flex items-center justify-center text-muted hover:text-foreground hover:bg-surface-2 transition"><Redo2 className="size-4" /></button>
      </div>

      {/* Color/width side panel */}
      <div className="absolute top-3 left-3 z-30 glass rounded-2xl p-2 flex flex-col gap-2 shadow-xl border border-border">
        <div className="text-[9px] uppercase tracking-widest text-muted px-1">Color</div>
        <div className="grid grid-cols-4 gap-1">
          {(tool === "sticky" ? STICKY_COLORS : COLORS).map((c) => {
            const selected = (tool === "sticky" ? stickyColor : color) === c;
            return (
              <button
                key={c}
                onClick={() => tool === "sticky" ? setStickyColor(c) : setColor(c)}
                className={`size-7 rounded-lg border transition ${selected ? "border-foreground scale-110" : "border-border hover:border-muted"}`}
                style={{ background: c }}
              />
            );
          })}
        </div>
        {(tool === "pen" || tool === "rect" || tool === "ellipse" || tool === "line" || tool === "arrow") && (
          <>
            <div className="text-[9px] uppercase tracking-widest text-muted px-1 mt-1">Width {strokeWidth}</div>
            <input type="range" min={1} max={20} value={strokeWidth} onChange={(e) => setStrokeWidth(parseInt(e.target.value))} className="accent-emerald" />
          </>
        )}
        {tool === "text" && (
          <>
            <div className="text-[9px] uppercase tracking-widest text-muted px-1 mt-1">Size {textSize}</div>
            <input type="range" min={10} max={64} value={textSize} onChange={(e) => setTextSize(parseInt(e.target.value))} className="accent-emerald" />
          </>
        )}
      </div>

      {/* Right side actions */}
      <div className="absolute top-3 right-3 z-30 flex flex-col gap-2">
        <button onClick={aiSuggest} disabled={aiBusy} title="AI suggest stickies" className="glass rounded-xl size-10 flex items-center justify-center hover:border-emerald/40 transition border border-border">
          <Wand2 className={`size-4 ${aiBusy ? "text-amber animate-pulse" : "text-emerald"}`} />
        </button>
        <button onClick={exportSvg} title="Export SVG" className="glass rounded-xl size-10 flex items-center justify-center hover:border-emerald/40 transition border border-border">
          <Download className="size-4 text-muted" />
        </button>
        <button onClick={() => { if (confirm("Clear the entire board?")) { pushHistory(boardId); setElements(boardId, []); } }} title="Clear board" className="glass rounded-xl size-10 flex items-center justify-center hover:border-rust/40 transition border border-border">
          <Trash2 className="size-4 text-muted" />
        </button>
      </div>

      {/* Zoom indicator */}
      <div className="absolute bottom-3 right-3 z-30 glass rounded-xl px-3 py-1.5 flex items-center gap-2 text-xs border border-border">
        <button onClick={() => setView(boardId, board.viewX, board.viewY, Math.max(0.2, board.zoom * 0.9))} className="text-muted hover:text-foreground"><ZoomOut className="size-3.5" /></button>
        <span className="font-mono">{Math.round(board.zoom * 100)}%</span>
        <button onClick={() => setView(boardId, board.viewX, board.viewY, Math.min(4, board.zoom * 1.1))} className="text-muted hover:text-foreground"><ZoomIn className="size-3.5" /></button>
        <button onClick={() => setView(boardId, 0, 0, 1)} className="text-muted hover:text-foreground ml-1">Reset</button>
      </div>

      {/* Canvas */}
      <svg
        ref={svgRef}
        viewBox="0 0 2000 1400"
        className="flex-1 w-full grid-paper select-none"
        style={{ cursor: tool === "pan" ? "grab" : tool === "select" ? "default" : tool === "eraser" ? "cell" : "crosshair", background: "#06100d" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onWheel={onWheel}
      >
        <g transform={`translate(${board.viewX}, ${board.viewY}) scale(${board.zoom})`}>
          {allElements.map((el) => (
            <ElementRender
              key={el.id}
              el={el}
              selected={selectedId === el.id}
              onDragStart={(e) => startDragElement(e, el)}
              onDoubleClick={() => {
                if (el.kind === "sticky" || el.kind === "text" || el.kind === "frame") {
                  setEditingTextId(el.id);
                  setEditingTextValue(el.kind === "frame" ? el.label : el.text);
                }
              }}
            />
          ))}
        </g>
      </svg>

      {/* Inline text editor */}
      {editingTextId && (() => {
        const el = board.elements.find((e) => e.id === editingTextId);
        if (!el) return null;
        const svg = svgRef.current;
        if (!svg) return null;
        const rect = svg.getBoundingClientRect();
        const vw = svg.viewBox.baseVal.width, vh = svg.viewBox.baseVal.height;
        let canvasX = 0, canvasY = 0, w = 200, h = 60, size = 16;
        if (el.kind === "sticky" || el.kind === "frame") {
          canvasX = el.x; canvasY = el.y; w = el.w; h = el.h;
        } else if (el.kind === "text") {
          canvasX = el.x; canvasY = el.y - el.size; w = 300; h = el.size + 20; size = el.size;
        }
        const screenX = ((canvasX * board.zoom + board.viewX) / vw) * rect.width + rect.left;
        const screenY = ((canvasY * board.zoom + board.viewY) / vh) * rect.height + rect.top;
        const screenW = (w * board.zoom / vw) * rect.width;
        const screenH = (h * board.zoom / vh) * rect.height;

        return (
          <div className="fixed z-40" style={{ left: screenX, top: screenY, width: screenW, height: screenH }}>
            <textarea
              autoFocus
              value={editingTextValue}
              onChange={(e) => setEditingTextValue(e.target.value)}
              onBlur={() => {
                if (el.kind === "sticky" || el.kind === "text") updateElement(boardId, editingTextId, { text: editingTextValue } as Partial<Element>);
                else if (el.kind === "frame") updateElement(boardId, editingTextId, { label: editingTextValue } as Partial<Element>);
                setEditingTextId(null);
              }}
              onKeyDown={(e) => { if (e.key === "Escape") setEditingTextId(null); }}
              className="w-full h-full bg-transparent outline-none resize-none p-3 text-foreground"
              style={{
                fontSize: el.kind === "text" ? size * board.zoom : 13 * board.zoom,
                color: el.kind === "sticky" ? "#0a0f0d" : (el as { color?: string }).color ?? "#e7efe9",
                background: el.kind === "sticky" ? (el.color + "f0") : "rgba(20, 29, 26, 0.9)",
                border: "2px solid #2cc295",
                borderRadius: 6,
              }}
            />
          </div>
        );
      })()}

      {/* Status bar */}
      <div className="absolute bottom-3 left-3 z-30 flex items-center gap-2 text-xs">
        <div className="glass rounded-xl px-3 py-1.5 border border-border text-muted">{board.elements.length} elements</div>
        {selectedId && (
          <button onClick={() => { pushHistory(boardId); removeElement(boardId, selectedId); setSelectedId(null); }} className="glass rounded-xl px-3 py-1.5 border border-rust/30 text-rust hover:bg-rust/10 transition">
            Delete selected
          </button>
        )}
      </div>
    </div>
  );
}

function ElementRender({ el, selected, onDragStart, onDoubleClick }: { el: Element; selected: boolean; onDragStart: (e: React.PointerEvent) => void; onDoubleClick: () => void }) {
  const selectStyle = selected ? { filter: "drop-shadow(0 0 6px rgba(44,194,149,0.7))" } : {};
  const common = { onPointerDown: onDragStart, onDoubleClick, style: selectStyle, cursor: "pointer" } as const;

  if (el.kind === "pen") {
    const d = el.points.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
    return <path d={d} stroke={el.color} strokeWidth={el.width} fill="none" strokeLinecap="round" strokeLinejoin="round" {...common} />;
  }
  if (el.kind === "rect") {
    const w = Math.abs(el.w), h = Math.abs(el.h);
    const x = el.w < 0 ? el.x + el.w : el.x, y = el.h < 0 ? el.y + el.h : el.y;
    return <rect x={x} y={y} width={w} height={h} stroke={el.color} strokeWidth={el.strokeWidth} fill={el.color} fillOpacity={el.fillOpacity} rx={6} {...common} />;
  }
  if (el.kind === "ellipse") {
    const w = Math.abs(el.w), h = Math.abs(el.h);
    const x = el.w < 0 ? el.x + el.w : el.x, y = el.h < 0 ? el.y + el.h : el.y;
    return <ellipse cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} stroke={el.color} strokeWidth={el.strokeWidth} fill={el.color} fillOpacity={el.fillOpacity} {...common} />;
  }
  if (el.kind === "line") {
    return <line x1={el.x1} y1={el.y1} x2={el.x2} y2={el.y2} stroke={el.color} strokeWidth={el.width} strokeLinecap="round" {...common} />;
  }
  if (el.kind === "arrow") {
    const dx = el.x2 - el.x1, dy = el.y2 - el.y1;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    const ah = 14 + el.width * 1.5;
    const ax1 = el.x2 - ux * ah - uy * (ah / 2);
    const ay1 = el.y2 - uy * ah + ux * (ah / 2);
    const ax2 = el.x2 - ux * ah + uy * (ah / 2);
    const ay2 = el.y2 - uy * ah - ux * (ah / 2);
    return (
      <g {...common}>
        <line x1={el.x1} y1={el.y1} x2={el.x2 - ux * (ah * 0.5)} y2={el.y2 - uy * (ah * 0.5)} stroke={el.color} strokeWidth={el.width} strokeLinecap="round" />
        <polygon points={`${el.x2},${el.y2} ${ax1},${ay1} ${ax2},${ay2}`} fill={el.color} />
      </g>
    );
  }
  if (el.kind === "text") {
    return <text x={el.x} y={el.y} fill={el.color} fontSize={el.size} fontFamily="ui-sans-serif" {...common}>{el.text}</text>;
  }
  if (el.kind === "sticky") {
    return (
      <g {...common}>
        <rect x={el.x} y={el.y} width={el.w} height={el.h} fill={el.color} rx={6} stroke="rgba(0,0,0,0.15)" strokeWidth={1} />
        <foreignObject x={el.x} y={el.y} width={el.w} height={el.h} style={{ pointerEvents: "none" }}>
          <div style={{ padding: 10, fontSize: 13, color: "#0a0f0d", whiteSpace: "pre-wrap", lineHeight: 1.4, fontFamily: "ui-sans-serif" }}>{el.text}</div>
        </foreignObject>
      </g>
    );
  }
  if (el.kind === "frame") {
    const w = Math.abs(el.w), h = Math.abs(el.h);
    const x = el.w < 0 ? el.x + el.w : el.x, y = el.h < 0 ? el.y + el.h : el.y;
    return (
      <g {...common}>
        <rect x={x} y={y} width={w} height={h} fill="none" stroke={el.color} strokeWidth={2} strokeDasharray="8 4" rx={8} />
        <text x={x + 8} y={y - 6} fill={el.color} fontSize={14} fontFamily="ui-sans-serif" fontWeight={600}>{el.label}</text>
      </g>
    );
  }
  return null;
}
