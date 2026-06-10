"use client";

import { useEffect } from "react";
import { useMe } from "@/store/me";
import { genomeAccent } from "@/lib/genome";

// Sets the per-user accent variables on <html> so the whole studio
// tilts toward the user's totem (chosen in the Genome) — gradients,
// rings, and highlights all read --accent/--accent-2 with emerald/amber
// fallbacks for signed-out surfaces. An explicit themeAccent preference
// (Settings) overrides the totem-derived primary.
const ACCENT_HEX: Record<string, string> = {
  emerald: "#2cc295",
  amber: "#f4a949",
  indigo: "#6c8cff",
  rust: "#d96444",
};

export function PersonalTheme() {
  const { genome, prefs } = useMe();

  useEffect(() => {
    const root = document.documentElement;
    const totem = genomeAccent(genome);
    const primary = prefs.themeAccent !== "emerald" ? ACCENT_HEX[prefs.themeAccent] : totem.primary;
    root.style.setProperty("--accent", primary);
    root.style.setProperty("--accent-2", totem.accent);
    root.dataset.totem = genome.totem.toLowerCase();
    return () => {
      root.style.removeProperty("--accent");
      root.style.removeProperty("--accent-2");
      delete root.dataset.totem;
    };
  }, [genome, prefs.themeAccent]);

  return null;
}
