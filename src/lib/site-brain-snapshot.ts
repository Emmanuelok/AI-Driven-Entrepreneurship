"use client";

import { useStore } from "@/store";
import { useMe } from "@/store/me";
import { useBuild } from "@/store/build";
import { useSketch } from "@/store/sketch";
import { useLetters } from "@/store/letters";
import type { SiteContextSnapshot } from "@/lib/site-brain";
import { genomeVoiceInstruction } from "@/lib/genome";
import { resolveDepartment } from "@/lib/recommendations";
import { getDepartment } from "@/lib/disciplines";

// Build a Site Brain snapshot from the local zustand stores. Pure
// synchronous read — call right before a fetch. Cheap; safe to call
// dozens of times per session.
//
// `scope` is purely a hint for the server (we keep `recentBuilds` for
// build-scope calls, drop them for letter-scope, etc.) — never gate
// security on it.

export function buildSiteContextSnapshot(scope?: string): SiteContextSnapshot {
  const s = useStore.getState();
  const me = useMe.getState();
  const builds = useBuild.getState();
  const sketch = useSketch.getState();
  const letters = useLetters.getState();

  // Pick the most recently-touched venture as "active". A user can
  // juggle several, but the AI should anchor on the front-of-mind one.
  const ventures = [...(s.ventures ?? [])].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  const activeVenture = ventures[0];

  // Recent shipped artifacts double as a quick "things this user has
  // already finished" — useful for tone (compliment without being
  // generic).
  const shipped = (me.artifacts ?? []).slice(0, 4).map((a) => ({ kind: a.kind, title: a.title }));

  const firstName = s.user?.name?.split(" ")[0];

  // Resolve the user's field → department → discipline-specific
  // signals (AI opportunities, local examples, suggested seed). When
  // the field doesn't resolve cleanly, we just skip — the rest of the
  // snapshot still works.
  const dept = resolveDepartment(s.user?.field);
  const fullDept = dept ? getDepartment(dept.id) : null;

  const snap: SiteContextSnapshot = {
    user: s.user ? {
      firstName,
      fullName: s.user.name,
      institution: s.user.institution,
      program: s.user.program,
      year: s.user.year,
      country: s.user.country,
      primaryLanguage: s.user.primaryLanguage,
      field: s.user.field,
      level: 1 + Math.floor((s.xp ?? 0) / 200),
      streak: s.streak,
      xp: s.xp,
    } : undefined,

    discipline: fullDept ? {
      school: fullDept.school.name,
      department: fullDept.department.name,
      suggestedVentureSeed: fullDept.department.suggestedVentureSeed,
      aiOpportunities: fullDept.department.aiOpportunities,
      localExamples: fullDept.department.localExamples,
    } : undefined,

    genome: me.genome ? {
      voice: safeGenomeVoice(me.genome),
      motivation: me.genome.motivation,
      primaryFear: me.genome.primaryFear,
      storyBeat: me.genome.storyBeat,
      totem: me.genome.totem,
      pacePerWeek: me.genome.pacePerWeek,
    } : undefined,

    venture: activeVenture ? {
      name: activeVenture.name,
      tagline: activeVenture.tagline,
      phase: activeVenture.phase,
      problem: activeVenture.problemId,
      region: activeVenture.region,
      wedge: activeVenture.wedge ? `${activeVenture.wedge.who} — ${activeVenture.wedge.pain}` : undefined,
      interviewsDone: activeVenture.interviews?.length,
      customers: activeVenture.metrics?.customers,
      mrr: activeVenture.metrics?.mrr,
      revenue: activeVenture.metrics?.revenue,
    } : undefined,

    recentBuilds: (builds.projects ?? []).slice(0, 4).map((p) => ({
      name: p.name,
      description: p.description,
    })),

    recentLessons: Object.values(s.progress ?? {})
      .filter((p) => p.status === "completed")
      .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
      .slice(0, 5)
      .map((p) => ({
        title: `${p.trackId}/${p.lessonId}`,
        trackId: p.trackId,
        scorePct: p.scorePct,
      })),

    recentLetters: (letters.letters ?? []).slice(0, 3).map((l) => ({
      title: l.title ?? "untitled",
      kind: l.reason,
    })),

    recentSketches: (sketch.boards ?? []).slice(0, 3).map((b) => ({
      title: b.title ?? "untitled canvas",
    })),

    activeGoals: (me.goals ?? []).filter((g) => g.status === "active").slice(0, 5).map((g) => g.text),

    dueFlashcards: s.dueCards ? s.dueCards().length : 0,

    shippedArtifacts: shipped,

    callerScope: scope,
  };

  // Trim irrelevant sections for narrow scopes to keep the prompt focused.
  if (scope === "letter" || scope === "sketch") {
    delete snap.recentBuilds;
    delete snap.dueFlashcards;
  }
  if (scope === "build") {
    delete snap.recentLetters;
    delete snap.recentSketches;
  }
  if (scope === "lesson" || scope === "sage") {
    delete snap.recentBuilds;
    delete snap.recentLetters;
    delete snap.recentSketches;
  }

  return snap;
}

// Async variant — same snapshot as the sync builder, plus the user's
// connection graph fetched from /api/v2/connections (60s in-memory
// cached). Use this from aiFetchWithBrain so AI calls see the
// relationships the user has drawn between artifacts.
export async function buildSiteContextSnapshotAsync(scope?: string): Promise<ReturnType<typeof buildSiteContextSnapshot>> {
  const snap = buildSiteContextSnapshot(scope);
  try {
    const { fetchUserConnectionsCached } = await import("@/lib/connections-client");
    const { computeInsights } = await import("@/lib/insights");
    const rows = await fetchUserConnectionsCached();
    if (rows.length > 0) {
      // Build local title lookup tables so we can hydrate IDs into
      // readable names ("Lentil Co." instead of nanoid suffix).
      const s = useStore.getState();
      const builds = useBuild.getState();
      const sketch = useSketch.getState();
      const letters = useLetters.getState();
      const titleFor = (kind: string, id: string): string | undefined => {
        switch (kind) {
          case "venture": return s.ventures.find((v) => v.id === id)?.name;
          case "build": return builds.projects.find((p) => p.id === id)?.name;
          case "sketch": return sketch.boards.find((b) => b.id === id)?.title;
          case "letter": return letters.letters.find((l) => l.id === id)?.title;
          default: return undefined;
        }
      };
      snap.connections = rows.slice(0, 20).map((r) => ({
        fromKind: r.from_kind,
        fromId: r.from_id,
        fromTitle: titleFor(r.from_kind, r.from_id),
        toKind: r.to_kind,
        toId: r.to_id,
        toTitle: titleFor(r.to_kind, r.to_id),
        label: r.label,
      }));

      // Surface graph-level patterns — same numbers the insights page
      // shows the user, so Sage can act on them by name.
      const summary = computeInsights(rows, {
        builds: builds.projects.map((b) => ({ id: b.id, name: b.name })),
        ventures: s.ventures.map((v) => ({ id: v.id, name: v.name })),
      });
      snap.insights = {
        topProblem: summary.topProblem ?? undefined,
        ventureFromSketch: summary.ventureFromSketch.length > 0 ? summary.ventureFromSketch : undefined,
        orphanBuilds: summary.orphanBuilds.length > 0 ? summary.orphanBuilds : undefined,
      };
    }
  } catch { /* connections are optional — never block the AI call */ }
  return snap;
}

function safeGenomeVoice(g: Parameters<typeof genomeVoiceInstruction>[0]): string | undefined {
  try {
    return genomeVoiceInstruction(g);
  } catch {
    return undefined;
  }
}
