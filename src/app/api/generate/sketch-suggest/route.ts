import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";

type Body = { prompt: string; content: string };

export async function POST(req: Request) {
  const body = (await req.json()) as Body;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return Response.json(fallback());

  const client = new Anthropic({ apiKey });
  const res = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1500,
    system: [{ type: "text", text: "You generate ideation stickies for a whiteboard. JSON output only.", cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: `Sketch board question: "${body.prompt}".

Existing content on the board:
${body.content || "(empty)"}

Generate 8 new stickies that ADD to what's already there. Mix: root causes, customer voices, wedge ideas, risks, adjacent solutions, open questions. Each ≤ 22 words. African / developing-world context.

Output JSON: {"stickies":[{"text":"…","color":"#fde68a","category":"Root cause | Customer voice | Wedge | Risk | Adjacent | Question"}]}`,
      },
    ],
  });
  const text = res.content.filter((c) => c.type === "text").map((c) => (c.type === "text" ? c.text : "")).join("");
  const cleaned = text.replace(/^```json\n?|\n?```$/g, "").trim();
  try { return Response.json(JSON.parse(cleaned)); } catch { return Response.json(fallback()); }
}

function fallback() {
  return {
    stickies: [
      { text: "Who specifically loses money to this? Name 3 people you know.", color: "#a5b4fc", category: "Question" },
      { text: "Cooperative chairmen → trusted distribution at 30:1 leverage", color: "#bbf7d0", category: "Wedge" },
      { text: "Pay-per-crate vs subscription: which aligns incentives better?", color: "#a5b4fc", category: "Question" },
      { text: "Hardware liability — who fixes the cold cell at 2am in Yendi?", color: "#fca5a5", category: "Risk" },
      { text: "30-day demand-forecast voice notes in mother tongue", color: "#bbf7d0", category: "Wedge" },
      { text: "Mama Adwoa: 'I cried when 4 crates rotted last Tuesday'", color: "#f9a8d4", category: "Customer voice" },
      { text: "Twiga Foods / ColdHubs adjacent — what's their unfair gap?", color: "#fde68a", category: "Adjacent" },
      { text: "Cash-flow timing matters more than absolute price", color: "#fde68a", category: "Root cause" },
    ],
  };
}
