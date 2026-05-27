// Real, gradeable lesson content. Each lesson is a sequence of "steps":
// reading, multiple choice, free response, code, fill-in.

export type Step =
  | { kind: "read"; html: string }
  | { kind: "mcq"; question: string; options: string[]; correctIndex: number; explanation: string }
  | { kind: "fill"; question: string; answer: string | number; tolerance?: number; explanation: string }
  | { kind: "code"; prompt: string; starter: string; expectedOutputIncludes: string[]; hint: string }
  | { kind: "reflect"; prompt: string }
  | { kind: "drag"; question: string; items: string[]; correctOrder: number[]; explanation: string };

export type LessonContent = {
  id: string;
  title: string;
  intro: string;
  estMinutes: number;
  steps: Step[];
};

export const LESSON_CONTENT: Record<string, LessonContent> = {
  "py-1": {
    id: "py-1",
    title: "Your first Python script — a M-Pesa expense tracker",
    intro:
      "By the end of this lesson, you'll write a working Python script that tracks today's M-Pesa transactions and tells you your end-of-day balance. No prior coding required.",
    estMinutes: 18,
    steps: [
      {
        kind: "read",
        html: `<h3>What is a variable?</h3>
<p>A <strong>variable</strong> is a labelled box that holds a value. When you write:</p>
<pre><code>balance = 200</code></pre>
<p>You created a box called <code>balance</code> and put the number 200 inside it. You can change what's in the box at any time:</p>
<pre><code>balance = balance - 15  # bought waakye</code></pre>
<p>Now <code>balance</code> holds 185.</p>`,
      },
      {
        kind: "mcq",
        question: "After running these two lines, what does `balance` hold?\n\n`balance = 100`\n`balance = balance + 50`",
        options: ["100", "150", "50", "Error"],
        correctIndex: 1,
        explanation: "The second line takes the current value (100), adds 50, and puts 150 back into `balance`.",
      },
      {
        kind: "read",
        html: `<h3>Lists and loops</h3>
<p>A <strong>list</strong> holds multiple things in order. A <strong>for loop</strong> walks through them one by one.</p>
<pre><code>transactions = [200, -15, -3.5, -25]
for t in transactions:
    print(t)</code></pre>
<p>This prints each number on its own line. The variable <code>t</code> takes each value in turn.</p>`,
      },
      {
        kind: "code",
        prompt: "Write code that sums all the transactions in this list and prints the total. Use a `for` loop.",
        starter: `transactions = [200, -15, -3.5, -25, -10, 50]

total = 0
# add each transaction to total
for t in transactions:
    pass  # replace this

print(f"Total: {total}")
`,
        expectedOutputIncludes: ["Total: 196.5"],
        hint: "Replace `pass` with `total = total + t` or the shorter `total += t`.",
      },
      {
        kind: "fill",
        question: "How many transactions are in the list `[200, -15, -3.5, -25, -10, 50]`?",
        answer: 6,
        explanation: "Count them: 200, -15, -3.5, -25, -10, 50. That's six items.",
      },
      {
        kind: "reflect",
        prompt:
          "What's one thing in your daily life you could track with a Python script like this? (Could be expenses, study hours, deliveries, anything you record repeatedly.)",
      },
    ],
  },

  "circuits-1": {
    id: "circuits-1",
    title: "Why electrons move (without scary equations)",
    intro:
      "An intuition-first journey through electric current. By the end, you'll understand Ohm's law without solving a single equation.",
    estMinutes: 22,
    steps: [
      {
        kind: "read",
        html: `<h3>The water analogy that actually works</h3>
<p>Imagine a high water tank connected by a pipe to an empty bucket. Water flows down because of the height difference. That height difference is <strong>voltage</strong> — the pressure that wants to make things flow.</p>
<p>The amount of water flowing through the pipe each second is the <strong>current</strong>.</p>
<p>If the pipe is narrow, less water flows. That narrowness is <strong>resistance</strong>.</p>`,
      },
      {
        kind: "mcq",
        question: "In our water analogy, what corresponds to a long, narrow pipe?",
        options: ["High voltage", "High current", "High resistance", "A short circuit"],
        correctIndex: 2,
        explanation: "A narrow pipe restricts water flow — exactly what resistance does to electric current.",
      },
      {
        kind: "read",
        html: `<h3>Ohm's law in plain English</h3>
<p>If you double the voltage (pressure), you double the current — assuming resistance stays the same.</p>
<p>If you double the resistance (narrower pipe), the current halves — assuming voltage stays the same.</p>
<p>That's it. <em>V = I × R</em> is just a tidy way to write what your intuition already knows.</p>`,
      },
      {
        kind: "fill",
        question:
          "If a 12V battery is connected to a 4Ω resistor, what is the current (in amps)? Use V = I × R.",
        answer: 3,
        explanation: "I = V/R = 12/4 = 3A.",
      },
      {
        kind: "drag",
        question: "Drag these in order, from highest voltage to lowest, to keep current flowing the same direction:",
        items: ["Battery + terminal (high)", "Wire", "Resistor", "Battery − terminal (low)"],
        correctOrder: [0, 1, 2, 3],
        explanation: "Voltage drops across the resistor as electrons flow from + (high potential) to − (low potential).",
      },
      {
        kind: "reflect",
        prompt: "Why does your phone get hot when it's charging fast? (Hint: think about resistance and energy dissipation.)",
      },
    ],
  },

  "v-1": {
    id: "v-1",
    title: "Picking a problem you'll actually care about in 5 years",
    intro:
      "Most founders fail because they pick a problem they got bored of in 6 months. We'll find one that will hold you for the long haul.",
    estMinutes: 25,
    steps: [
      {
        kind: "read",
        html: `<h3>The Problem-Founder Fit canvas</h3>
<p>Three questions to ask before you commit to a problem:</p>
<ol>
<li><strong>Have I lived this?</strong> (or someone in my immediate community has)</li>
<li><strong>Do I have unfair access?</strong> (a network, a skill, a context others can't replicate)</li>
<li><strong>Would I still care if it took 10 years?</strong></li>
</ol>
<p>If you can't say "yes, yes, yes" to all three — keep looking.</p>`,
      },
      {
        kind: "mcq",
        question: "Which of these is the strongest signal of problem-founder fit?",
        options: [
          "It's a huge market according to a McKinsey report",
          "My uncle runs a co-op that loses money on this every month",
          "Three other startups are doing something similar",
          "I read about it in TechCrunch yesterday",
        ],
        correctIndex: 1,
        explanation: "Personal proximity beats reports. Your uncle's co-op gives you 100 free customer interviews and intuition no consultant can match.",
      },
      {
        kind: "read",
        html: `<h3>The 5-year test</h3>
<p>Building a venture is years, not months. The startup graveyard is full of founders who picked a problem because it sounded interesting at a hackathon.</p>
<p>Imagine yourself five years from today, still working on this. Still talking to the same kinds of customers. Still solving the same category of pain.</p>
<p>Are you proud? Energized? Curious to dig deeper? <strong>Yes</strong> → good. <strong>Bored?</strong> → keep looking.</p>`,
      },
      {
        kind: "reflect",
        prompt: "Pick two problems from the Sankofa Problem Hub. For each, answer the three problem-founder-fit questions honestly. Which one wins?",
      },
    ],
  },

  "induct-1": {
    id: "induct-1",
    title: "The art of mathematical induction",
    intro: "Induction is just dominoes — but used to prove statements that hold for every positive integer. By the end you'll prove three classic identities.",
    estMinutes: 35,
    steps: [
      {
        kind: "read",
        html: `<h3>Induction = dominoes</h3>
<p>You want to show domino #n falls, for every n. You do two things:</p>
<ol>
<li><strong>Base case:</strong> show domino #1 falls.</li>
<li><strong>Inductive step:</strong> show that <em>if</em> domino #k falls, then domino #k+1 also falls.</li>
</ol>
<p>Conclusion: domino #1 falls (base), so #2 falls (step), so #3 falls (step), ... so every domino falls.</p>`,
      },
      {
        kind: "read",
        html: `<h3>Worked example</h3>
<p>Prove: $1 + 2 + 3 + \\dots + n = \\frac{n(n+1)}{2}$.</p>
<p><strong>Base.</strong> n=1: LHS = 1, RHS = 1·2/2 = 1. ✓</p>
<p><strong>Step.</strong> Assume true for n=k. Then for n=k+1:</p>
<p>$1 + 2 + \\dots + k + (k+1) = \\frac{k(k+1)}{2} + (k+1) = \\frac{(k+1)(k+2)}{2}$</p>
<p>That matches the formula at n=k+1. ✓ QED.</p>`,
      },
      {
        kind: "fill",
        question: "Using the formula 1+2+...+n = n(n+1)/2, what is the sum 1+2+...+100?",
        answer: 5050,
        explanation: "n=100 → 100·101/2 = 5050. (Same trick young Gauss famously used.)",
      },
      {
        kind: "mcq",
        question: "Which is NOT a required part of an induction proof?",
        options: ["Base case", "Inductive step", "Stating the hypothesis", "Drawing a picture"],
        correctIndex: 3,
        explanation: "Pictures help intuition but aren't required. The three required parts are: base, statement of inductive hypothesis, inductive step.",
      },
      {
        kind: "reflect",
        prompt: "Try proving 1 + 3 + 5 + ... + (2n−1) = n² on paper. What's the base case? What does the inductive step look like?",
      },
    ],
  },

  "agri-ai": {
    id: "agri-ai",
    title: "AI for the smallholder farmer",
    intro:
      "How AI changes the work of African farmers — from satellite-driven planting decisions to vision-graded produce at the farm gate.",
    estMinutes: 30,
    steps: [
      {
        kind: "read",
        html: `<h3>Three places AI now lives on the farm</h3>
<ol>
<li><strong>Before planting:</strong> hyperlocal weather models fused with soil moisture data tell a smallholder <em>'don't plant maize this week — the rains won't come until day 19.'</em> Delivered as a 30-second voice note in Twi.</li>
<li><strong>During growth:</strong> computer vision on a $50 phone identifies cassava mosaic disease from a single leaf photo, before it spreads to the whole farm.</li>
<li><strong>At harvest:</strong> vision-based quality grading at the farm gate matches produce to verified buyers <em>before</em> the crop spoils. Cuts post-harvest loss from 35% to under 10%.</li>
</ol>`,
      },
      {
        kind: "mcq",
        question: "Which of these would have the highest immediate impact on a Northern Ghana tomato co-op?",
        options: [
          "A satellite-based 30-day weather forecast app",
          "A vision-based produce grading app + verified-buyer matching",
          "A blockchain-based farm registry",
          "A drone-based pest scanner",
        ],
        correctIndex: 1,
        explanation: "Post-harvest loss is the biggest single source of income destruction for tomato co-ops. The other tools are useful but lower-impact for this specific problem.",
      },
      {
        kind: "read",
        html: `<h3>Why this is now possible</h3>
<p>Three things changed in the last 24 months:</p>
<ul>
<li>Foundation vision models can now reach senior-agronomist-level accuracy on phone-grade photos.</li>
<li>African-language voice (TTS + STT) crossed the usability threshold for Twi, Swahili, Yoruba, Hausa.</li>
<li>$50 Android phones now have enough RAM to run small models locally — critical for areas with patchy 2G.</li>
</ul>
<p>Five years ago, all three needed a datacenter. Today, they fit in a pocket.</p>`,
      },
      {
        kind: "reflect",
        prompt: "If you ran a 28-farmer tomato co-op in Yendi tomorrow, which of these three AI layers would you build first — and why?",
      },
    ],
  },
};

export function getLessonContent(id: string) {
  return LESSON_CONTENT[id];
}
