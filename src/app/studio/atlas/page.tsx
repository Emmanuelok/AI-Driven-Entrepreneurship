"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { HOTSPOTS, project, GeoPoint } from "@/lib/african-geo";
import { AFRICA_COUNTRIES, pathFromPolygon } from "@/lib/africa-countries";
import { Card, Badge } from "@/components/ui";
import { Globe2, Users, Rocket, AlertCircle, GraduationCap, Filter, ZoomIn, ZoomOut, RefreshCcw } from "lucide-react";

const COLORS: Record<GeoPoint["type"], { fill: string; stroke: string; label: string }> = {
  problem: { fill: "#d96444", stroke: "#fca28a", label: "Problems" },
  venture: { fill: "#2cc295", stroke: "#7ee8c1", label: "Ventures" },
  mentor: { fill: "#f4a949", stroke: "#fdd28e", label: "Mentors" },
  cohort: { fill: "#6c8cff", stroke: "#aab9ff", label: "Cohorts" },
};

const VIEW_W = 1000;
const VIEW_H = 1100;

export default function AtlasPage() {
  const [filter, setFilter] = useState<Record<GeoPoint["type"], boolean>>({ problem: true, venture: true, mentor: true, cohort: true });
  const [hovered, setHovered] = useState<GeoPoint | null>(null);
  const [selected, setSelected] = useState<GeoPoint | null>(null);
  const [hoveredCountry, setHoveredCountry] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const visible = useMemo(() => HOTSPOTS.filter((p) => filter[p.type]), [filter]);
  const counts = useMemo(() => {
    const c = { problem: 0, venture: 0, mentor: 0, cohort: 0 };
    HOTSPOTS.forEach((p) => { c[p.type] += 1; });
    return c;
  }, []);

  function reset() { setZoom(1); setPan({ x: 0, y: 0 }); }

  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom((z) => Math.max(0.6, Math.min(4, z * factor)));
  }

  function onPointerDown(e: React.PointerEvent) {
    setDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragging) return;
    setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  }
  function onPointerUp() { setDragging(false); }

  return (
    <div className="max-w-7xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <div className="mb-8">
        <p className="text-xs uppercase tracking-[0.22em] text-emerald mb-2 flex items-center gap-1.5">
          <Globe2 className="size-3.5" /> Atlas — the Sankofa map
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight">
          The continent, at a glance.
        </h1>
        <p className="mt-3 text-muted max-w-2xl">
          A real geographic map — all 54 African countries with accurate borders. Every problem, venture, mentor, and cohort placed at its actual location. Pinch / wheel to zoom, drag to pan.
        </p>
      </div>

      <Card className="p-4 mb-4 flex flex-wrap gap-2 items-center">
        <Filter className="size-4 text-muted" />
        {(Object.keys(COLORS) as GeoPoint["type"][]).map((t) => (
          <button
            key={t}
            onClick={() => setFilter({ ...filter, [t]: !filter[t] })}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs transition ${
              filter[t] ? "border border-border bg-surface" : "border border-border opacity-40 line-through"
            }`}
          >
            <span className="size-2.5 rounded-full" style={{ background: COLORS[t].fill }} />
            {COLORS[t].label} ({counts[t]})
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1">
          <button onClick={() => setZoom((z) => Math.min(4, z * 1.25))} className="size-8 rounded-lg border border-border hover:bg-surface-2 flex items-center justify-center"><ZoomIn className="size-4" /></button>
          <button onClick={() => setZoom((z) => Math.max(0.6, z * 0.8))} className="size-8 rounded-lg border border-border hover:bg-surface-2 flex items-center justify-center"><ZoomOut className="size-4" /></button>
          <button onClick={reset} className="size-8 rounded-lg border border-border hover:bg-surface-2 flex items-center justify-center"><RefreshCcw className="size-3.5" /></button>
        </div>
        <div className="text-xs text-muted">{visible.length} hotspots · {AFRICA_COUNTRIES.length} countries · zoom {zoom.toFixed(1)}×</div>
      </Card>

      <div className="grid lg:grid-cols-[1fr_320px] gap-4">
        <Card className="overflow-hidden relative">
          <div className="absolute top-4 left-4 z-10 text-[10px] uppercase tracking-widest text-muted/70">Equirectangular projection · Natural Earth-derived borders</div>
          <div
            className="bg-[#06100d] cursor-grab"
            style={{ cursor: dragging ? "grabbing" : "grab" }}
            onWheel={onWheel}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
          >
            <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="w-full h-auto block select-none">
              <defs>
                <radialGradient id="oceanGrad" cx="50%" cy="50%" r="80%">
                  <stop offset="0%" stopColor="#0a1a18" />
                  <stop offset="100%" stopColor="#06100d" />
                </radialGradient>
                <linearGradient id="landGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0f2922" />
                  <stop offset="100%" stopColor="#0a1f1a" />
                </linearGradient>
                <filter id="hotspotGlow">
                  <feGaussianBlur stdDeviation="4" />
                </filter>
              </defs>
              <rect width={VIEW_W} height={VIEW_H} fill="url(#oceanGrad)" />

              {/* Grid */}
              <g stroke="rgba(231,239,233,0.03)" strokeWidth="1">
                {Array.from({ length: 11 }).map((_, i) => (<line key={`v${i}`} x1={i * 100} y1={0} x2={i * 100} y2={VIEW_H} />))}
                {Array.from({ length: 12 }).map((_, i) => (<line key={`h${i}`} x1={0} y1={i * 100} x2={VIEW_W} y2={i * 100} />))}
              </g>

              <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`} style={{ transformOrigin: "0 0" }}>
                {/* Countries */}
                <g>
                  {AFRICA_COUNTRIES.map((c) => {
                    const isH = hoveredCountry === c.id;
                    return (
                      <g key={c.id}
                        onMouseEnter={() => setHoveredCountry(c.id)}
                        onMouseLeave={() => setHoveredCountry((h) => (h === c.id ? null : h))}
                        style={{ cursor: "pointer" }}
                      >
                        {c.polygons.map((poly, j) => (
                          <path
                            key={j}
                            d={pathFromPolygon(poly, VIEW_W, VIEW_H)}
                            fill={isH ? "rgba(44,194,149,0.18)" : "url(#landGrad)"}
                            stroke={isH ? "#2cc295" : "rgba(44, 194, 149, 0.25)"}
                            strokeWidth={isH ? 1.5 : 0.8}
                            strokeLinejoin="round"
                          />
                        ))}
                      </g>
                    );
                  })}
                </g>

                {/* Capitals */}
                <g>
                  {AFRICA_COUNTRIES.map((c) => {
                    const { x, y } = project(c.capitalLngLat[0], c.capitalLngLat[1]);
                    return (
                      <circle key={`cap-${c.id}`} cx={x} cy={y} r={1.5 / zoom} fill="rgba(231,239,233,0.4)" />
                    );
                  })}
                </g>

                {/* Hotspots */}
                {visible.map((p) => {
                  const { x, y } = project(p.lng, p.lat);
                  const c = COLORS[p.type];
                  const r = (5 + (p.hot ?? 3) * 1.5) / zoom;
                  const isHover = hovered?.id === p.id || selected?.id === p.id;
                  return (
                    <g key={p.id}
                      onMouseEnter={() => setHovered(p)}
                      onMouseLeave={() => setHovered((h) => (h?.id === p.id ? null : h))}
                      onClick={() => setSelected(p)}
                      style={{ cursor: "pointer" }}
                    >
                      <circle cx={x} cy={y} r={r * 2.5} fill={c.fill} opacity={0.18}>
                        <animate attributeName="r" values={`${r * 1.5};${r * 3.5};${r * 1.5}`} dur="3s" repeatCount="indefinite" />
                        <animate attributeName="opacity" values="0.25;0.05;0.25" dur="3s" repeatCount="indefinite" />
                      </circle>
                      <circle cx={x} cy={y} r={r} fill={c.fill} stroke={c.stroke} strokeWidth={(isHover ? 2 : 1) / zoom} />
                      {isHover && (
                        <g transform={`scale(${1 / zoom})`} style={{ transformOrigin: `${x}px ${y}px` }}>
                          <rect x={x + 12} y={y - 18} width={Math.max(180, p.name.length * 8)} height="40" rx="6" fill="#0f1614" stroke={c.stroke} />
                          <text x={x + 20} y={y - 2} fill="#e7efe9" fontSize="13" fontWeight="600">{p.name}</text>
                          <text x={x + 20} y={y + 14} fill="#8aa39a" fontSize="10">{p.meta ?? p.country}</text>
                        </g>
                      )}
                    </g>
                  );
                })}
              </g>

              {/* Hovered country label (fixed position) */}
              {hoveredCountry && (() => {
                const c = AFRICA_COUNTRIES.find((x) => x.id === hoveredCountry);
                if (!c) return null;
                return (
                  <g>
                    <rect x="20" y={VIEW_H - 60} width="240" height="44" rx="8" fill="#0f1614" stroke="#2cc295" />
                    <text x="32" y={VIEW_H - 38} fill="#2cc295" fontSize="14" fontWeight="600">{c.name}</text>
                    <text x="32" y={VIEW_H - 22} fill="#8aa39a" fontSize="11">Capital: {c.capital}</text>
                  </g>
                );
              })()}
            </svg>
          </div>
        </Card>

        {/* Side panel */}
        <div className="space-y-3">
          {selected ? (
            <Card className="p-5">
              <Badge color={selected.type === "problem" ? "rust" : selected.type === "venture" ? "emerald" : selected.type === "mentor" ? "amber" : "indigo"}>
                {COLORS[selected.type].label.slice(0, -1)}
              </Badge>
              <h3 className="mt-3 font-[family-name:var(--font-display)] text-xl font-semibold leading-tight">{selected.name}</h3>
              <p className="text-xs text-muted mt-1">{selected.country}</p>
              <p className="mt-3 text-sm">{selected.meta}</p>
              <DeepLink point={selected} />
              <button onClick={() => setSelected(null)} className="mt-4 text-xs text-muted hover:text-foreground">Clear selection</button>
            </Card>
          ) : (
            <Card className="p-5">
              <div className="text-sm text-muted">Hover a country to see its name. Click a hotspot to dive in.</div>
            </Card>
          )}

          <Card className="p-5">
            <h4 className="font-medium mb-3 text-sm">Top problem clusters</h4>
            <div className="space-y-2 text-sm">
              {HOTSPOTS.filter((p) => p.type === "problem" && (p.hot ?? 0) >= 5).slice(0, 5).map((p) => (
                <button key={p.id} onClick={() => setSelected(p)} className="block w-full text-left hover:bg-surface-2 rounded-lg p-2 -mx-2 transition">
                  <div className="font-medium text-foreground">{p.name}</div>
                  <div className="text-xs text-muted">{p.country} · {p.meta}</div>
                </button>
              ))}
            </div>
          </Card>

          <Card className="p-5 bg-gradient-to-br from-emerald/10 to-amber/10">
            <h4 className="font-medium mb-2 text-sm">Real geography</h4>
            <p className="text-xs text-muted leading-relaxed">
              Borders derived from Natural Earth public-domain data, simplified for in-browser rendering. {AFRICA_COUNTRIES.length} countries · their capitals · accurate hotspot positions.
            </p>
          </Card>
        </div>
      </div>

      <div className="mt-6 grid sm:grid-cols-4 gap-3">
        {(Object.keys(COLORS) as GeoPoint["type"][]).map((t) => {
          const Icon = t === "problem" ? AlertCircle : t === "venture" ? Rocket : t === "mentor" ? Users : GraduationCap;
          return (
            <Card key={t} className="p-4 flex items-center gap-3">
              <div className="size-9 rounded-xl flex items-center justify-center" style={{ background: COLORS[t].fill + "22", color: COLORS[t].fill }}>
                <Icon className="size-4" />
              </div>
              <div>
                <div className="text-sm font-medium">{COLORS[t].label}</div>
                <div className="text-xs text-muted">{counts[t]} mapped</div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function DeepLink({ point }: { point: GeoPoint }) {
  if (point.type === "problem") {
    const hubMap: Record<string, string> = {
      "p-tomato-tamale": "/studio/problems/post-harvest-loss",
      "p-mobile-credit-kenya": "/studio/problems/smb-bookkeeping",
      "p-minigrid-drc": "/studio/problems/minigrid-design",
      "p-mat-mortality-uganda": "/studio/problems/diagnosis-gap",
      "p-sahel-rain": "/studio/problems/climate-adaptation",
      "p-water-malawi": "/studio/problems/water-quality",
      "p-translation-eth": "/studio/problems/vernacular-tutoring",
    };
    const href = hubMap[point.id];
    if (href) return <Link href={href} className="mt-4 inline-block text-sm text-emerald hover:underline">Open full problem brief →</Link>;
  }
  if (point.type === "mentor") {
    const idMap: Record<string, string> = { "m-ia": "iyinoluwa-aboyeji", "m-re": "rebecca-enonchong", "m-hs": "ham-serunjogi", "m-ka": "kola-aina", "m-sa": "shola-akinlade", "m-rmt": "dr-rose-mutiso", "m-ace": "audrey-cheng", "m-afb": "ange-frederick" };
    if (idMap[point.id]) return <Link href={`/studio/mentors/${idMap[point.id]}`} className="mt-4 inline-block text-sm text-emerald hover:underline">Mentor profile →</Link>;
  }
  return null;
}
