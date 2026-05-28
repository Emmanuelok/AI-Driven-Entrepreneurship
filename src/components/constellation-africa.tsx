"use client";

import { useEffect, useRef, useState } from "react";

// Builds Africa's outline as a constellation of stars that breathe.
// Stars converge from random positions to form the outline on mount,
// then drift slightly + twinkle. Mouse-reactive force.
export function ConstellationAfrica() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

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

    // Africa outline points (normalized 0..1 in a 0.6-aspect box).
    // Approximated from continental boundary.
    const AFRICA: [number, number][] = [
      [0.40, 0.04], [0.45, 0.05], [0.51, 0.06], [0.57, 0.07], [0.63, 0.08], [0.70, 0.09], [0.78, 0.12],
      [0.86, 0.16], [0.88, 0.22], [0.90, 0.30], [0.92, 0.39], [0.93, 0.49], [0.92, 0.58], [0.90, 0.67],
      [0.86, 0.75], [0.81, 0.82], [0.74, 0.87], [0.66, 0.90], [0.58, 0.92], [0.50, 0.93], [0.43, 0.92],
      [0.37, 0.89], [0.32, 0.84], [0.28, 0.79], [0.25, 0.73], [0.22, 0.67], [0.20, 0.60], [0.19, 0.53],
      [0.18, 0.46], [0.17, 0.39], [0.18, 0.32], [0.20, 0.25], [0.24, 0.19], [0.28, 0.14], [0.33, 0.10],
      [0.38, 0.07], [0.40, 0.04],
      // Madagascar
      [0.74, 0.74], [0.76, 0.78], [0.78, 0.83], [0.75, 0.85], [0.73, 0.81], [0.74, 0.74],
      // Inner detail
      [0.50, 0.30], [0.55, 0.40], [0.60, 0.50], [0.50, 0.55], [0.40, 0.50], [0.45, 0.40], [0.50, 0.30],
    ];

    type Star = { x: number; y: number; tx: number; ty: number; size: number; hue: number; alpha: number; phase: number };
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const bx = w * 0.5 - h * 0.28; // bounding box for africa
    const by = h * 0.07;
    const bw = h * 0.56;
    const bh = h * 0.92;

    const stars: Star[] = AFRICA.map((p) => ({
      x: Math.random() * w,
      y: Math.random() * h,
      tx: bx + p[0] * bw,
      ty: by + p[1] * bh,
      size: 1 + Math.random() * 2,
      hue: Math.random() < 0.6 ? 156 : 32,
      alpha: 0.5 + Math.random() * 0.5,
      phase: Math.random() * Math.PI * 2,
    }));
    // Add ambient background stars
    for (let i = 0; i < 80; i++) {
      stars.push({
        x: Math.random() * w,
        y: Math.random() * h,
        tx: Math.random() * w,
        ty: Math.random() * h,
        size: 0.4 + Math.random() * 1.2,
        hue: 200,
        alpha: 0.1 + Math.random() * 0.3,
        phase: Math.random() * Math.PI * 2,
      });
    }

    let mouse: { x: number; y: number } | null = null;
    const onMove = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      mouse = { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("mouseleave", () => { mouse = null; });

    const startT = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = (now - startT) / 1000;
      const w = canvas.clientWidth, h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);

      // Slow radial glow
      const grad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, h * 0.7);
      grad.addColorStop(0, "rgba(44, 194, 149, 0.06)");
      grad.addColorStop(0.5, "rgba(10, 15, 13, 0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      const formProgress = Math.min(1, t / 2.2); // form over 2.2 s

      // Draw connecting lines (only for africa-outline stars, in order)
      const outlineStars = stars.slice(0, AFRICA.length);
      ctx.lineWidth = 1;
      for (let i = 0; i < outlineStars.length - 1; i++) {
        const a = outlineStars[i], b = outlineStars[i + 1];
        const ax = a.x + (a.tx - a.x) * easeOutCubic(formProgress);
        const ay = a.y + (a.ty - a.y) * easeOutCubic(formProgress);
        const bx2 = b.x + (b.tx - b.x) * easeOutCubic(formProgress);
        const by2 = b.y + (b.ty - b.y) * easeOutCubic(formProgress);
        ctx.strokeStyle = `rgba(44, 194, 149, ${0.15 * formProgress})`;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx2, by2);
        ctx.stroke();
      }

      // Draw stars
      for (const s of stars) {
        const sx = s.x + (s.tx - s.x) * easeOutCubic(formProgress);
        const sy = s.y + (s.ty - s.y) * easeOutCubic(formProgress);
        let dx = 0, dy = 0;
        if (mouse) {
          const mx = sx - mouse.x, my = sy - mouse.y;
          const d = Math.sqrt(mx * mx + my * my);
          if (d < 140) {
            const f = (1 - d / 140) * 8;
            dx = (mx / Math.max(0.001, d)) * f;
            dy = (my / Math.max(0.001, d)) * f;
          }
        }
        const twinkle = 0.5 + 0.5 * Math.sin(t * 2 + s.phase);
        ctx.fillStyle = `hsla(${s.hue}, 80%, 65%, ${s.alpha * twinkle})`;
        ctx.beginPath();
        ctx.arc(sx + dx, sy + dy, s.size * (1 + twinkle * 0.3), 0, Math.PI * 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    setReady(true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("mousemove", onMove);
    };
  }, []);

  return <canvas ref={canvasRef} className={`absolute inset-0 w-full h-full pointer-events-auto ${ready ? "opacity-100" : "opacity-0"} transition-opacity duration-1000`} />;
}

function easeOutCubic(t: number) { return 1 - Math.pow(1 - t, 3); }
