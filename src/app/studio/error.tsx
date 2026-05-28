"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RefreshCcw, Home, AlertCircle } from "lucide-react";

export default function StudioError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("Studio error:", error);
  }, [error]);

  function nukeAndGoHome() {
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem("sankofa-v1");
        localStorage.removeItem("sankofa-me-v1");
        localStorage.removeItem("sankofa-ext-v1");
        localStorage.removeItem("sankofa-sketch-v1");
        localStorage.removeItem("sankofa-letters-v1");
        localStorage.removeItem("sankofa-welcomed-v1");
      } catch {}
    }
    window.location.href = "/";
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-6">
      <div className="max-w-lg w-full text-center">
        <div className="size-16 mx-auto rounded-full bg-rust/15 flex items-center justify-center mb-6">
          <AlertCircle className="size-8 text-rust" />
        </div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl sm:text-4xl font-semibold leading-tight">
          Something tripped on the way in.
        </h1>
        <p className="mt-4 text-muted leading-relaxed">
          We hit an unexpected error loading your studio. Your data is safe locally — try reloading first. If that doesn't help, the second button below clears your local workspace and starts fresh.
        </p>
        <div className="mt-3 text-xs text-muted/70 font-mono">
          {error.message?.slice(0, 200)}
          {error.digest && <div className="mt-1 opacity-60">ref: {error.digest}</div>}
        </div>
        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={reset}
            className="bg-emerald text-black font-semibold px-6 py-3 rounded-full hover:bg-amber transition flex items-center justify-center gap-2"
          >
            <RefreshCcw className="size-4" /> Reload the studio
          </button>
          <Link
            href="/"
            className="border border-border bg-surface px-6 py-3 rounded-full hover:bg-surface-2 transition flex items-center justify-center gap-2"
          >
            <Home className="size-4" /> Back to landing
          </Link>
          <button
            onClick={nukeAndGoHome}
            className="border border-rust/30 text-rust bg-rust/5 px-6 py-3 rounded-full hover:bg-rust/10 transition text-sm"
          >
            Reset & start fresh
          </button>
        </div>
      </div>
    </div>
  );
}
