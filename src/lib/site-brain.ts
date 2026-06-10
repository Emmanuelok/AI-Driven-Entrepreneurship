// ─────────────────────────────────────────────────────────────────────────
// Sankofa Site Brain — a unified context block that gets prepended to
// every AI call so Claude grounds its answer in *this specific* user's
// situation: their venture, cohort, recent work, genome voice, language.
//
// Server side: `formatSiteContext(snap)` returns a markdown block ready
// to drop into a system prompt (we wrap it in cache_control: ephemeral
// at the call site so repeated calls with the same context hit the
// cache).
//
// Client side: see `src/lib/site-brain-snapshot.ts` for the helper
// that builds a snapshot from zustand stores.
//
// The contract is "best-effort" — every field is optional. Routes that
// don't pass anything still work; routes that pass partial data get a
// proportionally smaller context block. We never inject a generic
// stand-in ("you are an AI assistant") — the absence of context is
// information, too.
// ─────────────────────────────────────────────────────────────────────────

export type SiteContextSnapshot = {
  // Identity
  user?: {
    firstName?: string;
    fullName?: string;
    institution?: string;
    program?: string;
    year?: number;
    country?: string;
    primaryLanguage?: string;
    field?: string;
    level?: number;
    streak?: number;
    xp?: number;
  };
  // Discipline-specific context resolved from the user's field via
  // disciplines.ts. Gives every AI call authentic anchors instead of
  // a generic "studies X" label.
  discipline?: {
    school?: string;
    department?: string;
    suggestedVentureSeed?: string;
    aiOpportunities?: { title: string; why: string }[];
    localExamples?: string[];
  };
  // Studio Genome — how they like to be talked to
  genome?: {
    voice?: string;
    motivation?: string;
    primaryFear?: string;
    storyBeat?: string;
    totem?: string;
    pacePerWeek?: number;
  };
  // The venture they're actively building
  venture?: {
    name: string;
    tagline?: string;
    phase?: string;
    problem?: string;
    region?: string;
    interviewsDone?: number;
    customers?: number;
    mrr?: number;
    revenue?: number;
    wedge?: string;
  };
  // Cohort enrolment if any
  cohort?: { name: string; institution?: string; openAssignments?: number; nextDue?: string | null };
  // Recent activity surfaces
  recentBuilds?: { name: string; description?: string; mcpEnabled?: boolean }[];
  recentLessons?: { title: string; trackId?: string; scorePct?: number }[];
  recentLetters?: { title: string; kind?: string }[];
  recentSketches?: { title: string }[];
  // Goals / OKRs / SRS pressure
  activeGoals?: string[];
  dueFlashcards?: number;
  // Things they've already shipped (helps the AI compliment specifically)
  shippedArtifacts?: { kind: string; title: string }[];
  // Relationships the user has drawn across the platform — sketch →
  // venture, build → problem, etc. Trimmed to the 20 most recent so
  // the prompt doesn't bloat past a few hundred tokens. fromTitle /
  // toTitle are resolved client-side from local stores when possible
  // so Sage sees "Lentil Co. ← seeded from ← Tomato cold-chain" instead
  // of opaque IDs.
  connections?: {
    fromKind: string; fromId: string; fromTitle?: string;
    toKind: string; toId: string; toTitle?: string;
    label: string | null;
  }[];
  // Patterns surfaced from the connection graph — see lib/insights.ts.
  // These are the same numbers the /studio/connections/insights page
  // displays, so Sage and the user agree on the facts.
  insights?: {
    topProblem?: { id: string; degree: number };
    ventureFromSketch?: { id: string; name: string }[];
    orphanBuilds?: { id: string; name: string }[];
  };
  // Live Pulse Engine signals (see lib/pulse-engine.ts) — the same
  // numbers the dashboard shows. Lets every AI surface speak to the
  // user's actual momentum and recommend the same next moves the
  // platform does, instead of inventing parallel advice.
  pulse?: {
    momentum?: number;          // 0..100
    momentumTrend?: string;     // rising | steady | cooling
    learningVelocity?: number;  // 0..100
    topVentureHealth?: { name: string; score: number; staleDays: number };
    nextActions?: { title: string; reason: string }[];
  };
  // What route this is — lets the brain bias toward relevant sections
  // (e.g. the brain trims `recentBuilds` for venture-tab calls).
  callerScope?: string;
};

// Build the markdown block that goes into the system prompt. Returns
// empty string when the snapshot is empty — never injects a hollow
// scaffold.
export function formatSiteContext(snap: SiteContextSnapshot | null | undefined): string {
  if (!snap) return "";
  const lines: string[] = [];

  if (snap.user) {
    const u = snap.user;
    const bits = [
      u.firstName && `name: ${u.firstName}`,
      u.institution && `institution: ${u.institution}`,
      u.program && `program: ${u.program}`,
      u.country && `country: ${u.country}`,
      u.primaryLanguage && `primary language: ${u.primaryLanguage}`,
      u.field && `field: ${u.field}`,
      (u.level || u.xp) && `level ${u.level ?? 1} · ${u.xp ?? 0} XP`,
      u.streak && `${u.streak}-day streak`,
    ].filter(Boolean);
    if (bits.length) lines.push(`[USER]\n${bits.map((b) => `- ${b}`).join("\n")}`);
  }

  if (snap.discipline) {
    const d = snap.discipline;
    const parts: string[] = [];
    if (d.school) parts.push(`school: ${d.school}`);
    if (d.department) parts.push(`department: ${d.department}`);
    if (d.suggestedVentureSeed) parts.push(`discipline-grounded venture seed: ${d.suggestedVentureSeed}`);
    if (d.localExamples?.length) {
      parts.push(`local situations they recognize: ${d.localExamples.slice(0, 3).join(" · ")}`);
    }
    if (d.aiOpportunities?.length) {
      parts.push("3 high-leverage AI opportunities in their discipline:");
      for (const op of d.aiOpportunities.slice(0, 3)) {
        parts.push(`  · ${op.title} — ${op.why}`);
      }
    }
    if (parts.length) lines.push(`[DISCIPLINE]\n${parts.map((p) => p.startsWith("  ·") ? p : `- ${p}`).join("\n")}`);
  }

  if (snap.genome) {
    const g = snap.genome;
    const parts = [
      g.voice && `voice: ${g.voice}`,
      g.motivation && `motivation: ${g.motivation}`,
      g.primaryFear && `primary fear: ${g.primaryFear}`,
      g.storyBeat && `story they tell themselves: "${g.storyBeat}"`,
      g.totem && `totem: ${g.totem}`,
      g.pacePerWeek && `expected pace: ~${g.pacePerWeek}h/week`,
    ].filter(Boolean);
    if (parts.length) lines.push(`[STUDIO GENOME]\n${parts.map((p) => `- ${p}`).join("\n")}`);
  }

  if (snap.venture) {
    const v = snap.venture;
    const parts = [
      `name: ${v.name}`,
      v.tagline && `tagline: ${v.tagline}`,
      v.phase && `current phase: ${v.phase}`,
      v.problem && `problem: ${v.problem}`,
      v.region && `region: ${v.region}`,
      v.wedge && `wedge: ${v.wedge}`,
      v.interviewsDone !== undefined && `customer interviews done: ${v.interviewsDone}`,
      v.customers !== undefined && `paying customers: ${v.customers}`,
      v.mrr !== undefined && `MRR (USD): ${v.mrr}`,
    ].filter(Boolean);
    lines.push(`[ACTIVE VENTURE]\n${parts.map((p) => `- ${p}`).join("\n")}`);
  }

  if (snap.cohort) {
    const c = snap.cohort;
    const parts = [
      `cohort: ${c.name}`,
      c.institution && `institution: ${c.institution}`,
      c.openAssignments !== undefined && `open assignments: ${c.openAssignments}`,
      c.nextDue && `next due: ${c.nextDue}`,
    ].filter(Boolean);
    lines.push(`[COHORT]\n${parts.map((p) => `- ${p}`).join("\n")}`);
  }

  if (snap.recentBuilds?.length) {
    lines.push(`[RECENT BUILDS]\n${snap.recentBuilds.slice(0, 4).map((b) => `- ${b.name}${b.description ? `: ${b.description}` : ""}${b.mcpEnabled ? " (MCP server published)" : ""}`).join("\n")}`);
  }
  if (snap.recentLessons?.length) {
    lines.push(`[RECENT LESSONS]\n${snap.recentLessons.slice(0, 5).map((l) => `- ${l.title}${l.scorePct !== undefined ? ` (${Math.round(l.scorePct)}%)` : ""}`).join("\n")}`);
  }
  if (snap.recentLetters?.length) {
    lines.push(`[RECENT LETTERS]\n${snap.recentLetters.slice(0, 3).map((l) => `- ${l.title}${l.kind ? ` (${l.kind})` : ""}`).join("\n")}`);
  }
  if (snap.recentSketches?.length) {
    lines.push(`[RECENT SKETCHES]\n${snap.recentSketches.slice(0, 3).map((s) => `- ${s.title}`).join("\n")}`);
  }
  if (snap.activeGoals?.length) {
    lines.push(`[ACTIVE GOALS]\n${snap.activeGoals.slice(0, 5).map((g) => `- ${g}`).join("\n")}`);
  }
  if (snap.dueFlashcards !== undefined && snap.dueFlashcards > 0) {
    lines.push(`[SRS]\n- ${snap.dueFlashcards} flashcards due today`);
  }
  if (snap.shippedArtifacts?.length) {
    lines.push(`[SHIPPED]\n${snap.shippedArtifacts.slice(0, 4).map((a) => `- ${a.kind}: ${a.title}`).join("\n")}`);
  }
  if (snap.connections?.length) {
    // Render with titles when we have them, fallback to short IDs.
    // The shape carries enough that Sage can write things like
    // "your Lentil Co. venture grew out of the Tomato cold-chain sketch
    // — that link suggests…".
    const rendered = snap.connections.slice(0, 20).map((c) => {
      const verb = c.label ? ` ${c.label} →` : " →";
      const from = c.fromTitle ? `${c.fromKind} "${c.fromTitle}"` : `${c.fromKind}:${c.fromId.slice(0, 12)}`;
      const to = c.toTitle ? `${c.toKind} "${c.toTitle}"` : `${c.toKind}:${c.toId.slice(0, 12)}`;
      return `- ${from}${verb} ${to}`;
    }).join("\n");
    lines.push(`[CONNECTIONS]\n${rendered}`);
  }

  if (snap.insights) {
    const i = snap.insights;
    const bits: string[] = [];
    if (i.topProblem) bits.push(`- most-connected problem: "${i.topProblem.id}" (${i.topProblem.degree} edges) — they keep returning to it`);
    if (i.ventureFromSketch?.length) {
      const names = i.ventureFromSketch.slice(0, 3).map((v) => `"${v.name}"`).join(", ");
      bits.push(`- ventures with sketch ancestry (${i.ventureFromSketch.length}): ${names}`);
    }
    if (i.orphanBuilds?.length) {
      const names = i.orphanBuilds.slice(0, 3).map((b) => `"${b.name}"`).join(", ");
      bits.push(`- ${i.orphanBuilds.length} build${i.orphanBuilds.length === 1 ? "" : "s"} sitting with no connections: ${names}`);
    }
    if (bits.length > 0) lines.push(`[GRAPH INSIGHTS]\n${bits.join("\n")}`);
  }

  if (snap.pulse) {
    const p = snap.pulse;
    const bits: string[] = [];
    if (p.momentum !== undefined) bits.push(`- momentum: ${p.momentum}/100${p.momentumTrend ? ` (${p.momentumTrend})` : ""}`);
    if (p.learningVelocity !== undefined) bits.push(`- learning velocity (7d): ${p.learningVelocity}/100`);
    if (p.topVentureHealth) {
      const v = p.topVentureHealth;
      bits.push(`- venture health: "${v.name}" ${v.score}/100${v.staleDays > 2 ? ` — quiet for ${v.staleDays} days` : ""}`);
    }
    if (p.nextActions?.length) {
      bits.push("- the platform's live engine is already recommending these next moves (align with them; don't invent a parallel plan):");
      for (const a of p.nextActions.slice(0, 3)) bits.push(`  · ${a.title} — ${a.reason}`);
    }
    if (bits.length > 0) lines.push(`[LIVE PULSE]\n${bits.join("\n")}`);
  }

  if (lines.length === 0) return "";

  const language = snap.user?.primaryLanguage;
  const firstName = snap.user?.firstName ?? "the student";

  // Header that tells the model HOW to use the context. Without these
  // instructions Claude often acknowledges the context once and then
  // ignores it.
  const header = `[SANKOFA CONTEXT — ground every answer in the user's actual situation; do NOT respond generically]
You are an assistant inside Sankofa Studio, a learning + venture-building platform for African and developing-world tertiary students. The fields below describe ${firstName} as they exist on the platform right now. Use them:

- Address them by first name when natural.${language && language !== "English" ? `\n- Their primary language is ${language}. When they switch into it (or write Pidgin/code-switch), follow their lead; default replies stay in English unless they wrote in another language.` : ""}
- Reference their active venture, cohort, builds, or recent lessons when relevant. Specific beats generic every time.
- Honor their Studio Genome voice — match the tone and motivation it describes.
- Do not introduce yourself, do not say "as an AI assistant", do not restate Sankofa's mission. Just help.
- If the user asks something the context contradicts, trust the user (the context is a snapshot and may be stale).`;

  return `${header}\n\n${lines.join("\n\n")}\n[/SANKOFA CONTEXT]`;
}

// Convenience: drop into Anthropic system text. Returns "" when empty.
// Pair with `cache_control: { type: "ephemeral" }` so repeated calls
// hit the cache across the same user's session.
export function siteSystemBlock(snap: SiteContextSnapshot | null | undefined): string {
  const block = formatSiteContext(snap);
  return block ? `${block}\n\n` : "";
}

// Pull the snapshot off a request body without crashing on malformed
// input. Server routes call this and forward to siteSystemBlock.
export function readSiteContext(body: unknown): SiteContextSnapshot | undefined {
  if (!body || typeof body !== "object") return undefined;
  const v = (body as { siteContext?: unknown }).siteContext;
  if (!v || typeof v !== "object") return undefined;
  return v as SiteContextSnapshot;
}
