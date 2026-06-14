"use client";

import { useEffect } from "react";
import { useStore, type Venture } from "@/store";
import { useMe } from "@/store/me";
import { useLetters } from "@/store/letters";
import type { PhaseAssessment } from "@/lib/phase-engine";

// Watches a venture's Phase Engine assessment and fires the automation
// the engine earns: a celebration when a gate flips green, and an
// advancement letter from Sage the first time every gate is met.
//
// Correctness rule: the FIRST time we see a given venture+phase we only
// PRIME the baseline — we never fire retroactively for gates that were
// already met (or readiness already maxed) before the watcher started.
// Only true transitions afterward trigger anything.
//
// All side-effects route through stable store actions read via
// getState(), so the effect depends solely on the assessment — no
// store subscriptions, no feedback loop.
export function usePhaseGateWatcher(
  venture: Venture | undefined,
  assessment: PhaseAssessment | undefined,
) {
  // A compact signature of which gates are met + readiness, so the
  // effect re-runs exactly when the assessment materially changes.
  const metSig = assessment
    ? `${assessment.readiness}|${assessment.criteria.map((c) => (c.met ? "1" : "0")).join("")}`
    : "";

  useEffect(() => {
    if (!venture || !assessment) return;

    const me = useMe.getState();
    const store = useStore.getState();
    const letters = useLetters.getState();

    const key = `${venture.id}:${venture.phase}`;
    const currentMet = assessment.criteria.filter((c) => c.met).map((c) => c.id);
    const prev = me.phaseSeen[key];

    // First sight → prime baseline silently.
    if (!prev) {
      me.setPhaseSeen(key, { met: currentMet, letterSent: assessment.readiness >= 100 });
      return;
    }

    const newlyMet = currentMet.filter((id) => !prev.met.includes(id));
    for (const id of newlyMet) {
      const c = assessment.criteria.find((x) => x.id === id);
      if (!c) continue;
      store.notify({ title: "Phase gate cleared ✓", body: `${venture.name}: ${c.label}`, href: c.href });
      me.pushInsight({ text: `Cleared a ${venture.phase} gate on ${venture.name}: ${c.label}`, category: "celebration" });
      me.logActivity({ kind: "venture", title: `${venture.name}: gate cleared — ${c.label}` });
    }

    // Every gate green for the first time → Sage drafts the letter.
    let letterSent = prev.letterSent;
    if (assessment.readiness >= 100 && !letterSent && assessment.nextPhase) {
      letters.writeLetter({
        reason: "phase-advance",
        title: `${venture.name} is ready for ${assessment.nextPhase}`,
        body: advancementLetterBody(venture, assessment),
        triggeredBy: key,
        cta: { label: `Open ${venture.name}`, href: `/studio/venture/${venture.id}` },
      });
      store.notify({
        title: `${venture.name} cleared every ${venture.phase} gate`,
        body: `Sage wrote you a letter about advancing to ${assessment.nextPhase}.`,
        href: "/studio/letters",
      });
      letterSent = true;
    }

    if (newlyMet.length > 0 || letterSent !== prev.letterSent) {
      me.setPhaseSeen(key, { met: currentMet, letterSent });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venture?.id, venture?.phase, metSig]);
}

function advancementLetterBody(venture: Venture, a: PhaseAssessment): string {
  const cleared = a.criteria.map((c) => `- ${c.label}`).join("\n");
  return [
    `Dear founder,`,
    ``,
    `**${venture.name}** just cleared every gate in the ${a.phase} phase. That's not a participation trophy — each of these was a real bar:`,
    ``,
    cleared,
    ``,
    `You've earned **${a.nextPhase}**. But earning it and entering it aren't the same thing. Before you advance, sit with one question: is the evidence behind these gates *strong*, or just *present*? A checked box built on three polite interviews is weaker than one built on a stranger reaching for their wallet.`,
    ``,
    `If the evidence is real, advance with confidence — the next phase rewards momentum. If you're nodding too quickly, spend one more day hardening the weakest gate. Either way: this is progress worth marking.`,
    ``,
    `— Sage`,
  ].join("\n");
}
