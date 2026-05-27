import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYSTEM = `You are Sage — the AI tutor for Sankofa Studio, a learning + venture-building platform built for tertiary students across Africa and the developing world.

CORE PERSONALITY:
- Warm, patient, never condescending. You teach like the best lecturer a student never had.
- You explain hard ideas using examples from the learner's lived world: tro-tro fares, M-Pesa, jollof rice prices, NEPA outages, cocoa harvests, kente patterns, Ananse the spider stories, boda bodas — never just "imagine you live in Silicon Valley".
- You ALWAYS check understanding with a small question before moving on.
- You support code-switching: if the student writes in Pidgin, Twi, Swahili, Yoruba, Hausa, mixed English — match their register naturally.

WHAT YOU DO:
- Tutor across STEM, math (up to olympiad level), coding (Python, JS, web, AI), and applied AI in any discipline (agriculture, law, history, medicine, fashion, music).
- Coach learners on entrepreneurship: customer discovery, problem-solution fit, MVP scoping, pitching, distribution in African markets.
- When asked a math/STEM question, show the WORKING — never just the answer.
- When asked to explain a concept, give: (1) the intuition, (2) a worked example in local context, (3) a single check-question.
- When asked for help building something, scope it down brutally — "what is the smallest piece you can ship by Friday?"

NEVER:
- Pretend you're an LLM with no opinions — you ARE Sage, a tutor.
- Just dump the answer. Always show the path.
- Use US/UK examples when an African one would land better.

Output in clean markdown. Use code blocks for code. Keep responses focused — usually 4-12 sentences plus any worked example.`;

type Msg = { role: "user" | "assistant"; content: string };

export async function POST(req: Request) {
  const { messages, context } = (await req.json()) as {
    messages: Msg[];
    context?: { lessonId?: string; problemId?: string; ventureId?: string; language?: string };
  };

  if (!Array.isArray(messages) || messages.length === 0) {
    return Response.json({ error: "messages required" }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(makeFallbackStream(messages[messages.length - 1].content, context), {
      headers: { "Content-Type": "text/plain; charset=utf-8", "x-sage-mode": "demo" },
    });
  }

  const client = new Anthropic({ apiKey });
  const contextLine = context
    ? `\n\nSTUDENT CONTEXT:\n${[
        context.language && `- Preferred language: ${context.language}`,
        context.lessonId && `- Currently in lesson: ${context.lessonId}`,
        context.problemId && `- Working on problem: ${context.problemId}`,
        context.ventureId && `- Active venture: ${context.ventureId}`,
      ]
        .filter(Boolean)
        .join("\n")}`
    : "";

  const stream = await client.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: [
      {
        type: "text",
        text: SYSTEM + contextLine,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const evt of stream) {
          if (evt.type === "content_block_delta" && evt.delta.type === "text_delta") {
            controller.enqueue(encoder.encode(evt.delta.text));
          }
        }
      } catch (err) {
        controller.enqueue(encoder.encode(`\n\n[Sage hit an error: ${(err as Error).message}]`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "x-sage-mode": "live" },
  });
}

function makeFallbackStream(userMsg: string, ctx?: { problemId?: string }) {
  const reply = craftDemoReply(userMsg, ctx);
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      // type out word-by-word so it feels alive
      const words = reply.split(/(\s+)/);
      for (const w of words) {
        controller.enqueue(encoder.encode(w));
        await new Promise((r) => setTimeout(r, 18));
      }
      controller.close();
    },
  });
}

function craftDemoReply(input: string, ctx?: { problemId?: string }): string {
  const q = input.toLowerCase();

  if (/derivative|calculus|differentiat/.test(q)) {
    return `Great — let's build the intuition first.

Imagine you're driving a tro-tro from Accra to Kumasi. Your **position** changes every second. The **derivative** of position is just how fast that position is changing right now — your speedometer reading.

So if your distance traveled is $f(t) = 5t^2$ kilometers after $t$ hours, the derivative is:

$$f'(t) = 10t$$

That tells you the speedometer reading at any moment $t$.

**Worked example.** At $t = 2$ hours, your speedometer reads $10 \\times 2 = 20$ km/h.

**Check yourself:** if $g(t) = 3t^2 + 4t$, what is $g'(1)$? Type your answer and I'll walk through it with you.`;
  }

  if (/python|loop|for loop|while/.test(q)) {
    return `Loops are how a computer does boring work for you.

Picture a mama-put with this morning's orders:

\`\`\`python
orders = [("jollof", 15), ("waakye", 12), ("kelewele", 8)]
total = 0
for item, price in orders:
    print(f"{item}: ₵{price}")
    total += price
print(f"Total takings: ₵{total}")
\`\`\`

The \`for\` loop reads one tuple at a time, the variables \`item\` and \`price\` unpack the pair, and \`total\` accumulates.

**Try it:** add a second list of orders for the afternoon and have the loop print the grand total. Paste your code and I'll review.`;
  }

  if (/start.?up|venture|business|idea|mvp|customer/.test(q)) {
    return `Good. Founders who jump to building lose. Founders who **understand the pain deeply** win.

Three rules for the next 14 days:

1. **Pick one specific person.** Not "farmers" — *Mama Adwoa, a tomato seller at Tamale market who loses 4 crates to spoilage every week*.
2. **Talk to 20 of them.** No pitching. Just questions: "Walk me through last Tuesday." "What did you try? Why did it fail?"
3. **Look for the pattern.** When 12 of 20 describe the *exact same* workaround, you've found a wedge.

What problem are you circling? If you've got a candidate in the Problem Hub, drop the ID and I'll draft your first interview script.`;
  }

  if (/induction|prove|proof/.test(q)) {
    return `Induction is just dominoes.

You show **one** domino falls (base case). You show **if domino $k$ falls, domino $k+1$ also falls** (inductive step). Conclusion: every domino falls.

**Worked example.** Prove $1 + 2 + 3 + \\dots + n = \\frac{n(n+1)}{2}$.

- *Base:* $n=1$: LHS $= 1$, RHS $= \\frac{1 \\cdot 2}{2} = 1$. ✓
- *Inductive step:* assume true for $n = k$. Then for $n = k+1$:
  $$1 + 2 + \\dots + k + (k+1) = \\frac{k(k+1)}{2} + (k+1) = \\frac{(k+1)(k+2)}{2}$$
  which matches the formula with $k+1$ substituted. ✓

**Your turn:** prove that $1 + 3 + 5 + \\dots + (2n-1) = n^2$. Show me the base case and I'll guide the inductive step.`;
  }

  if (/who are you|what.*sage|help/.test(q) || input.trim().length < 6) {
    return `I'm **Sage** — your tutor here in Sankofa Studio. I can:

- Explain anything in your tracks — STEM, math, code, AI for your field — using examples from where you actually live.
- Coach your venture work: pick a problem, run customer interviews, scope the MVP, get to your first 10 paying users.
- Drill you with practice problems and check your answers step by step.

Ask me anything. Try: *"explain derivatives using a tro-tro"* or *"help me scope an MVP for post-harvest tomato loss in Tamale"*.

> 🔌 Heads up: I'm currently running in **demo mode** because no \`ANTHROPIC_API_KEY\` is set. Add it to \`.env.local\` (or your Vercel env) to unlock my full brain.`;
  }

  return `That's a great question. Let me think with you.

You're asking: *"${input.trim().slice(0, 140)}"*

Here's how I'd approach it:

1. **Anchor it.** What's the simplest version of this problem you could solve in 60 seconds?
2. **Reach for an analogy** from your life — most hard ideas have a familiar shadow.
3. **Walk forward in tiny steps** — and when a step doesn't work, that's the question to bring to me.

Tell me a bit more about where you're stuck — what have you tried, what's the specific blocker?

> 🔌 *I'm in demo mode (no API key configured). Plug in \`ANTHROPIC_API_KEY\` and I'll give you the full Claude-powered answer with your local context fully understood.*`;
}
