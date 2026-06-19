// Shared OG-card primitives. Each opengraph-image.tsx route imports
// `renderOgCard` and feeds it the entity-specific bits (title,
// subtitle, kicker, accent). Doing it this way keeps every social
// preview consistent with the brand without duplicating the JSX
// across four route files.
//
// next/og's <ImageResponse> takes JSX (limited subset, no React
// hooks) and rasterizes to PNG. We use only flex + colors + system
// fonts — fancier typography needs a font fetch step which we skip
// for build-time predictability.

import { ImageResponse } from "next/og";

export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_CONTENT_TYPE = "image/png" as const;

export type OgCardProps = {
  kicker?: string;           // "MENTOR" / "VENTURE" / "ORGANIZATION"
  title: string;             // primary headline
  subtitle?: string;         // secondary one-liner
  badge?: string;            // small label, e.g. "Verified · Kenya"
  accent?: string;           // hex color for the kicker + corner blob
  watermark?: string;        // default "sankofa.studio"
};

// We declare runtime/size on each route file; this helper just emits
// the ImageResponse. Centralizing the style means a brand refresh is
// one diff.
export function renderOgCard(p: OgCardProps): ImageResponse {
  const accent = p.accent ?? "#2cc295";
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#0a0f0d",
          color: "#e7efe9",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 64,
          position: "relative",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {/* Accent corner blob (rendered as a flat colored disc — fancy
            gradients don't reliably composite in next/og's SVG-ish
            renderer). */}
        <div
          style={{
            position: "absolute",
            top: -200,
            right: -200,
            width: 600,
            height: 600,
            borderRadius: 9999,
            background: accent,
            opacity: 0.18,
            display: "flex",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -180,
            left: -180,
            width: 500,
            height: 500,
            borderRadius: 9999,
            background: "#f4a949",
            opacity: 0.12,
            display: "flex",
          }}
        />

        {/* Top: kicker + brand */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div
            style={{
              display: "flex",
              gap: 12,
              alignItems: "center",
              fontSize: 18,
              letterSpacing: 6,
              textTransform: "uppercase",
              color: accent,
            }}
          >
            <div
              style={{
                width: 36, height: 36, borderRadius: 10, background: accent,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#000", fontSize: 22, fontWeight: 700,
              }}
            >
              S
            </div>
            <span>{p.kicker ?? "Sankofa Studio"}</span>
          </div>
          {p.badge && (
            <div
              style={{
                display: "flex", padding: "8px 18px",
                borderRadius: 9999, border: `1px solid ${accent}`,
                color: accent, fontSize: 18,
              }}
            >
              {p.badge}
            </div>
          )}
        </div>

        {/* Middle: title + subtitle */}
        <div style={{ display: "flex", flexDirection: "column", maxWidth: "85%" }}>
          <div
            style={{
              fontSize: 72,
              fontWeight: 600,
              lineHeight: 1.05,
              letterSpacing: -1,
            }}
          >
            {p.title}
          </div>
          {p.subtitle && (
            <div
              style={{
                marginTop: 22,
                fontSize: 28,
                lineHeight: 1.35,
                color: "#cfe0d8",
                display: "flex",
              }}
            >
              {p.subtitle}
            </div>
          )}
        </div>

        {/* Bottom: watermark + URL hint */}
        <div
          style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            fontSize: 18, color: "#8aa39a",
          }}
        >
          <span>{p.watermark ?? "sankofa.studio"}</span>
          <span>The classroom-to-creator studio for African builders</span>
        </div>
      </div>
    ),
    { ...OG_SIZE },
  );
}

// Pretty-truncate so a 200-char headline doesn't blow out of the
// frame. Stops at a word boundary when possible.
export function clip(s: string | null | undefined, max: number): string {
  if (!s) return "";
  const trimmed = s.trim();
  if (trimmed.length <= max) return trimmed;
  const cut = trimmed.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut) + "…";
}
