"use client";

import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("Global error:", error);
  }, [error]);

  function nuke() {
    if (typeof window !== "undefined") {
      try {
        ["sankofa-v1", "sankofa-me-v1", "sankofa-ext-v1", "sankofa-sketch-v1", "sankofa-letters-v1", "sankofa-welcomed-v1"].forEach((k) => localStorage.removeItem(k));
      } catch {}
    }
    window.location.href = "/";
  }

  return (
    <html lang="en">
      <body style={{ background: "#0a0f0d", color: "#e7efe9", fontFamily: "ui-sans-serif, system-ui, sans-serif", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ maxWidth: 480, textAlign: "center" }}>
          <div style={{ fontSize: 12, letterSpacing: "0.25em", textTransform: "uppercase", color: "#d96444", marginBottom: 16 }}>
            Something tripped
          </div>
          <h1 style={{ fontSize: 32, fontWeight: 600, lineHeight: 1.1, margin: "0 0 16px" }}>The studio hit an unexpected error.</h1>
          <p style={{ fontSize: 14, color: "#8aa39a", lineHeight: 1.6, margin: "0 0 24px" }}>
            Your local data is safe. Try reloading first; if that doesn&apos;t work, reset clears your workspace and starts fresh.
          </p>
          <div style={{ fontSize: 11, color: "#8aa39a99", fontFamily: "ui-monospace", marginBottom: 24 }}>
            {error.message?.slice(0, 200)}
          </div>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <button onClick={reset} style={{ background: "#2cc295", color: "#000", padding: "12px 24px", borderRadius: 999, border: "none", fontWeight: 600, cursor: "pointer" }}>
              Reload
            </button>
            <button onClick={nuke} style={{ background: "transparent", color: "#d96444", padding: "12px 24px", borderRadius: 999, border: "1px solid rgba(217,100,68,0.3)", cursor: "pointer", fontSize: 14 }}>
              Reset and start fresh
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
