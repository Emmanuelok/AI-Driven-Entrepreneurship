"use client";

import { useId } from "react";

// A dependency-free SVG area sparkline. Feed it a series of numbers
// (0..max) and it draws a smooth-ish filled line in the given color.
// Used for momentum / learning-velocity trajectory on the Me page; the
// shape is generic enough for any bounded 0..max series.
export function Sparkline({
  data,
  labels,
  color = "var(--accent, #2cc295)",
  max = 100,
  height = 64,
  showLast = true,
  className = "",
}: {
  data: number[];
  labels?: string[]; // optional x-axis hover labels, same length as data
  color?: string;
  max?: number;
  height?: number;
  showLast?: boolean;
  className?: string;
}) {
  const gid = useId().replace(/[:]/g, "");
  const W = 100; // viewBox width units; SVG scales to container
  const H = height;
  const n = data.length;

  if (n === 0) {
    return (
      <div className={`flex items-center justify-center text-xs text-muted ${className}`} style={{ height: H }}>
        No history yet — check back tomorrow.
      </div>
    );
  }

  const pad = 3;
  const innerW = W - pad * 2;
  const innerH = H - pad * 2;
  const x = (i: number) => (n === 1 ? W / 2 : pad + (i / (n - 1)) * innerW);
  const y = (v: number) => pad + innerH - (Math.max(0, Math.min(max, v)) / max) * innerH;

  const pts = data.map((v, i) => `${x(i).toFixed(2)},${y(v).toFixed(2)}`);
  const linePath = `M ${pts.join(" L ")}`;
  const areaPath = `${linePath} L ${x(n - 1).toFixed(2)},${(H - pad).toFixed(2)} L ${x(0).toFixed(2)},${(H - pad).toFixed(2)} Z`;
  const last = data[n - 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={`w-full ${className}`} style={{ height: H }} role="img" aria-label="Trajectory sparkline">
      <defs>
        <linearGradient id={`spark-${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.32" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#spark-${gid})`} />
      <path d={linePath} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      {showLast && (
        <circle cx={x(n - 1)} cy={y(last)} r="2" fill={color} vectorEffect="non-scaling-stroke" />
      )}
      {labels && labels.length === n && data.map((v, i) => (
        <rect key={i} x={x(i) - innerW / (2 * Math.max(1, n - 1))} y={0} width={innerW / Math.max(1, n - 1)} height={H} fill="transparent">
          <title>{`${labels[i]}: ${Math.round(v)}`}</title>
        </rect>
      ))}
    </svg>
  );
}
