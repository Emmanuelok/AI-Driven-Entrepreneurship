"use client";

import { useCallback, type CSSProperties, type ReactNode } from "react";

// <Spotlight> — a tiny client wrapper that tracks the pointer's local
// coords into --px / --py CSS variables, so the .spotlight class can
// render an accent radial glow that follows the cursor. Designed to be
// dropped around glass cards in hero positions.
//
// Cheap on its own: pure CSS rendering, no React state. The handler
// only writes inline styles via the DOM, so re-renders don't fire.

export function Spotlight({ className = "", style, children }: { className?: string; style?: CSSProperties; children: ReactNode }) {
  const onMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 100;
    const y = ((e.clientY - r.top) / r.height) * 100;
    e.currentTarget.style.setProperty("--px", `${x}%`);
    e.currentTarget.style.setProperty("--py", `${y}%`);
  }, []);
  return (
    <div className={`spotlight ${className}`} style={style} onPointerMove={onMove}>
      {children}
    </div>
  );
}
