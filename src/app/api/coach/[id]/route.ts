import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { COACHES, getCoach } from "@/lib/coaches";
import { readSiteContext, siteSystemBlock } from "@/lib/site-brain";
import { aiGuard } from "@/lib/ai-guard";
import { parseBodyWithRaw } from "@/lib/parse-body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Msg = { role: "user" | "assistant"; content: string };

// Cap individual messages at 8KB and the chat history at 30 turns —
// well over a real conversation, blocks pathological loops.
const Body = z.object({
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().min(1).max(8000),
  })).min(1).max(30),
  context: z.record(z.string(), z.unknown()).optional(),
}).loose();

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  // Coach chats stream up to 1500 tokens each — protect the platform
  // key from budget drain. 30/min/IP is generous for a real
  // conversation but stops a script from looping the endpoint.
  const guard = await aiGuard({ req, scope: "coach", maxCalls: 30 });
  if (!guard.ok) return guard.response;

  const parsed = await parseBodyWithRaw(req, Body);
  if (!parsed.ok) return parsed.response;
  const { messages, context } = parsed.data;
  const raw = parsed.raw;

  const { id } = await ctx.params;
  const coach = getCoach(id);
  const brain = siteSystemBlock(readSiteContext(raw));

  if (!guard.apiKey) {
    return new Response(makeFallback(coach.id, messages[messages.length - 1].content), {
      headers: { "Content-Type": "text/plain; charset=utf-8", "x-mode": "demo", "x-coach": coach.id },
    });
  }

  const client = new Anthropic({ apiKey: guard.apiKey });

  const genomeVoice = (context as { genomeVoice?: string } | undefined)?.genomeVoice;
  const contextLine = context
    ? `\n\n=== EVERYTHING I KNOW ABOUT THIS STUDENT (use it; do not introduce yourself) ===\n${Object.entries(context).filter(([, v]) => v).map(([k, v]) => `- ${k}: ${v}`).join("\n")}\n\nAlways address them by first name. Reference what they're currently doing. Tie your answer to their venture and goals where relevant. Don't be generic.${genomeVoice ? `\n\n=== VOICE INSTRUCTION (from their Studio Genome) ===\n${genomeVoice}` : ""}`
    : "";

  const stream = await client.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: 1500,
    system: [
      {
        type: "text",
        text: brain + coach.systemPrompt + contextLine,
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
        controller.enqueue(encoder.encode(`\n\n[${coach.name} hit an error: ${(err as Error).message}]`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "x-mode": "live", "x-coach": coach.id },
  });
}

export async function GET() {
  return Response.json({ coaches: Object.values(COACHES).map((c) => ({ id: c.id, name: c.name, role: c.role, short: c.short })) });
}

function makeFallback(coachId: string, userMsg: string): ReadableStream<Uint8Array> {
  const reply = canned(coachId, userMsg);
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      const tokens = reply.split(/(\s+)/);
      for (const t of tokens) {
        controller.enqueue(encoder.encode(t));
        await new Promise((r) => setTimeout(r, 16));
      }
      controller.close();
    },
  });
}

function canned(coachId: string, input: string): string {
  const noKey = `\n\n> 🔌 *Running in demo mode (no \`ANTHROPIC_API_KEY\` configured). Add it to \`.env.local\` or Vercel env to switch to live Claude responses.*`;

  if (coachId === "akili") {
    return `Good. Let's sharpen this.

You said: *"${input.slice(0, 140)}"*

Three rules for the next 14 days:

1. **One person, not a segment.** Not "farmers" — *Mama Adwoa, who sells 14 crates of tomatoes weekly at Tamale Central and loses 4 to spoilage*.
2. **Twenty interviews. No pitch.** Only questions about specific past behavior. "Walk me through last Tuesday." Look for the pattern when 12+ describe the same workaround.
3. **The smallest wedge you can validate by Friday.** Not the full product. The smallest piece that proves the most uncertain assumption.

**Your next 48 hours:** Schedule three customer interviews. Send me the recordings — I'll synthesize the signal vs noise with you.${noKey}`;
  }

  if (coachId === "nia") {
    return `Let me give you a structured read.

**What's working:**
- The instinct to solve a felt-pain problem is right.
- Picking a specific user — solid start.

**What's broken or confusing (ranked):**
1. The value prop needs sharpening. "Help with X" is invisible. Try: "Cut tomato spoilage from 35% to under 10% — pay only per crate saved."
2. The CTA is buried. First-time visitors should see one action.
3. Onboarding is asking too much, too soon. Cut it to 3 fields.

**Most important fix this week:** Rewrite the hero in the format "We help [specific person] achieve [specific outcome] without [specific painful workaround]." Test it with 5 target users in 48 hours.${noKey}`;
  }

  if (coachId === "tariq") {
    return `Right. Hostile-but-fair Q&A. Answer one at a time — I'll go deeper on each.

**Q1.** What is the *single* most uncertain assumption in your business right now, and what evidence would shift it? (If you can't name it in one sentence, you're not paying attention.)

I'll wait for your answer before Q2.${noKey}`;
  }

  if (coachId === "kofi") {
    return `Distribution-first thinking.

In African B2C, paid digital ads usually have catastrophic CAC. The channels that actually work in early stage:

1. **Cooperatives and chairmen.** One yes from a co-op chairman = 30 trusted distributions.
2. **WhatsApp groups.** Especially religious and trade communities. Trust travels at the speed of forwarded messages.
3. **Market-day demos.** Set up at the busiest stall for a Saturday. You'll get 50 real conversations in 4 hours.
4. **Agent networks.** If you piggyback on existing agent rails (M-Pesa, Opay agents), you skip 18 months of distribution build.

**Your next move:** Pick ONE channel. Run a 2-week experiment with a $0 budget. Report back with the CAC and conversion you saw.${noKey}`;
  }

  // sage default
  return `Let me think with you on this.

You're asking: *"${input.slice(0, 140)}"*

Here's how I'd unpack it:

1. **Anchor it.** What's the simplest version of this you could explore in 60 seconds?
2. **Reach for an analogy** from your daily life — most hard ideas have a familiar shadow (a tro-tro, a market stall, a NEPA outage).
3. **Walk forward in tiny steps.** When a step doesn't work, that's the question to bring back to me.

Tell me a bit more about where exactly you're stuck — what have you tried, what's the specific blocker?${noKey}`;
}
