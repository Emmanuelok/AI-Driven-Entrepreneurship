"use client";

import { useEffect, useRef } from "react";
import { useStore } from "@/store";
import { useMe } from "@/store/me";
import { useLetters } from "@/store/letters";
import { fetchUserConnectionsCached } from "@/lib/connections-client";
import { computeInsights } from "@/lib/insights";
import { buildSiteContextSnapshotAsync } from "@/lib/site-brain-snapshot";
import { genomeVoiceInstruction } from "@/lib/genome";

// Auto-trigger for the discipline check-in letter.
//
// Fires once per session when ALL of the following hold:
//   - User is signed in with a resolvable field
//   - Their connection graph has a strong pulled-toward problem
//     (top-problem degree ≥ 4 — the same threshold Sage uses to talk
//     about it)
//   - They haven't received a discipline-checkin letter in the last
//     14 days
//
// The check-in shows up in /studio/letters next time they open it.
// We do NOT push a notification — Sage writing without being asked
// should feel like finding a letter on the kitchen table, not an
// interruption.

const SESSION_FIRED_KEY = "sankofa-discipline-checkin-fired-session";
const COOLDOWN_DAYS = 14;

export function useDisciplineCheckinTrigger() {
  const { user, ventures, streak, xp } = useStore();
  const { genome, recall, recentActivity } = useMe();
  const { letters, writeLetter } = useLetters();
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    if (!user || !user.field || user.field === "General") return;

    // Session de-dupe: even page-to-page navigations shouldn't double-
    // fire within one tab session.
    try {
      if (sessionStorage.getItem(SESSION_FIRED_KEY)) return;
    } catch { /* sessionStorage unavailable — proceed */ }

    // Per-user cooldown: respect the last discipline-checkin we wrote.
    const cutoff = Date.now() - COOLDOWN_DAYS * 86_400_000;
    const recentCheckin = letters.find((l) => l.reason === "Discipline check-in" && l.ts > cutoff);
    if (recentCheckin) {
      try { sessionStorage.setItem(SESSION_FIRED_KEY, "1"); } catch { /* noop */ }
      return;
    }

    let cancelled = false;
    (async () => {
      // Strength check: only fire when the graph is clearly pulling
      // the student in a specific direction. degree ≥ 4 is roughly
      // "they've connected this problem to a venture AND a build AND
      // either a sketch or another venture" — a real pattern, not a
      // shrug.
      const rows = await fetchUserConnectionsCached();
      if (cancelled || rows.length < 4) return;
      const summary = computeInsights(rows, {
        builds: [],
        ventures: ventures.map((v) => ({ id: v.id, name: v.name })),
      });
      if (!summary.topProblem || summary.topProblem.degree < 4) return;

      firedRef.current = true;
      try { sessionStorage.setItem(SESSION_FIRED_KEY, "1"); } catch { /* noop */ }

      try {
        const res = await fetch("/api/generate/letter", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reason: "discipline-checkin",
            name: user.name,
            field: user.field,
            genomeVoice: genomeVoiceInstruction(genome),
            triggerContext: `${summary.topProblem.id} has ${summary.topProblem.degree} edges in their graph. Streak ${streak}d, ${xp} XP.`,
            memorySummary: recall().slice(0, 6).map((m) => `- ${m.fact}`).join("\n"),
            recentActivity: recentActivity(10).map((a) => a.title).join(" / "),
            siteContext: await buildSiteContextSnapshotAsync("auto-checkin"),
          }),
        });
        const data = await res.json() as { title: string; body: string };
        if (cancelled || !data.title) return;
        writeLetter({ reason: "Discipline check-in", title: data.title, body: data.body });
      } catch { /* silent — auto-fires never block the UI */ }
    })();

    return () => { cancelled = true; };
  }, [user, ventures, streak, xp, genome, letters, recall, recentActivity, writeLetter]);
}
