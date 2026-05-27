"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { HOTSPOTS, project, GeoPoint } from "@/lib/african-geo";
import { Card, Badge } from "@/components/ui";
import { Globe2, Users, Rocket, AlertCircle, GraduationCap, Filter } from "lucide-react";

const COLORS: Record<GeoPoint["type"], { fill: string; stroke: string; label: string }> = {
  problem: { fill: "#d96444", stroke: "#fca28a", label: "Problems" },
  venture: { fill: "#2cc295", stroke: "#7ee8c1", label: "Ventures" },
  mentor: { fill: "#f4a949", stroke: "#fdd28e", label: "Mentors" },
  cohort: { fill: "#6c8cff", stroke: "#aab9ff", label: "Cohorts" },
};

export default function AtlasPage() {
  const [filter, setFilter] = useState<Record<GeoPoint["type"], boolean>>({
    problem: true,
    venture: true,
    mentor: true,
    cohort: true,
  });
  const [hovered, setHovered] = useState<GeoPoint | null>(null);
  const [selected, setSelected] = useState<GeoPoint | null>(null);

  const visible = useMemo(() => HOTSPOTS.filter((p) => filter[p.type]), [filter]);

  const counts = useMemo(() => {
    const c = { problem: 0, venture: 0, mentor: 0, cohort: 0 };
    HOTSPOTS.forEach((p) => { c[p.type] += 1; });
    return c;
  }, []);

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
          Every problem in the Hub, every active venture, every mentor, every cohort — geographically. Click a hotspot to dive in.
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
        <div className="text-xs text-muted ml-auto">{visible.length} hotspots visible</div>
      </Card>

      <div className="grid lg:grid-cols-[1fr_320px] gap-4">
        <Card className="overflow-hidden relative">
          <div className="absolute top-4 left-4 z-10 text-[10px] uppercase tracking-widest text-muted/70">Equirectangular projection · Africa</div>
          <svg viewBox="0 0 1000 1100" className="w-full bg-[#06100d]">
            {/* Stylized African continent outline (simplified) */}
            <AfricaOutline />

            {/* Grid */}
            <g stroke="rgba(231,239,233,0.04)" strokeWidth="1">
              {Array.from({ length: 11 }).map((_, i) => (
                <line key={`v${i}`} x1={i * 100} y1={0} x2={i * 100} y2={1100} />
              ))}
              {Array.from({ length: 12 }).map((_, i) => (
                <line key={`h${i}`} x1={0} y1={i * 100} x2={1000} y2={i * 100} />
              ))}
            </g>

            {/* Hotspots */}
            {visible.map((p) => {
              const { x, y } = project(p.lng, p.lat);
              const c = COLORS[p.type];
              const r = 6 + (p.hot ?? 3) * 2;
              const isHover = hovered?.id === p.id || selected?.id === p.id;
              return (
                <g
                  key={p.id}
                  onMouseEnter={() => setHovered(p)}
                  onMouseLeave={() => setHovered((h) => (h?.id === p.id ? null : h))}
                  onClick={() => setSelected(p)}
                  style={{ cursor: "pointer" }}
                >
                  {/* outer glow */}
                  <circle cx={x} cy={y} r={r + 8} fill={c.fill} opacity={0.18}>
                    <animate attributeName="r" values={`${r + 4};${r + 12};${r + 4}`} dur="3s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.25;0.05;0.25" dur="3s" repeatCount="indefinite" />
                  </circle>
                  <circle cx={x} cy={y} r={r} fill={c.fill} stroke={c.stroke} strokeWidth={isHover ? 3 : 1.5} />
                  {isHover && (
                    <g>
                      <rect x={x + 12} y={y - 16} width={Math.max(160, p.name.length * 8)} height="36" rx="6" fill="#0f1614" stroke={c.stroke} />
                      <text x={x + 20} y={y - 2} fill="#e7efe9" fontSize="13" fontWeight="600">{p.name}</text>
                      <text x={x + 20} y={y + 13} fill="#8aa39a" fontSize="10">{p.meta ?? p.country}</text>
                    </g>
                  )}
                </g>
              );
            })}
          </svg>
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
              <div className="text-sm text-muted">Hover a hotspot to preview. Click to pin it.</div>
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
            <h4 className="font-medium mb-2 text-sm">Why this matters</h4>
            <p className="text-xs text-muted leading-relaxed">
              Founders cluster where problems cluster — and where mentors operate. Sankofa places you in the right ecosystem from day one.
            </p>
          </Card>
        </div>
      </div>

      {/* Legend below */}
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
  if (point.type === "problem" && point.id.startsWith("p-")) {
    // Most map problems are illustrative — link the closest hub entry when ids align
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

function AfricaOutline() {
  // Hand-drawn simplified outline of Africa, using approximate equirectangular coords matching project().
  // Not a real geo polygon — stylized.
  return (
    <g>
      <path
        d="M 250 150 L 380 120 L 480 130 L 580 170 L 720 200 L 780 240 L 800 290 L 830 340 L 860 390 L 890 470 L 870 540 L 850 620 L 820 700 L 770 780 L 720 850 L 670 920 L 600 960 L 530 980 L 460 970 L 410 920 L 380 850 L 350 770 L 320 680 L 290 590 L 270 500 L 250 410 L 230 320 L 240 230 Z"
        fill="rgba(44, 194, 149, 0.05)"
        stroke="rgba(44, 194, 149, 0.4)"
        strokeWidth="1.5"
      />
      {/* Madagascar */}
      <path
        d="M 720 720 L 750 730 L 760 800 L 740 830 L 720 810 Z"
        fill="rgba(44, 194, 149, 0.05)"
        stroke="rgba(44, 194, 149, 0.4)"
        strokeWidth="1.5"
      />
      {/* Inner labels */}
      <text x="500" y="500" fill="rgba(231,239,233,0.04)" fontSize="80" fontWeight="800" textAnchor="middle" fontFamily="ui-serif">AFRICA</text>
    </g>
  );
}
