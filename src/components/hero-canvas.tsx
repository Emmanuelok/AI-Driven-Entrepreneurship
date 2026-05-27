"use client";

import { useEffect, useRef } from "react";

// Particle-orbiting interactive hero canvas. Africa-shaped center.
export function HeroCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    type P = { x: number; y: number; r: number; vx: number; vy: number; hue: number; alpha: number };
    const particles: P[] = [];
    const N = 90;
    for (let i = 0; i < N; i++) {
      particles.push({
        x: Math.random(), y: Math.random(),
        r: 1 + Math.random() * 2.5,
        vx: (Math.random() - 0.5) * 0.0006,
        vy: (Math.random() - 0.5) * 0.0006,
        hue: Math.random() < 0.5 ? 156 : 32,
        alpha: 0.2 + Math.random() * 0.6,
      });
    }

    let mouse = { x: -1, y: -1 };
    const onMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = (e.clientX - rect.left) / rect.width;
      mouse.y = (e.clientY - rect.top) / rect.height;
    };
    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("mouseleave", () => { mouse = { x: -1, y: -1 }; });

    let raf = 0;
    const tick = () => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);

      // particles drift + mouse repulsion
      for (const p of particles) {
        if (mouse.x >= 0) {
          const dx = p.x - mouse.x, dy = p.y - mouse.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < 0.15) {
            p.vx += (dx / Math.max(0.001, d)) * 0.0004;
            p.vy += (dy / Math.max(0.001, d)) * 0.0004;
          }
        }
        p.x += p.vx; p.y += p.vy;
        p.vx *= 0.985; p.vy *= 0.985;
        if (p.x < 0) p.x = 1; if (p.x > 1) p.x = 0;
        if (p.y < 0) p.y = 1; if (p.y > 1) p.y = 0;
      }

      // connections
      ctx.lineWidth = 1;
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const a = particles[i], b = particles[j];
          const dx = (a.x - b.x) * w, dy = (a.y - b.y) * h;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < 130) {
            const alpha = (1 - d / 130) * 0.25;
            ctx.strokeStyle = `hsla(${(a.hue + b.hue) / 2}, 70%, 60%, ${alpha})`;
            ctx.beginPath();
            ctx.moveTo(a.x * w, a.y * h);
            ctx.lineTo(b.x * w, b.y * h);
            ctx.stroke();
          }
        }
      }

      // particles
      for (const p of particles) {
        ctx.fillStyle = `hsla(${p.hue}, 80%, 60%, ${p.alpha})`;
        ctx.beginPath();
        ctx.arc(p.x * w, p.y * h, p.r, 0, Math.PI * 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); canvas.removeEventListener("mousemove", onMove); };
  }, []);

  return <canvas ref={ref} className="absolute inset-0 w-full h-full pointer-events-auto opacity-70" />;
}
