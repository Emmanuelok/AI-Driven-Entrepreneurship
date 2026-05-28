// Interactive Brilliant/AoPS-class lessons. Each lesson is a sequence of
// "scenes" — a richer step type that includes Socratic dialogue, live
// simulations the student manipulates, and visible mastery growth.

export type SimScene = {
  kind: "sim-pendulum" | "sim-circuit" | "sim-waves" | "sim-titration" | "sim-supply-curve";
  prompt: string;
  guideQuestion: string; // The Socratic question to answer at the end
  acceptableAnswer?: { kind: "range"; min: number; max: number; unit?: string } | { kind: "regex"; pattern: string } | { kind: "open"; minWords: number };
  hint?: string;
};

export type SocraticScene = {
  kind: "socratic";
  intro: string; // The starting statement
  question: string; // The question Sage will ask
  expectedConcepts: string[]; // Concepts a good answer touches on
  followUpHints: string[]; // Used if the student needs nudging
};

export type ConceptScene = {
  kind: "concept";
  title: string;
  body: string; // markdown
  metaphor?: { story: string; image?: string };
};

export type CheckScene = {
  kind: "check";
  prompt: string;
  options: { label: string; correct: boolean; feedback: string }[];
};

export type ReflectScene = {
  kind: "reflect";
  prompt: string;
};

export type CelebrateScene = {
  kind: "celebrate";
  title: string;
  body: string;
  mastery: { concept: string; delta: number }[];
};

export type Scene = SimScene | SocraticScene | ConceptScene | CheckScene | ReflectScene | CelebrateScene;

export type InteractiveLesson = {
  id: string;
  trackId: string;
  title: string;
  subtitle: string;
  estMinutes: number;
  difficulty: 1 | 2 | 3 | 4 | 5;
  concepts: string[]; // concept ids touched by this lesson
  scenes: Scene[];
};

// ─────────────────────────────────────────────────────────────────────────────
// SEED LESSONS — three deep, interactive Brilliant/AoPS-class lessons.
// ─────────────────────────────────────────────────────────────────────────────

export const INTERACTIVE_LESSONS: InteractiveLesson[] = [
  {
    id: "intuit-derivatives",
    trackId: "stem-intuition",
    title: "Derivatives, felt in the bones",
    subtitle: "What if calculus started with a tro-tro speedometer instead of a limit?",
    estMinutes: 18,
    difficulty: 2,
    concepts: ["derivatives", "rate-of-change", "instantaneous-velocity", "secant-tangent"],
    scenes: [
      {
        kind: "concept",
        title: "The speedometer that doesn't exist",
        body: `Imagine your tro-tro from Accra to Kumasi has a broken speedometer.

You only know two things: the **time** since you started, and the **kilometers** travelled.

How would you compute your speed *right now* — not your average for the trip, your speed at this very moment?`,
        metaphor: { story: "Driver Kojo doesn't know his speed. He only knows: 'I left at 6:14am, and we're at the 87th kilometer.' Can you tell him?" },
      },
      {
        kind: "socratic",
        intro: "Think before you read on.",
        question: "If you had to estimate Kojo's current speed using only those two numbers (time and distance), what would you do?",
        expectedConcepts: ["average speed", "two points", "difference quotient", "smaller interval"],
        followUpHints: [
          "What if you measured the kilometer mark at 6:14am and again one minute later?",
          "What if you made that interval smaller and smaller?",
        ],
      },
      {
        kind: "sim-pendulum", // we'll reuse the lab sim, but with prompts
        prompt: "Here's a pendulum. Watch its position over time. Pause it at any moment and ask yourself: what's its instantaneous speed?",
        guideQuestion: "At the moment the pendulum is at its lowest point, is its speed maximum or zero? Type 'max' or 'zero'.",
        acceptableAnswer: { kind: "regex", pattern: "^max" },
        hint: "When something is changing position fastest, its speed is highest. Where on the swing is the bob moving fastest?",
      },
      {
        kind: "concept",
        title: "The trick: shrink the interval",
        body: `Here's the move. You compute the **average speed** over a small interval — say, the last second.

  $\\text{avg speed} = \\frac{\\text{distance covered in 1 sec}}{1 \\text{ sec}}$

Then you shrink that interval. 0.1 seconds. 0.001 seconds. As the interval gets smaller, the average speed gets closer and closer to the **instantaneous speed** at that exact moment.

That limit — the average over an infinitesimally small interval — *is* the derivative.`,
      },
      {
        kind: "check",
        prompt: "If $f(t) = 5t^2$ describes the tro-tro's position in km after $t$ hours, what is its speed at $t = 2$?",
        options: [
          { label: "10 km/h", correct: false, feedback: "Close, but think about what f'(t) is. f'(t) = 10t, so at t=2…" },
          { label: "20 km/h", correct: true, feedback: "Exactly. f'(t) = 10t, and at t=2, that's 20 km/h." },
          { label: "5 km/h", correct: false, feedback: "That would be the position at t=1. We're after the derivative at t=2." },
          { label: "40 km/h", correct: false, feedback: "Half of that — remember the derivative of t² is 2t, not t² itself." },
        ],
      },
      {
        kind: "socratic",
        intro: "Now your turn.",
        question: "If a cocoa-pod growth rate is f(t) = 3t² + 2t (in grams after t days), what does f'(t) tell us, and what is f'(5)?",
        expectedConcepts: ["derivative", "rate", "6t + 2", "32"],
        followUpHints: [
          "f'(t) is the *rate of change* of mass — i.e., how fast the pod is gaining weight per day.",
          "Apply the power rule: d/dt[3t²] = 6t, d/dt[2t] = 2.",
          "So f'(t) = 6t + 2. Now plug in t=5.",
        ],
      },
      {
        kind: "reflect",
        prompt: "Write one sentence: where else in your life have you instinctively computed a derivative without knowing it?",
      },
      {
        kind: "celebrate",
        title: "You felt it.",
        body: "You didn't just memorize a rule — you understood why the derivative is the **rate of change at a single moment**. That intuition is what most students never quite get, even after a semester of calculus.",
        mastery: [
          { concept: "derivatives", delta: 0.25 },
          { concept: "rate-of-change", delta: 0.3 },
          { concept: "instantaneous-velocity", delta: 0.2 },
        ],
      },
    ],
  },

  {
    id: "intuit-induction",
    trackId: "math-mastery",
    title: "Why induction works — domino-by-domino",
    subtitle: "An AoPS-grade walkthrough of mathematical induction, in 22 minutes.",
    estMinutes: 22,
    difficulty: 3,
    concepts: ["induction", "proof", "natural-numbers", "base-case", "inductive-step"],
    scenes: [
      {
        kind: "concept",
        title: "The infinite line of dominoes",
        body: `Picture a line of dominoes stretching to the horizon. You want to prove they will all fall.

You have only two tools.

**Tool 1.** You can push the first domino. (Push it.)
**Tool 2.** You can prove that the dominoes are arranged so each one falling makes the next one fall.

If you have both, you're done. The first falls. So the second falls. So the third. Forever.

This is mathematical induction.`,
      },
      {
        kind: "socratic",
        intro: "Try the leap before we generalize.",
        question: "Suppose I claim that for any natural number n, the sum $1 + 2 + 3 + \\dots + n = \\frac{n(n+1)}{2}$. How would you start a proof?",
        expectedConcepts: ["base case", "n=1", "inductive hypothesis", "inductive step"],
        followUpHints: [
          "Try n=1 first — is the formula true there?",
          "Yes! That's the base case. Now what's the *inductive* assumption?",
          "Assume it's true for n=k. Now show it's true for n=k+1.",
        ],
      },
      {
        kind: "check",
        prompt: "What is the **inductive hypothesis** in this proof?",
        options: [
          { label: "1 + 2 + ... + 1 = 1·2/2", correct: false, feedback: "That's the base case, not the inductive hypothesis." },
          { label: "Assume the formula is true for some n = k", correct: true, feedback: "Exactly. You're temporarily assuming the formula holds for an unknown k, in order to prove it then holds for k+1." },
          { label: "The formula is true for all n", correct: false, feedback: "That's the conclusion we're trying to prove, not the hypothesis." },
          { label: "The dominoes are made of wood", correct: false, feedback: "Heh — not quite. Try again." },
        ],
      },
      {
        kind: "socratic",
        intro: "Now the inductive step.",
        question: "Given $1 + 2 + \\dots + k = \\frac{k(k+1)}{2}$, show that $1 + 2 + \\dots + (k+1) = \\frac{(k+1)(k+2)}{2}$. Walk me through it.",
        expectedConcepts: ["add (k+1) to both sides", "factor (k+1)", "common factor", "(k+1)(k+2)/2"],
        followUpHints: [
          "Start by adding (k+1) to the left-hand side of your assumption.",
          "Now combine: k(k+1)/2 + (k+1) = (k+1) · [k/2 + 1].",
          "Simplify the bracket: k/2 + 1 = (k+2)/2.",
        ],
      },
      {
        kind: "concept",
        title: "The principle",
        body: `**Principle of Mathematical Induction.** Let $P(n)$ be a statement about natural number $n$. If:

1. $P(1)$ is true (base case), and
2. For every $k \\geq 1$, $P(k) \\Rightarrow P(k+1)$ (inductive step),

then $P(n)$ is true for **all** $n \\geq 1$.

That's it. That's the entire structure. The dominoes do the rest.`,
      },
      {
        kind: "check",
        prompt: "Prove: $1 + 3 + 5 + \\dots + (2n-1) = n^2$. Verify the base case n=1.",
        options: [
          { label: "1 = 1²", correct: true, feedback: "Right. Both sides equal 1. ✓" },
          { label: "0 = 0²", correct: false, feedback: "We start at n=1, not n=0." },
          { label: "1 + 3 = 4", correct: false, feedback: "That's n=2, not the base case." },
          { label: "It doesn't have a base case", correct: false, feedback: "Every induction proof needs one. Try n=1." },
        ],
      },
      {
        kind: "reflect",
        prompt: "In your own words: what makes induction stronger than just checking a lot of cases?",
      },
      {
        kind: "celebrate",
        title: "You held the dominoes.",
        body: "Most students learn induction as a ritual. You learned it as a *machine*. You can now wield it to prove things about all infinite natural numbers from two finite facts. That's wild.",
        mastery: [
          { concept: "induction", delta: 0.35 },
          { concept: "proof", delta: 0.25 },
          { concept: "natural-numbers", delta: 0.15 },
        ],
      },
    ],
  },

  {
    id: "intuit-supply-demand",
    trackId: "ai-for-your-field",
    title: "Why your tomato price moves",
    subtitle: "Supply and demand, taught with Tamale market data — and AI that watches your reasoning.",
    estMinutes: 20,
    difficulty: 2,
    concepts: ["supply-demand", "equilibrium-price", "elasticity", "shocks"],
    scenes: [
      {
        kind: "concept",
        title: "Two opposing forces, one price",
        body: `In Tamale Central Market, on a Tuesday morning, tomatoes cost ₵8 per crate.

Why ₵8? Not ₵5. Not ₵12.

Two forces are colliding:
- **Sellers** want the price high. The higher it is, the more crates they'd carry to market.
- **Buyers** want it low. The lower it is, the more crates they'd take home.

The price where these two forces *exactly cancel* — supply offered = demand wanted — is called the **equilibrium price**.

On Tuesday, that point is ₵8.`,
      },
      {
        kind: "sim-supply-curve",
        prompt: "Move the sliders below. The supply line tilts up (more crates if higher price). The demand line tilts down (more crates if lower price). Watch the equilibrium move.",
        guideQuestion: "If a heavy rain destroys 40% of the harvest, what happens to the equilibrium price? Type 'rises', 'falls', or 'no change'.",
        acceptableAnswer: { kind: "regex", pattern: "^ris" },
        hint: "Fewer crates available means the supply curve shifts left. Where does it now meet demand?",
      },
      {
        kind: "socratic",
        intro: "Now a harder one.",
        question: "If a new highway lets farmers in Bolgatanga reach Tamale market for the first time, what happens to the tomato equilibrium price — and why?",
        expectedConcepts: ["supply increases", "supply curve shifts right", "equilibrium price falls", "quantity rises"],
        followUpHints: [
          "Adding new sellers is a supply shift, not a demand shift. Which direction?",
          "More crates available at every price means supply curve shifts right.",
          "Where does the new supply meet the existing demand?",
        ],
      },
      {
        kind: "check",
        prompt: "Cooking gas prices triple. What is most likely to happen to **demand** for charcoal in Lagos?",
        options: [
          { label: "Demand falls", correct: false, feedback: "Usually charcoal is a substitute for gas — so demand should rise, not fall." },
          { label: "Demand rises", correct: true, feedback: "Right. When the price of a substitute (gas) rises, demand for the alternative (charcoal) typically rises." },
          { label: "Demand unchanged", correct: false, feedback: "Substitution effects do exist for cooking fuel." },
          { label: "Supply rises", correct: false, feedback: "We're asked about demand, not supply." },
        ],
      },
      {
        kind: "socratic",
        intro: "One more — about your venture.",
        question: "Your venture cuts post-harvest tomato spoilage from 35% to 10%. What does that do to the supply curve — and what does that mean for tomato sellers' incomes?",
        expectedConcepts: ["supply curve shifts right", "more crates reach market", "price falls slightly", "but volume sold rises", "net seller income depends on elasticity"],
        followUpHints: [
          "If 80% more crates make it to market each week, that's a supply increase.",
          "Supply rises → price falls slightly → BUT quantity sold rises a lot.",
          "Whether income net-rises depends on price elasticity. If demand is elastic, sellers win.",
        ],
      },
      {
        kind: "reflect",
        prompt: "How might your venture shift either the supply or demand curve in your target market? Write 2 sentences.",
      },
      {
        kind: "celebrate",
        title: "You read a market like an economist.",
        body: "You learned the two curves, the equilibrium, the effects of supply shocks, the substitution effect, and how your venture intervenes — all by reasoning, not memorizing. This is the foundation. Macroeconomics builds on it.",
        mastery: [
          { concept: "supply-demand", delta: 0.4 },
          { concept: "equilibrium-price", delta: 0.3 },
          { concept: "shocks", delta: 0.25 },
        ],
      },
    ],
  },
];

export function getInteractiveLesson(id: string) {
  return INTERACTIVE_LESSONS.find((l) => l.id === id);
}
