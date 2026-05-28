import Anthropic from "@anthropic-ai/sdk";
import { aiUsageHeaders } from "@/lib/ai-headers";
import { rateLimit, rateLimited, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Turns a brainstorm canvas into either:
//   - a Build Studio project spec (template + name + opening prompt), or
//   - a Venture Studio venture spec (name + tagline + canvas + JTBD + wedge)
// The client then creates the resource and routes.

type Body = {
  destination: "ai" | "venture";
  boardTitle: string;
  boardPrompt: string;
  notes: string[];   // text from stickies / text / frame labels (filtered, deduped)
  region?: string;
};

const TEMPLATES = [
  { id: "crop-disease-scanner", what: "AI camera scanner for agriculture, food, materials" },
  { id: "whatsapp-bookkeeper", what: "Conversational AI for SMB ops (bookkeeping, scheduling, ordering)" },
  { id: "triage-co-pilot", what: "Decision-support AI for medicine, law, frontline workers" },
  { id: "voice-journal", what: "Voice-first AI: STT → process → TTS" },
  { id: "pricing-calculator", what: "Interactive calculator / structured-form tool" },
  { id: "robotics-claw-sim", what: "Hardware / robotics simulation with Web Serial" },
  { id: "simple-chat-agent", what: "Streaming chat UI calling Claude via Sankofa proxy" },
  { id: "tool-use-agent", what: "Agent loop with tools (clock, calculator, search, etc.)" },
  { id: "voice-agent", what: "Voice in → Claude → voice out, multilingual" },
  { id: "rag-agent", what: "Retrieval over pasted docs, grounded answers with citations" },
  { id: "planner-agent", what: "Plan-then-execute multi-step agent" },
  { id: "blank-canvas", what: "Empty file — when none of the above fit" },
];

const AI_SYSTEM = `You convert a student's brainstorm canvas into a working AI-product project spec.

You pick the SINGLE best starter template from this list (use the exact id):

${TEMPLATES.map((t) => `  ${t.id} — ${t.what}`).join("\n")}

You output STRICT JSON only. No markdown fences. Shape:
{
  "templateId": string,    // one of the ids above
  "projectName": string,   // 2-4 words, sentence case, e.g. "Maize Price Coach"
  "description": string,   // one sentence — what the agent does for whom
  "openingPrompt": string  // a paragraph the student would send as their FIRST message to Sage to start building. Specific, concrete, in their voice. Include what to display first, what data to ask the user for, and the first interaction.
}`;

const VENTURE_SYSTEM = `You convert a student's brainstorm canvas into a starting Venture Studio spec.

Output STRICT JSON only. No markdown fences. Shape:
{
  "name": string,         // 1-3 words, the brand. Memorable. No "AI" suffix unless central.
  "tagline": string,      // one sentence, customer benefit not feature
  "region": string,       // city or region most relevant. Empty string if not signaled.
  "canvas": {
    "Problem": string,
    "Customer": string,
    "Value prop": string,
    "Solution": string,
    "Channels": string,
    "Revenue": string,
    "Cost": string,
    "Metrics": string,
    "Unfair edge": string
  },
  "jtbd": {
    "when": string,
    "iWantTo": string,
    "soICan": string,
    "today": string
  },
  "wedge": {
    "who": string,
    "pain": string,
    "alternative": string,
    "insight": string
  }
}

Rules:
- Each canvas block: 1-3 sentences, dense, specific. Tag [hypothesis] if the student's notes give no signal.
- JTBD: customer voice, no jargon.
- Wedge: BRUTALLY specific beachhead. "2-acre maize farmers in Tamale" beats "African farmers".`;

export async function POST(req: Request) {
  const rl = rateLimit({ scope: "distill", ipKey: clientIp(req), maxCalls: 8 });
  if (!rl.ok) return rateLimited(rl);
  const body = (await req.json()) as Body;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return Response.json(fallback(body));

  const SYSTEM = body.destination === "ai" ? AI_SYSTEM : VENTURE_SYSTEM;

  const ctx = `Board title: ${body.boardTitle}
Driving question: ${body.boardPrompt}
${body.region ? `Region context: ${body.region}` : ""}

Notes captured on the canvas (stickies, text labels, frame names):
${body.notes.length > 0 ? body.notes.map((n, i) => `  ${i + 1}. ${n}`).join("\n") : "  (none — work from the title/prompt)"}`;

  const client = new Anthropic({ apiKey });
  try {
    const res = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2200,
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: ctx + `\n\nDistill into ${body.destination === "ai" ? "an AI-product spec" : "a venture spec"}.` }],
    });
    const text = res.content.filter((c) => c.type === "text").map((c) => (c.type === "text" ? c.text : "")).join("").trim();
    const cleaned = text.replace(/^```json\n?|\n?```$/g, "").trim();
    return Response.json(JSON.parse(cleaned), { headers: aiUsageHeaders(res) });
  } catch (e) {
    return Response.json({ error: (e as Error).message, ...fallback(body) }, { status: 502 });
  }
}

function fallback(b: Body) {
  if (b.destination === "ai") {
    return {
      templateId: "simple-chat-agent",
      projectName: b.boardTitle.slice(0, 30) || "Sankofa Build",
      description: b.boardPrompt.slice(0, 140),
      openingPrompt: `Build a small interactive UI for: ${b.boardPrompt}. The user opens the page and sees a clean intro, one input field, and a primary action button. Start with that, then we'll iterate.`,
    };
  }
  return {
    name: (b.boardTitle.split(/\s+/).slice(0, 2).join(" ") || "New Venture"),
    tagline: b.boardPrompt.slice(0, 100),
    region: b.region ?? "",
    canvas: {
      Problem: `[hypothesis] ${b.boardPrompt}`,
      Customer: "[hypothesis] To be sharpened with discovery interviews.",
      "Value prop": "[hypothesis] Set ANTHROPIC_API_KEY for live distillation.",
      Solution: "[hypothesis] Smallest testable wedge.",
      Channels: "[hypothesis] WhatsApp / direct outreach for v1.",
      Revenue: "[hypothesis] Pricing model TBD.",
      Cost: "[hypothesis] Variable cost per customer TBD.",
      Metrics: "[hypothesis] Active users + retention.",
      "Unfair edge": "[hypothesis] Identify after first 10 interviews.",
    },
    jtbd: { when: "", iWantTo: "", soICan: "", today: "" },
    wedge: { who: "", pain: "", alternative: "", insight: "" },
  };
}
