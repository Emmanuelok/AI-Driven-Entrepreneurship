"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Play, Loader2, Check, AlertCircle, Trash2, Link2, X, Code as CodeIcon, FileText, Boxes, Beaker } from "lucide-react";
import { useFlow, resolveRefs, topoSort, type Flow, type FlowNode } from "@/store/flow";
import { NODE_META, NODE_KINDS_ORDERED, type NodeKind } from "@/lib/flow-nodes";
import { runNode } from "@/lib/flow-run";
import { PROBLEMS } from "@/lib/problems";
import { useStore } from "@/store";
import { useBuild } from "@/store/build";

// Node-based flow editor. Phase 1: drag-to-position nodes on a fixed
// canvas, click ports to connect, draw bezier edges in SVG. Properties
// panel on the right edits the selected node. Top bar offers Run-all
// + Ship-to-Venture + Ship-to-Build.

const CANVAS_W = 2400;
const CANVAS_H = 1600;
const NODE_W = 280;
const NODE_H_MIN = 140;

// Lightweight peer-presence shape used to render lock indicators on
// individual nodes. Mirrors src/lib/flow-presence.ts without importing
// it (the canvas is environment-agnostic — the page wires presence in).
export type FlowCanvasPeer = {
  userId: string;
  displayName: string;
  color: string;
  selectedNodeId: string | null;
};

// Live peer cursor in canvas-plane coordinates. Supplied by the page
// via useFlowCursors; rendered as an overlay inside the scrolling plane
// so cursors track the same space as nodes.
export type FlowCanvasCursor = {
  userId: string;
  name: string;
  color: string;
  x: number;
  y: number;
};

export function FlowCanvas({ flow, peers = [], onSelectedChange, cursors = [], onCursorMove }: { flow: Flow; peers?: FlowCanvasPeer[]; onSelectedChange?: (id: string | null) => void; cursors?: FlowCanvasCursor[]; onCursorMove?: (x: number, y: number) => void }) {
  const { addNode, removeNode, moveNode, patchNodeConfig, setNodeLabel, setNodeStatus, setNodeOutput, addEdge, removeEdge } = useFlow();
  const router = useRouter();
  const { createVenture } = useStore();
  const { createProject } = useBuild();

  const [selectedId, _setSelectedIdRaw] = useState<string | null>(null);
  // Wrap setSelectedId so the page's presence-track call sees the
  // change. Avoids leaking onSelectedChange callbacks into every
  // setSelectedId call site below.
  const setSelectedId = (id: string | null) => {
    _setSelectedIdRaw(id);
    onSelectedChange?.(id);
  };

  // Peer locks: which other user is editing which node right now.
  // Stored as nodeId → peer so the NodeView can render a coloured chip.
  const peerByNodeId = useMemo(() => {
    const m = new Map<string, FlowCanvasPeer>();
    for (const p of peers) if (p.selectedNodeId) m.set(p.selectedNodeId, p);
    return m;
  }, [peers]);
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [runningAll, setRunningAll] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(true);

  const canvasRef = useRef<HTMLDivElement>(null);
  // The fixed-size plane that nodes are positioned within. Peer cursor
  // coordinates are computed relative to its bounding rect so they map
  // 1:1 to node coordinates and scroll with the content.
  const planeRef = useRef<HTMLDivElement>(null);

  const selected = flow.nodes.find((n) => n.id === selectedId) ?? null;

  // ── Drag-to-move ─────────────────────────────────────────────────
  const dragState = useRef<{ id: string; offX: number; offY: number } | null>(null);
  function onMouseDownNode(e: React.MouseEvent, id: string) {
    if (e.target instanceof HTMLElement && e.target.closest("[data-no-drag]")) return;
    const node = flow.nodes.find((n) => n.id === id);
    if (!node) return;
    dragState.current = { id, offX: e.clientX - node.x, offY: e.clientY - node.y };
    setSelectedId(id);
  }
  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragState.current) return;
      const { id, offX, offY } = dragState.current;
      const x = Math.max(0, Math.min(CANVAS_W - NODE_W, e.clientX - offX));
      const y = Math.max(0, Math.min(CANVAS_H - NODE_H_MIN, e.clientY - offY));
      moveNode(flow.id, id, x, y);
    }
    function onUp() { dragState.current = null; }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [flow.id, moveNode]);

  // ── Add node ─────────────────────────────────────────────────────
  function placeNode(kind: NodeKind) {
    const x = 200 + (flow.nodes.length % 4) * (NODE_W + 80);
    const y = 100 + Math.floor(flow.nodes.length / 4) * 220;
    const id = addNode(flow.id, kind, x, y);
    setSelectedId(id);
  }

  // ── Connect ──────────────────────────────────────────────────────
  function onPortClick(nodeId: string, side: "out" | "in") {
    if (side === "out") {
      setConnectFrom(nodeId);
    } else if (connectFrom && connectFrom !== nodeId) {
      addEdge(flow.id, connectFrom, nodeId);
      setConnectFrom(null);
    }
  }

  // ── Run a single node ────────────────────────────────────────────
  // `overridePrompt` supports the "Play with" mode: the node runs
  // with a one-off prompt without that prompt being persisted in the
  // store. Useful for sketching alternatives before committing them.
  async function run(node: FlowNode, overridePrompt?: string) {
    setNodeStatus(flow.id, node.id, "running");
    try {
      const promptRaw = overridePrompt
        ?? node.config.prompt
        ?? (node.kind === "problem" ? (node.config.problemId ? PROBLEMS.find((p) => p.id === node.config.problemId)?.title ?? "" : "") : "")
        ?? "";
      const resolved = resolveRefs(promptRaw, flow.nodes);
      const out = await runNode(node, resolved);
      setNodeOutput(flow.id, node.id, out);
    } catch (e) {
      setNodeStatus(flow.id, node.id, "error", (e as Error).message);
    }
  }

  async function runAll() {
    setRunningAll(true);
    try {
      const { order, cycle } = topoSort(flow);
      if (cycle) { alert("Cycle detected — break it before running."); return; }
      for (const id of order) {
        const fresh = useFlow.getState().flows.find((f) => f.id === flow.id)?.nodes.find((n) => n.id === id);
        if (!fresh) continue;
        await run(fresh);
      }
    } finally { setRunningAll(false); }
  }

  // ── Ship transfers ───────────────────────────────────────────────
  function shipToVenture() {
    const problemNode = flow.nodes.find((n) => n.kind === "problem");
    const personaNode = flow.nodes.find((n) => n.kind === "persona");
    const wedgeNode = flow.nodes.find((n) => n.kind === "wedge");
    if (!problemNode?.output?.text && !wedgeNode?.output?.text) {
      alert("Run a Problem or Wedge node first — that's the venture's anchor.");
      return;
    }
    const name = flow.name || (problemNode?.output?.text?.slice(0, 40) ?? "New venture");
    const tagline = wedgeNode?.output?.text?.split("\n")[0]?.slice(0, 120) ?? "";
    const id = createVenture({
      name,
      tagline,
      phase: "ideate",
      region: (personaNode?.output?.json as { location?: string } | undefined)?.location ?? "",
      problemId: problemNode?.config.problemId,
      canvas: {
        problem: problemNode?.output?.text ?? "",
        customers: personaNode?.output?.text ?? "",
        valueProp: wedgeNode?.output?.text ?? "",
      },
    });
    router.push(`/studio/venture/${id}`);
  }

  function shipToBuildStudio() {
    const buildNode = flow.nodes.find((n) => n.kind === "build" && n.output?.html);
    if (!buildNode?.output?.html) {
      alert("Run a Build node first — that's what carries the code.");
      return;
    }
    const id = createProject(
      `${flow.name} — ${buildNode.label}`,
      buildNode.config.prompt?.slice(0, 200) ?? "",
      "blank",
      buildNode.output.html,
    );
    router.push(`/studio/build/${id}`);
  }

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      {/* Toolbar */}
      <div className="border-b border-border px-5 py-2.5 flex items-center justify-between gap-3 flex-wrap shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPaletteOpen(!paletteOpen)}
            className="text-xs text-muted hover:text-foreground inline-flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-surface-2 transition"
          >
            <Boxes className="size-3.5" /> {paletteOpen ? "Hide" : "Show"} palette
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={runAll}
            disabled={runningAll || flow.nodes.length === 0}
            className="text-xs px-3 py-1.5 rounded-full border border-emerald/40 bg-emerald/10 text-emerald hover:bg-emerald/15 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5 transition"
          >
            {runningAll ? <><Loader2 className="size-3 animate-spin" /> Running…</> : <><Play className="size-3" /> Run all</>}
          </button>
          <button
            onClick={shipToVenture}
            className="text-xs px-3 py-1.5 rounded-full bg-emerald text-black font-medium hover:bg-amber inline-flex items-center gap-1.5 transition"
          >
            <FileText className="size-3" /> Ship to venture
          </button>
          <button
            onClick={shipToBuildStudio}
            className="text-xs px-3 py-1.5 rounded-full border border-rust/40 bg-rust/10 text-rust hover:bg-rust/15 inline-flex items-center gap-1.5 transition"
          >
            <CodeIcon className="size-3" /> Ship build to Studio
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Palette */}
        {paletteOpen && (
          <aside className="w-52 shrink-0 border-r border-border bg-surface-2/20 overflow-y-auto p-3 space-y-1.5">
            <div className="text-[10px] uppercase tracking-widest text-muted px-1 mb-1">Add a node</div>
            {NODE_KINDS_ORDERED.map((k) => {
              const m = NODE_META[k];
              return (
                <button
                  key={k}
                  onClick={() => placeNode(k)}
                  className="block w-full text-left p-2.5 rounded-lg border border-border hover:border-emerald/40 hover:bg-surface transition"
                >
                  <div className="text-xs font-medium">{m.label}</div>
                  <div className="text-[10px] text-muted leading-snug">{m.short}</div>
                </button>
              );
            })}
            <p className="text-[10px] text-muted px-1 pt-3 leading-relaxed">
              Tip: reference an upstream node in any prompt with <code className="text-emerald">@id</code> or <code className="text-emerald">@label</code>. Edges form automatically.
            </p>
          </aside>
        )}

        {/* Canvas */}
        <div ref={canvasRef} className="flex-1 relative overflow-auto bg-[#06100d]">
          <div
            ref={planeRef}
            className="relative"
            style={{ width: CANVAS_W, height: CANVAS_H, backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px)", backgroundSize: "24px 24px" }}
            onMouseMove={(e) => {
              if (!onCursorMove) return;
              const r = planeRef.current?.getBoundingClientRect();
              if (!r) return;
              onCursorMove(e.clientX - r.left, e.clientY - r.top);
            }}
          >
            {/* Edges */}
            <svg width={CANVAS_W} height={CANVAS_H} className="absolute inset-0 pointer-events-none">
              {flow.edges.map((e) => {
                const from = flow.nodes.find((n) => n.id === e.fromNodeId);
                const to = flow.nodes.find((n) => n.id === e.toNodeId);
                if (!from || !to) return null;
                const x1 = from.x + NODE_W;
                const y1 = from.y + 60;
                const x2 = to.x;
                const y2 = to.y + 60;
                const dx = Math.max(60, (x2 - x1) / 2);
                return (
                  <g key={e.id} className="pointer-events-auto">
                    <path d={`M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`} stroke="#2cc295" strokeOpacity="0.45" strokeWidth={1.5} fill="none" />
                    <circle cx={(x1 + x2) / 2} cy={(y1 + y2) / 2} r={6} fill="#0a0f0d" stroke="#2cc295" strokeOpacity="0.6" className="cursor-pointer" onClick={() => removeEdge(flow.id, e.id)}>
                      <title>Click to remove edge</title>
                    </circle>
                  </g>
                );
              })}
              {connectFrom && (() => {
                const from = flow.nodes.find((n) => n.id === connectFrom);
                if (!from) return null;
                return <circle cx={from.x + NODE_W} cy={from.y + 60} r={10} fill="none" stroke="#f4a949" strokeDasharray="4 4" />;
              })()}
            </svg>

            {/* Nodes */}
            {flow.nodes.map((n) => (
              <NodeView
                key={n.id}
                node={n}
                selected={n.id === selectedId}
                peerLock={peerByNodeId.get(n.id) ?? null}
                onSelect={() => setSelectedId(n.id)}
                onMouseDown={(e) => onMouseDownNode(e, n.id)}
                onRun={() => run(n)}
                onPort={(side) => onPortClick(n.id, side)}
                onDelete={() => { removeNode(flow.id, n.id); if (selectedId === n.id) setSelectedId(null); }}
              />
            ))}

            {flow.nodes.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <p className="text-sm text-muted italic max-w-xs text-center">
                  Empty canvas. Pick a node from the palette to begin — Problem → Persona → Wedge → Build is a common shape.
                </p>
              </div>
            )}

            {/* Live peer cursors (Phase 3c) */}
            {cursors.map((c) => (
              <div
                key={c.userId}
                className="absolute z-30 pointer-events-none transition-[left,top] duration-75 ease-linear"
                style={{ left: c.x, top: c.y }}
              >
                <svg width="18" height="18" viewBox="0 0 16 16" fill="none" className="drop-shadow">
                  <path d="M1 1 L1 12 L4.4 9 L6.8 14 L9 13 L6.6 8 L11 8 Z" fill={c.color} stroke="#06100d" strokeWidth="1" strokeLinejoin="round" />
                </svg>
                <span className="ml-3 -mt-1 inline-block text-[10px] font-medium px-1.5 py-0.5 rounded text-black whitespace-nowrap" style={{ background: c.color }}>
                  {c.name}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Properties panel */}
        {selected && (
          <PropertiesPanel
            node={selected}
            flowId={flow.id}
            onChangeConfig={(p) => patchNodeConfig(flow.id, selected.id, p)}
            onChangeLabel={(l) => setNodeLabel(flow.id, selected.id, l)}
            onClose={() => setSelectedId(null)}
            onTryWith={(override) => run(selected, override)}
            onCommitPrompt={(prompt) => patchNodeConfig(flow.id, selected.id, { prompt })}
          />
        )}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────
function NodeView({ node, selected, peerLock, onSelect, onMouseDown, onRun, onPort, onDelete }: {
  node: FlowNode; selected: boolean;
  peerLock: FlowCanvasPeer | null;
  onSelect: () => void;
  onMouseDown: (e: React.MouseEvent) => void;
  onRun: () => void;
  onPort: (side: "out" | "in") => void;
  onDelete: () => void;
}) {
  const m = NODE_META[node.kind];
  const tone: Record<typeof m.color, string> = {
    emerald: "border-emerald/50 bg-emerald/5",
    amber: "border-amber/50 bg-amber/5",
    indigo: "border-indigo/50 bg-indigo/5",
    rust: "border-rust/50 bg-rust/5",
    muted: "border-border bg-surface-2/40",
  };

  return (
    <div
      onMouseDown={onMouseDown}
      onClick={onSelect}
      className={`absolute rounded-2xl border-2 backdrop-blur-sm shadow-2xl select-none cursor-move ${tone[m.color]} ${selected ? "ring-2 ring-emerald/60" : ""} ${peerLock ? "outline outline-2 outline-offset-2" : ""}`}
      style={{ left: node.x, top: node.y, width: NODE_W, outlineColor: peerLock?.color }}
    >
      {/* Peer-lock chip — shows who else is currently editing this node */}
      {peerLock && (
        <span
          className="absolute -top-2.5 -right-2.5 z-10 size-5 rounded-full border-2 border-surface text-[9px] font-bold flex items-center justify-center text-black shadow-md"
          style={{ background: peerLock.color }}
          title={`${peerLock.displayName} is editing this node`}
          data-no-drag
        >
          {peerLock.displayName[0]?.toUpperCase() ?? "?"}
        </span>
      )}

      {/* In/Out ports */}
      <button
        data-no-drag
        onClick={(e) => { e.stopPropagation(); onPort("in"); }}
        className="absolute -left-2 top-14 size-4 rounded-full bg-surface border-2 border-emerald hover:scale-110 transition"
        title="Connect FROM another node (click here AFTER clicking another node's output port)"
      />
      <button
        data-no-drag
        onClick={(e) => { e.stopPropagation(); onPort("out"); }}
        className="absolute -right-2 top-14 size-4 rounded-full bg-emerald hover:scale-110 transition"
        title="Connect from this node — click, then click the destination's input port"
      />

      <div className="p-3 border-b border-border/50 flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-widest text-muted">{m.label}</div>
          <div className="text-sm font-medium truncate">{node.label}</div>
        </div>
        <div className="shrink-0 flex items-center gap-1" data-no-drag>
          {node.status === "running" && <Loader2 className="size-3.5 animate-spin text-amber" />}
          {node.status === "ok" && <Check className="size-3.5 text-emerald" />}
          {node.status === "error" && <AlertCircle className="size-3.5 text-rust" />}
          <button onClick={onRun} className="text-[10px] uppercase tracking-widest text-muted hover:text-emerald px-1.5 py-0.5 rounded transition" title="Run this node">
            <Play className="size-3" />
          </button>
          <button onClick={onDelete} className="text-muted hover:text-rust" title="Delete">
            <Trash2 className="size-3" />
          </button>
        </div>
      </div>

      <div className="p-3">
        <div className="text-[10px] text-muted leading-relaxed line-clamp-3 mb-2">
          {node.output?.text?.slice(0, 200) ?? <span className="italic">{m.hint}</span>}
        </div>
        {node.output?.html && (
          <div className="text-[10px] text-emerald inline-flex items-center gap-1 mb-2">
            <CodeIcon className="size-2.5" /> {Math.round(node.output.html.length / 1024)}kB of HTML
          </div>
        )}
        {node.status === "error" && node.error && (
          <p className="text-[10px] text-rust italic line-clamp-2">{node.error}</p>
        )}
        <div className="text-[9px] text-muted font-mono">@{node.id}</div>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────
function PropertiesPanel({ node, onChangeConfig, onChangeLabel, onClose, onTryWith, onCommitPrompt }: {
  node: FlowNode;
  flowId: string;
  onChangeConfig: (p: Partial<FlowNode["config"]>) => void;
  onChangeLabel: (label: string) => void;
  onClose: () => void;
  onTryWith: (overridePrompt: string) => void;
  onCommitPrompt: (prompt: string) => void;
}) {
  const m = NODE_META[node.kind];
  // "Play with" state — a sandbox prompt the user can re-run without
  // saving it back to the node config. Useful when sketching
  // alternatives ("what if I asked for 3 personas instead of 1?")
  // before committing to a permanent change.
  const [playOpen, setPlayOpen] = useState(false);
  const [playDraft, setPlayDraft] = useState(node.config.prompt ?? "");
  // Reset the draft when switching nodes.
  const lastIdRef = useRef(node.id);
  if (lastIdRef.current !== node.id) {
    lastIdRef.current = node.id;
    setPlayDraft(node.config.prompt ?? "");
    setPlayOpen(false);
  }
  return (
    <aside className="w-80 shrink-0 border-l border-border bg-surface-2/20 overflow-y-auto">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-emerald">{m.label}</div>
          <input
            value={node.label}
            onChange={(e) => onChangeLabel(e.target.value)}
            className="bg-transparent outline-none text-sm font-medium w-full"
          />
        </div>
        <button onClick={onClose} className="text-muted hover:text-foreground"><X className="size-4" /></button>
      </div>

      <div className="p-4 space-y-4">
        <p className="text-[10px] text-muted leading-relaxed">{m.hint}</p>

        {node.kind === "problem" && (
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted mb-1.5">Atlas problem (optional)</div>
            <select
              value={node.config.problemId ?? ""}
              onChange={(e) => onChangeConfig({ problemId: e.target.value || undefined })}
              className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-xs outline-none focus:border-emerald"
            >
              <option value="">— freeform (use prompt below) —</option>
              {PROBLEMS.slice(0, 40).map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </div>
        )}

        {node.kind === "note" ? (
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted mb-1.5">Text</div>
            <textarea
              value={node.config.text ?? ""}
              onChange={(e) => onChangeConfig({ text: e.target.value })}
              rows={8}
              placeholder="Free-form context. Downstream nodes can reference this with @label."
              className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-xs outline-none focus:border-emerald resize-y"
            />
          </div>
        ) : (
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted mb-1.5">Prompt</div>
            <textarea
              value={node.config.prompt ?? ""}
              onChange={(e) => onChangeConfig({ prompt: e.target.value })}
              rows={10}
              placeholder={node.kind === "problem" ? "Or describe the problem in your own words." : `Reference upstream nodes with @<id> or @<label>.\n\nExample: "Generate a customer persona for @Problem_1 in @region"`}
              className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-xs outline-none focus:border-emerald font-mono resize-y"
            />
          </div>
        )}

        {node.output?.text && (
          <RunScrubber node={node} />
        )}

        {/* Play with — sandbox an alternate prompt without committing it */}
        {node.kind !== "note" && (
          <div className="pt-3 border-t border-border/50">
            <button
              onClick={() => setPlayOpen(!playOpen)}
              className="w-full flex items-center justify-between text-[10px] uppercase tracking-widest text-emerald hover:text-amber transition"
            >
              <span className="inline-flex items-center gap-1.5"><Beaker className="size-2.5" /> Play with this node</span>
              <span className="text-muted">{playOpen ? "Hide" : "Open"}</span>
            </button>
            {playOpen && (
              <div className="mt-2 space-y-2">
                <textarea
                  value={playDraft}
                  onChange={(e) => setPlayDraft(e.target.value)}
                  rows={5}
                  placeholder="Sketch an alternate prompt. Hit Try to run it without saving."
                  className="w-full bg-[#06100d] border border-emerald/30 rounded-lg px-3 py-2 text-xs outline-none focus:border-emerald font-mono resize-y"
                />
                <div className="flex items-center justify-between gap-2">
                  <button
                    onClick={() => onTryWith(playDraft)}
                    disabled={!playDraft.trim()}
                    className="text-[10px] uppercase tracking-widest px-3 py-1.5 rounded-full border border-emerald bg-emerald/10 text-emerald hover:bg-emerald/20 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Try without saving
                  </button>
                  <button
                    onClick={() => { onCommitPrompt(playDraft); setPlayOpen(false); }}
                    disabled={!playDraft.trim() || playDraft === (node.config.prompt ?? "")}
                    className="text-[10px] uppercase tracking-widest px-3 py-1.5 rounded-full border border-amber bg-amber/10 text-amber hover:bg-amber/20 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Keep it
                  </button>
                </div>
                <p className="text-[9px] text-muted leading-relaxed">
                  &quot;Try&quot; re-runs this node with the draft above; the result writes to <strong className="text-foreground">Last output</strong>. &quot;Keep it&quot; replaces the saved Prompt with the draft.
                </p>
              </div>
            )}
          </div>
        )}

        <div className="text-[10px] text-muted pt-2 border-t border-border/50 inline-flex items-center gap-1.5">
          <Link2 className="size-2.5" /> Reference this node downstream as <code className="text-emerald font-mono">@{node.id}</code>
        </div>
      </div>
    </aside>
  );
}

// Timeline scrubber over a node's run history. Defaults to the most
// recent run (current output); slide back to see prior runs without
// mutating the store. "Restore" copies the historical run into the
// node's current output so downstream nodes referencing this @id
// resolve to it on their next run.
function RunScrubber({ node }: { node: FlowNode }) {
  const runs = node.runs ?? [];
  const total = runs.length;
  const [idx, setIdx] = useState(Math.max(0, total - 1));
  const { setNodeOutput } = useFlow();
  const flowId = useMemo(() => {
    const f = useFlow.getState().flows.find((x) => x.nodes.some((n) => n.id === node.id));
    return f?.id ?? "";
  }, [node.id]);

  // Keep the slider pinned to the latest run when a new one lands.
  const prevTotalRef = useRef(total);
  if (prevTotalRef.current !== total) {
    prevTotalRef.current = total;
    setIdx(Math.max(0, total - 1));
  }

  // Show current output when total <= 1; scrubber only adds value at
  // ≥ 2 runs.
  if (total <= 1) {
    return (
      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted mb-1.5">Last output</div>
        <pre className="text-[10px] bg-[#06100d] border border-border rounded-lg p-2.5 max-h-64 overflow-auto whitespace-pre-wrap font-mono">{node.output?.text}</pre>
        {node.output?.html && (
          <details className="mt-2">
            <summary className="text-[10px] uppercase tracking-widest text-muted cursor-pointer hover:text-emerald">Preview HTML</summary>
            <iframe srcDoc={node.output.html} className="w-full h-48 mt-2 rounded-lg border border-border bg-white" sandbox="allow-scripts" />
          </details>
        )}
        <div className="text-[9px] text-muted mt-1.5">
          {node.output?.tokensIn !== undefined && <>in {node.output.tokensIn} · out {node.output.tokensOut} · </>}
          {node.output?.durationMs}ms
        </div>
      </div>
    );
  }

  const current = runs[idx] ?? runs[runs.length - 1];
  const isLatest = idx === total - 1;
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-[10px] uppercase tracking-widest text-muted">
          Run {idx + 1} of {total}{isLatest ? " · latest" : ""}
        </div>
        {!isLatest && flowId && (
          <button
            onClick={() => setNodeOutput(flowId, node.id, {
              text: current.text,
              html: current.html,
              json: current.json,
              tokensIn: current.tokensIn,
              tokensOut: current.tokensOut,
              durationMs: current.durationMs,
              runAt: current.ts,
            })}
            className="text-[10px] uppercase tracking-widest text-amber hover:text-emerald transition"
            title="Promote this historical run to the current output — downstream @refs will see it on their next run"
          >
            Restore →
          </button>
        )}
      </div>
      <input
        type="range"
        min={0}
        max={total - 1}
        value={idx}
        onChange={(e) => setIdx(parseInt(e.target.value))}
        className="w-full accent-emerald"
      />
      <pre className="text-[10px] bg-[#06100d] border border-border rounded-lg p-2.5 max-h-64 overflow-auto whitespace-pre-wrap font-mono mt-2">{current.text}</pre>
      {current.html && (
        <details className="mt-2">
          <summary className="text-[10px] uppercase tracking-widest text-muted cursor-pointer hover:text-emerald">Preview HTML</summary>
          <iframe srcDoc={current.html} className="w-full h-48 mt-2 rounded-lg border border-border bg-white" sandbox="allow-scripts" />
        </details>
      )}
      <div className="text-[9px] text-muted mt-1.5">
        {current.tokensIn !== undefined && <>in {current.tokensIn} · out {current.tokensOut} · </>}
        {current.durationMs}ms · {new Date(current.ts).toLocaleTimeString()}
      </div>
    </div>
  );
}
