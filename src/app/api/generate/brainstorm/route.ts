import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";

type Body = { prompt: string; existing: string[] };

export async function POST(req: Request) {
  const body = (await req.json()) as Body;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return Response.json(fallback(body));

  const client = new Anthropic({ apiKey });
  const res = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1500,
    system: [{ type: "text", text: "You generate brainstorm stickies. Output strict JSON. African / developing-world context.", cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: `Brainstorm the question: "${body.prompt}".

${body.existing.length > 0 ? `Already on the board:\n${body.existing.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n\nDon't repeat these.` : ""}

Output JSON: {"stickies": [{"text": "...", "color": "emerald|amber|rust|indigo|muted", "category": "..."}]}

Rules:
- Produce 10 stickies.
- Mix categories: "Root cause", "Stakeholder", "Workaround", "Wedge idea", "Risk", "Adjacent solution", "Question".
- Use colors meaningfully: emerald = positive/opportunity, amber = neutral/observation, rust = pain/risk, indigo = solution-shaped, muted = open question.
- Each sticky ≤ 20 words.`,
      },
    ],
  });
  const text = res.content.filter((c) => c.type === "text").map((c) => (c.type === "text" ? c.text : "")).join("");
  const cleaned = text.replace(/^```json\n?|\n?```$/g, "").trim();
  try {
    return Response.json(JSON.parse(cleaned));
  } catch {
    return Response.json(fallback(body));
  }
}

function fallback(b: Body) {
  return {
    stickies: [
      { text: "Who specifically experiences this — name 3 real people", color: "indigo", category: "Question" },
      { text: "What workarounds exist today, and why are they insufficient?", color: "muted", category: "Workaround" },
      { text: "Cooperative chairmen as distribution multipliers", color: "emerald", category: "Wedge idea" },
      { text: "30-day demand-forecast voice notes in local language", color: "emerald", category: "Wedge idea" },
      { text: "Cash-flow timing matters more than absolute cost", color: "amber", category: "Root cause" },
      { text: "Hardware failure liability — who fixes it?", color: "rust", category: "Risk" },
      { text: "Buyer trust deficit on quality grading", color: "rust", category: "Pain" },
      { text: "Existing players: Twiga Foods, ColdHubs, Releaf", color: "indigo", category: "Adjacent solution" },
      { text: "Pay-per-crate vs subscription — what aligns incentives?", color: "muted", category: "Question" },
      { text: "Friday prayer announcement as launch channel", color: "emerald", category: "Wedge idea" },
    ],
  };
}
