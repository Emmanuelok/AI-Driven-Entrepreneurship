export type Lesson = {
  id: string;
  title: string;
  minutes: number;
  kind: "concept" | "interactive" | "code" | "lab" | "venture";
  summary: string;
};

export type Track = {
  id: string;
  title: string;
  tagline: string;
  pillar: "STEM Intuition" | "Mathematical Mastery" | "Coding Craft" | "AI for Your Field" | "Venture Building";
  level: "Foundation" | "Intermediate" | "Advanced";
  hours: number;
  color: string;
  lessons: Lesson[];
};

export const TRACKS: Track[] = [
  {
    id: "stem-intuition",
    title: "Seeing Through Systems",
    tagline: "Build intuition for how the physical world works — circuits, forces, waves, code.",
    pillar: "STEM Intuition",
    level: "Foundation",
    hours: 42,
    color: "#2cc295",
    lessons: [
      { id: "circuits-1", title: "Why electrons move (without scary equations)", minutes: 18, kind: "interactive", summary: "Drag-and-drop circuit playground." },
      { id: "force-1", title: "Forces in a Lagos traffic jam", minutes: 22, kind: "concept", summary: "Newton's laws through honking taxis." },
      { id: "waves-1", title: "Hearing the difference between a kora and a guitar", minutes: 25, kind: "interactive", summary: "Fourier intuition via local instruments." },
      { id: "logic-1", title: "Boolean logic = market haggling", minutes: 15, kind: "concept", summary: "AND/OR/NOT from a mama-put pricing rules." },
    ],
  },
  {
    id: "math-mastery",
    title: "The Problem-Solving Mind",
    tagline: "AoPS-grade depth: olympiad combinatorics, abstract algebra, real analysis — built up from scratch.",
    pillar: "Mathematical Mastery",
    level: "Advanced",
    hours: 180,
    color: "#f4a949",
    lessons: [
      { id: "induct-1", title: "The art of mathematical induction", minutes: 35, kind: "concept", summary: "Master proof by induction with 12 worked problems." },
      { id: "combo-1", title: "Counting without overcounting", minutes: 40, kind: "interactive", summary: "Stars-and-bars, bijections, double-counting." },
      { id: "number-1", title: "Why prime numbers are everything", minutes: 50, kind: "concept", summary: "From Euclid to RSA." },
    ],
  },
  {
    id: "coding-craft",
    title: "Code That Ships",
    tagline: "Codecademy-style, but you ship a real working tool by lesson 4.",
    pillar: "Coding Craft",
    level: "Foundation",
    hours: 60,
    color: "#6c8cff",
    lessons: [
      { id: "py-1", title: "Your first Python script — a M-Pesa expense tracker", minutes: 20, kind: "code", summary: "Run code in the browser. No setup." },
      { id: "py-2", title: "Loops by sorting jollof rice orders", minutes: 25, kind: "code", summary: "for/while loops with a real lunch-counter dataset." },
      { id: "web-1", title: "Build a WhatsApp-style chat UI in 30 min", minutes: 30, kind: "code", summary: "HTML/CSS/JS from zero to deployed." },
      { id: "ai-1", title: "Wire a Claude API call into your tool", minutes: 25, kind: "code", summary: "First contact with foundation models." },
    ],
  },
  {
    id: "ai-for-your-field",
    title: "AI for Your Field",
    tagline: "You're studying agriculture / law / history / medicine / fashion — here's how AI changes everything you'll do.",
    pillar: "AI for Your Field",
    level: "Intermediate",
    hours: 35,
    color: "#d96444",
    lessons: [
      { id: "agri-ai", title: "AI for the smallholder farmer", minutes: 30, kind: "concept", summary: "Vision-graded produce, voice-bot extension officers, climate forecasting." },
      { id: "law-ai", title: "AI for the African lawyer", minutes: 30, kind: "concept", summary: "Case-law RAG, contract review in Pidgin, access-to-justice bots." },
      { id: "health-ai", title: "AI for the community health worker", minutes: 30, kind: "concept", summary: "Multimodal triage, drug-interaction checks, maternal monitoring." },
      { id: "creative-ai", title: "AI for the kente-pattern designer", minutes: 30, kind: "concept", summary: "Generative design, rights protection, global distribution." },
    ],
  },
  {
    id: "venture-building",
    title: "Classroom to Creator",
    tagline: "Pick a real local problem. Validate it. Build the MVP. Get paying customers. We walk you through every step.",
    pillar: "Venture Building",
    level: "Advanced",
    hours: 120,
    color: "#2cc295",
    lessons: [
      { id: "v-1", title: "Picking a problem you'll actually care about in 5 years", minutes: 25, kind: "venture", summary: "Problem-founder fit canvas." },
      { id: "v-2", title: "Customer discovery — 20 interviews in 14 days", minutes: 45, kind: "venture", summary: "Scripts, recording, synthesis with AI." },
      { id: "v-3", title: "Build an MVP in a weekend — even if you can't code", minutes: 90, kind: "lab", summary: "No-code + AI co-pilot." },
      { id: "v-4", title: "Pitch like a YC partner — and survive Q&A", minutes: 35, kind: "venture", summary: "AI pitch coach drills you on hostile questions." },
      { id: "v-5", title: "Your first 10 paying customers", minutes: 60, kind: "venture", summary: "Distribution playbook for African markets." },
    ],
  },
];

export function getTrack(id: string) {
  return TRACKS.find((t) => t.id === id);
}
