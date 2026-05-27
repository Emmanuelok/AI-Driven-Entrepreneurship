"use client";

import { useEffect, useRef, useState } from "react";
import { Concept } from "@/store/me";

// Lightweight force-directed graph for the user's knowledge concepts.
export function KnowledgeGraph({ concepts }: { concepts: Concept[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<Concept | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const resize = () => {
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    type Node = { id: string; x: number; y: number; vx: number; vy: number; concept: Concept };
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const nodes: Node[] = concepts.map((c) => ({
      id: c.id,
      x: Math.random() * w,
      y: Math.random() * h,
      vx: 0, vy: 0,
      concept: c,
    }));
    const links: { a: Node; b: Node }[] = [];
    for (const n of nodes) {
      for (const linkId of n.concept.linkedTo) {
        const target = nodes.find((x) => x.id === linkId);
        if (target) links.push({ a: n, b: target });
      }
    }

    let raf = 0;
    let mouse: { x: number; y: number } | null = null;
    const onMove = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      mouse = { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const onLeave = () => { mouse = null; setHover(null); };
    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("mouseleave", onLeave);

    const COLORS: Record<string, string> = {
      stem: "#2cc295",
      math: "#f4a949",
      code: "#6c8cff",
      business: "#9b6cff",
      venture: "#d96444",
      other: "#8aa39a",
    };
    const colorFor = (cat: string) => {
      const key = cat.toLowerCase().split(" ")[0];
      return COLORS[key] ?? "#8aa39a";
    };

    const tick = () => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);

      // Forces — light gravity to center, repulsion between nodes, spring on links
      const cx = w / 2, cy = h / 2;
      for (const n of nodes) {
        n.vx += (cx - n.x) * 0.0008;
        n.vy += (cy - n.y) * 0.0008;
      }
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const d2 = Math.max(40, dx * dx + dy * dy);
          const f = 1200 / d2;
          a.vx += (dx / Math.sqrt(d2)) * f;
          a.vy += (dy / Math.sqrt(d2)) * f;
          b.vx -= (dx / Math.sqrt(d2)) * f;
          b.vy -= (dy / Math.sqrt(d2)) * f;
        }
      }
      for (const { a, b } of links) {
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 1;
        const targetLen = 100;
        const f = (d - targetLen) * 0.02;
        a.vx += (dx / d) * f;
        a.vy += (dy / d) * f;
        b.vx -= (dx / d) * f;
        b.vy -= (dy / d) * f;
      }
      for (const n of nodes) {
        n.vx *= 0.85; n.vy *= 0.85;
        n.x += n.vx; n.y += n.vy;
        if (n.x < 20) { n.x = 20; n.vx *= -0.5; }
        if (n.x > w - 20) { n.x = w - 20; n.vx *= -0.5; }
        if (n.y < 20) { n.y = 20; n.vy *= -0.5; }
        if (n.y > h - 20) { n.y = h - 20; n.vy *= -0.5; }
      }

      // Render links
      ctx.lineWidth = 1;
      for (const { a, b } of links) {
        ctx.strokeStyle = "rgba(231,239,233,0.1)";
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }

      // Render nodes
      let hoverNode: Node | null = null;
      for (const n of nodes) {
        const r = 6 + n.concept.mastery * 14;
        const col = colorFor(n.concept.category);
        const isHover = mouse && Math.hypot(n.x - mouse.x, n.y - mouse.y) <= r + 4;
        ctx.fillStyle = col;
        ctx.globalAlpha = 0.25;
        ctx.beginPath();
        ctx.arc(n.x, n.y, r + 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.fill();
        if (isHover) {
          hoverNode = n;
          ctx.strokeStyle = "#e7efe9";
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(n.x, n.y, r + 3, 0, Math.PI * 2); ctx.stroke();
        }
        if (n.concept.mastery > 0.4 || isHover) {
          ctx.fillStyle = "#e7efe9";
          ctx.font = `${isHover ? 13 : 11}px ui-sans-serif`;
          ctx.fillText(n.concept.name, n.x + r + 4, n.y + 4);
        }
      }
      if (hoverNode?.concept !== hover) setHover(hoverNode?.concept ?? null);

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("mouseleave", onLeave);
    };
  }, [concepts]);

  return (
    <div className="relative w-full h-[500px]">
      <canvas ref={canvasRef} className="w-full h-full block rounded-2xl" style={{ background: "#06100d" }} />
      {hover && (
        <div className="absolute top-3 right-3 glass rounded-xl p-3 border border-emerald/30">
          <div className="font-medium text-sm">{hover.name}</div>
          <div className="text-xs text-muted">{hover.category} · mastery {(hover.mastery * 100).toFixed(0)}% · {hover.reps} reps</div>
        </div>
      )}
      {concepts.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-center">
          <div className="text-sm text-muted max-w-xs">Your knowledge graph will grow as you learn. Open a lesson, ask Sage, run an agent — each touch adds a node.</div>
        </div>
      )}
    </div>
  );
}
