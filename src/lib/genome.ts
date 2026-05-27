// The Sankofa Studio Genome — a deep profile that personalizes every interaction.
// Generated during onboarding and editable any time. Sage uses it. Layouts use it.
// Suggestions use it. Even tone of voice in the Companion uses it.

export type GenomeTrait =
  | "boldness"        // 0..1 — appetite for risk
  | "depth"           // 0..1 — prefers depth (slow, thorough) vs breadth (fast, exploratory)
  | "structure"       // 0..1 — prefers structured plans vs improvisation
  | "social"          // 0..1 — energized by people vs solo work
  | "abstract"        // 0..1 — prefers abstract theory vs concrete examples
  | "visual"          // 0..1 — learns via visuals vs words
  | "kinesthetic"     // 0..1 — learns by doing vs reading
  | "playful";        // 0..1 — playful tone vs serious tone

export type Genome = {
  traits: Record<GenomeTrait, number>; // each 0..1
  pacePerWeek: number; // hours of expected weekly engagement
  motivation: "impact" | "income" | "mastery" | "exit" | "team";
  primaryFear: "wasting-time" | "embarrassment" | "running-out-of-money" | "being-alone" | "wrong-problem";
  storyBeat: string; // 1-sentence story the user tells themselves
  totem: "Sankofa" | "Ananse" | "Mwindo" | "Sundiata" | "Khoisan" | "Phoenix"; // chosen totem influences visuals
};

export const DEFAULT_GENOME: Genome = {
  traits: { boldness: 0.5, depth: 0.5, structure: 0.5, social: 0.5, abstract: 0.5, visual: 0.5, kinesthetic: 0.5, playful: 0.5 },
  pacePerWeek: 8,
  motivation: "impact",
  primaryFear: "wrong-problem",
  storyBeat: "I'm building something only I can build because of where I come from.",
  totem: "Sankofa",
};

// Questions that produce a Genome. Lightweight; ≤ 60 seconds.
export type GenomeQuestion = {
  id: string;
  prompt: string;
  options: { label: string; effects: Partial<Record<GenomeTrait, number>>; meta?: Record<string, string> }[];
};

export const GENOME_QUESTIONS: GenomeQuestion[] = [
  {
    id: "weekend",
    prompt: "It's Saturday afternoon. The thing that energizes you most:",
    options: [
      { label: "Solo deep work — a hard problem, headphones on", effects: { social: -0.2, depth: +0.25, abstract: +0.1 } },
      { label: "Building or fixing something with my hands", effects: { kinesthetic: +0.3, visual: +0.1, structure: -0.05 } },
      { label: "A long conversation with someone interesting", effects: { social: +0.3, abstract: +0.1, depth: +0.05 } },
      { label: "Reading or watching to learn something new", effects: { depth: +0.2, abstract: +0.15, visual: +0.05 } },
    ],
  },
  {
    id: "speed",
    prompt: "When you start something new, you usually:",
    options: [
      { label: "Plan it carefully before I act", effects: { structure: +0.3, boldness: -0.1, depth: +0.1 } },
      { label: "Just start and figure it out", effects: { structure: -0.2, boldness: +0.25, playful: +0.1 } },
      { label: "Sketch it out visually first", effects: { visual: +0.3, structure: +0.05 } },
      { label: "Ask someone who's done it", effects: { social: +0.2, structure: +0.1 } },
    ],
  },
  {
    id: "fear",
    prompt: "Honestly — what scares you most about building a venture?",
    options: [
      { label: "Wasting years on the wrong problem", effects: { depth: +0.2, structure: +0.1 }, meta: { fear: "wrong-problem" } },
      { label: "Embarrassing myself in front of others", effects: { social: -0.1, boldness: -0.15 }, meta: { fear: "embarrassment" } },
      { label: "Running out of money", effects: { structure: +0.2 }, meta: { fear: "running-out-of-money" } },
      { label: "Doing it alone", effects: { social: +0.2 }, meta: { fear: "being-alone" } },
    ],
  },
  {
    id: "win",
    prompt: "If five years from now your venture is alive, what's the headline you'd want to read?",
    options: [
      { label: "We changed an industry / fixed something broken", effects: { boldness: +0.2, abstract: +0.1 }, meta: { motivation: "impact" } },
      { label: "We're profitable and the team is fed", effects: { structure: +0.2, social: +0.1 }, meta: { motivation: "income" } },
      { label: "We did the deepest work of our lives", effects: { depth: +0.25, abstract: +0.1 }, meta: { motivation: "mastery" } },
      { label: "We got acquired and started something new", effects: { boldness: +0.2 }, meta: { motivation: "exit" } },
      { label: "We built a team that loves working together", effects: { social: +0.25, playful: +0.15 }, meta: { motivation: "team" } },
    ],
  },
  {
    id: "totem",
    prompt: "Which figure from African / global myth do you most identify with?",
    options: [
      { label: "Sankofa — wisdom that goes back to retrieve what was forgotten", effects: { depth: +0.15 }, meta: { totem: "Sankofa" } },
      { label: "Ananse — the trickster spider who outwits the powerful", effects: { playful: +0.3, boldness: +0.1 }, meta: { totem: "Ananse" } },
      { label: "Mwindo — the small hero who survives by his wits", effects: { kinesthetic: +0.15, boldness: +0.2 }, meta: { totem: "Mwindo" } },
      { label: "Sundiata — the destined king who unified an empire", effects: { social: +0.2, structure: +0.15 }, meta: { totem: "Sundiata" } },
      { label: "The Phoenix — burns and rises again, stronger", effects: { boldness: +0.25, playful: +0.1 }, meta: { totem: "Phoenix" } },
    ],
  },
  {
    id: "pace",
    prompt: "How many hours a week can you realistically commit?",
    options: [
      { label: "2-5 hours", effects: {}, meta: { pace: "3" } },
      { label: "6-12 hours", effects: {}, meta: { pace: "9" } },
      { label: "12-20 hours", effects: {}, meta: { pace: "16" } },
      { label: "20+ hours — I want this to be the work", effects: { boldness: +0.1 }, meta: { pace: "25" } },
    ],
  },
  {
    id: "learn",
    prompt: "You're learning a hard new concept. You absorb it best when:",
    options: [
      { label: "Someone walks me through it with examples", effects: { social: +0.15, kinesthetic: +0.05 } },
      { label: "I see it diagrammed or simulated", effects: { visual: +0.3 } },
      { label: "I read and re-read until it clicks", effects: { depth: +0.2, abstract: +0.15 } },
      { label: "I have to teach it to someone else", effects: { social: +0.2, kinesthetic: +0.15 } },
    ],
  },
];

export function emptyAnswers(): Record<string, string> {
  return {};
}

export function computeGenome(answers: Record<string, string>): Genome {
  const g: Genome = JSON.parse(JSON.stringify(DEFAULT_GENOME));
  for (const q of GENOME_QUESTIONS) {
    const idx = parseInt(answers[q.id] ?? "-1");
    if (idx < 0) continue;
    const opt = q.options[idx];
    if (!opt) continue;
    for (const [k, v] of Object.entries(opt.effects)) {
      const key = k as GenomeTrait;
      g.traits[key] = Math.max(0, Math.min(1, g.traits[key] + (v as number)));
    }
    if (opt.meta?.motivation) g.motivation = opt.meta.motivation as Genome["motivation"];
    if (opt.meta?.fear) g.primaryFear = opt.meta.fear as Genome["primaryFear"];
    if (opt.meta?.totem) g.totem = opt.meta.totem as Genome["totem"];
    if (opt.meta?.pace) g.pacePerWeek = parseInt(opt.meta.pace);
  }
  return g;
}

// Translate a Genome into a one-line voice instruction for Sage / coaches.
export function genomeVoiceInstruction(g: Genome): string {
  const lines: string[] = [];
  if (g.traits.playful > 0.65) lines.push("Be warm and a little playful; use the occasional Ananse reference where it lands.");
  else lines.push("Be direct and warm. Skip filler.");
  if (g.traits.structure > 0.65) lines.push("Always end with a structured next step.");
  else if (g.traits.structure < 0.4) lines.push("Don't over-prescribe — leave room for improvisation.");
  if (g.traits.depth > 0.65) lines.push("Go deep before going wide; assume the learner can handle nuance.");
  if (g.traits.visual > 0.65) lines.push("Lean on diagrams, sketches, and visual metaphors when possible.");
  if (g.traits.kinesthetic > 0.65) lines.push("Prefer 'do this now' to 'consider this'.");
  if (g.traits.social < 0.4) lines.push("Don't push group exercises; the learner energizes alone.");
  switch (g.motivation) {
    case "impact": lines.push("Connect every move back to who'll be helped by it."); break;
    case "income": lines.push("Tie suggestions to revenue, runway, and breakeven."); break;
    case "mastery": lines.push("Honor the craft. Don't optimize for speed at the cost of depth."); break;
    case "exit": lines.push("Frame in terms of optionality, defensibility, acquirer narrative."); break;
    case "team": lines.push("Bring the team angle in often; remind them they're not solo."); break;
  }
  switch (g.primaryFear) {
    case "wrong-problem": lines.push("Reassure them they can change problems if evidence says so; this isn't a permanent commitment."); break;
    case "embarrassment": lines.push("Normalize early ugliness; brave-but-private experiments first."); break;
    case "running-out-of-money": lines.push("Show the cost of every recommendation; favor zero-cost validations."); break;
    case "being-alone": lines.push("Suggest one human contact (mentor, peer, customer) in every check-in."); break;
  }
  lines.push(`Their totem is ${g.totem} — they're drawn to that story; use it sparingly when meaningful.`);
  return lines.join(" ");
}

// Translate a Genome into a CSS variable bundle that subtly tilts the UI.
export function genomeAccent(g: Genome): { primary: string; accent: string } {
  if (g.totem === "Ananse") return { primary: "#f4a949", accent: "#9b6cff" };
  if (g.totem === "Mwindo") return { primary: "#d96444", accent: "#2cc295" };
  if (g.totem === "Sundiata") return { primary: "#6c8cff", accent: "#f4a949" };
  if (g.totem === "Phoenix") return { primary: "#d96444", accent: "#f4a949" };
  if (g.totem === "Khoisan") return { primary: "#9b6cff", accent: "#2cc295" };
  return { primary: "#2cc295", accent: "#f4a949" };
}

export function genomeSummary(g: Genome): string {
  const dominant = (Object.entries(g.traits).sort(([, a], [, b]) => b - a).slice(0, 2).map(([k]) => k));
  return `${dominant[0]}-driven, ${dominant[1]}-leaning · motivated by ${g.motivation} · totem: ${g.totem}`;
}
