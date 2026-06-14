import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { readSiteContext, siteSystemBlock } from "@/lib/site-brain";
import { parseBodyWithRaw } from "@/lib/parse-body";
import { aiGuard } from "@/lib/ai-guard";

export const runtime = "nodejs";

// The Workspace Agent — Sage acting on automatic triggers inside a
// workspace. Three kinds today:
//
//   welcome           — a new member just joined. Generate a short,
//                       warm orientation note pointing them at the
//                       workspace's purpose and one first move.
//   deadline_focus    — a deadline is within the urgent window.
//                       Generate a 3-step action plan AT MOST.
//   stage_progress    — a workspace milestone closed. Generate a tight
//                       acknowledgement + the next leverage point.
//
// All return { title, body } so the client can hand the result to
// useLetters().writeLetter() and the user sees it in their inbox.

const TRIGGERS = ["welcome", "deadline_focus", "stage_progress"] as const;

const Body = z.object({
  trigger: z.enum(TRIGGERS as unknown as readonly [string, ...string[]]),
  workspaceTitle: z.string().max(200),
  workspaceKind: z.string().max(40),
  recipientName: z.string().max(120),
  recipientRole: z.string().max(40),
  // Free-form context: the deadline title + due, what the member just
  // did, what just changed. Kept as a string to stay schema-flexible
  // while the agent grows.
  context: z.string().max(4000),
  // Sage's voice block (genome-derived) — let the agent inherit the
  // user's preferred tone without re-deriving it.
  genomeVoice: z.string().max(2000).optional(),
}).loose();
type AgentBody = z.infer<typeof Body>;

export async function POST(req: Request) {
  const parsed = await parseBodyWithRaw(req, Body);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  // Auto-fired agents still go through the guard — they consume the
  // user's quota like any other AI call.
  const guard = await aiGuard({ req, scope: "workspace-agent", maxCalls: 30 });
  if (!guard.ok) return guard.response;
  if (!guard.apiKey) return Response.json(fallback(body));

  const brain = siteSystemBlock(readSiteContext(parsed.raw));
  const voice = body.genomeVoice || "Be direct and warm. Skip filler.";

  const triggerGuidance = guidanceFor(body.trigger, body);

  const client = new Anthropic({ apiKey: guard.apiKey });
  const res = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 900,
    system: [
      {
        type: "text",
        text: `${brain}You are Sage, a mentor at Sankofa Studio, writing on behalf of the team in a collaborative workspace. ${voice}

${triggerGuidance}`,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: `Workspace: "${body.workspaceTitle}" (kind: ${body.workspaceKind}).
Recipient: ${body.recipientName} (role: ${body.recipientRole}).
Trigger: ${body.trigger}.

Context:
${body.context}

Output JSON: {"title": "short title (≤ 70 chars)", "body": "markdown body"}`,
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

function guidanceFor(trigger: string, b: AgentBody): string {
  switch (trigger) {
    case "welcome":
      return `Goal: orient a new ${b.recipientRole} who just joined "${b.workspaceTitle}". Three short paragraphs:
1. Welcome by first name; one specific thing this workspace is for.
2. The smallest first move they can make TODAY (concrete, ≤ 15 min).
3. Where the next conversation should happen (deadlines panel, activity, members).

Length: 100–160 words. Markdown, no bullet points, no emoji.`;

    case "deadline_focus":
      return `Goal: help ${b.recipientName} stay in motion on a deadline. The body MUST contain exactly three numbered steps the recipient can do in the next 24 hours, each one sentence. Open with one line stating the deadline and how much time is left. Close with one line of warm pressure — never alarm.

Length: 100–160 words. Markdown. No emoji.`;

    case "stage_progress":
      return `Goal: acknowledge a real shift in the workspace and point at the next leverage. Two short paragraphs:
1. Name the specific change you noticed.
2. The single next thing that compounds it.

Length: 80–140 words. Markdown. No emoji. Never use the word "amazing".`;
  }
  return "Write a short, helpful note (120 words max) tied directly to the context.";
}

function fallback(b: AgentBody): { title: string; body: string } {
  const first = b.recipientName.split(" ")[0];
  if (b.trigger === "welcome") {
    return {
      title: `Welcome to ${b.workspaceTitle}, ${first}`,
      body: `Welcome in. ${b.workspaceTitle} runs on small honest moves rather than big promises. The fastest way to feel like a member is to set yourself one deadline before the day ends — something you can actually finish — and to leave a note for the rest of us in the activity feed.\n\nIf you don't know what to do first, open the deadlines panel and see what others are working toward. Match your scale to theirs. We move at the speed of trust.\n\n— Sage`,
    };
  }
  if (b.trigger === "deadline_focus") {
    return {
      title: `One focused move, ${first}`,
      body: `A deadline is close. Here are three moves for the next 24 hours:\n\n1. Open the workspace and re-read the deadline detail — make sure nothing has shifted under it.\n2. Pick the smallest piece of the work that you can finish today, and finish it.\n3. Drop a one-line note in the activity feed so your collaborators can pick up where you left off.\n\nThe pressure here is generative, not punitive. You've got it.\n\n— Sage`,
    };
  }
  return {
    title: `Quick acknowledgement, ${first}`,
    body: `Something shifted in the workspace just now, and shifts deserve to be noticed before they're folded into "obviously". Take ten seconds to name what changed in one sentence — for yourself, for the team. Then point your next session at the smallest thing this change makes possible that wasn't before.\n\n— Sage`,
  };
}
