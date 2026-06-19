import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabase";
import type { AgentContext, AgentResult } from "@/lib/agent-runner";

// The outreach drafter — v2's first agent.
//
// Input shape:
//   { recipientSlug: string, intent: string, length?: "short"|"medium" }
//
// What it does:
//   1. Reads the recipient's public profile (the one we'd be drafting
//      to) so the message can reference their headline, sector,
//      institution, etc.
//   2. Reads the sender's own profile so the draft introduces them
//      with the same facts they'd want to share.
//   3. Asks Claude to draft a short, specific contact message that
//      respects the platform's etiquette (no fluff, lead with the ask,
//      mention concrete shared context).
//
// Output: { subject: string, body: string } — the user reviews this in
// the contact composer and clicks send. We don't send anything from
// the agent itself; the contact request is a separate, deliberate
// action by the human (the trust + recipient policy gates still apply).

const SYSTEM_PROMPT = `You are Sage, the AI mentor inside Sankofa Studio. You are drafting a contact-request message FOR the sender, TO the recipient, on a platform where members reach out to mentors, investors, instructors, funders, and other founders.

Rules:
- Be specific. Reference the recipient's actual sector/expertise/work where you can.
- Lead with the ask. What does the sender want? A 15-minute call? Feedback on a doc? An intro?
- Match the sender's voice — they're a Sankofa member, not a corporate emailer. Warm but direct.
- Avoid "I hope this email finds you well" and other empty opens. Open with a fact about the recipient that matters, or a one-line context about the sender.
- Stay short. 80-140 words for medium, 40-80 words for short. Subject < 70 characters.
- Don't promise things the sender hasn't said they'll do.
- If the sender's intent is vague, lean on what their profile says they're building.

Return JSON ONLY, no prose around it:
{
  "subject": "…",
  "body": "…"
}`;

export async function outreachDrafter(ctx: AgentContext): Promise<AgentResult> {
  const input = ctx.input as {
    recipientSlug?: string;
    intent?: string;
    length?: "short" | "medium";
  };
  if (!input.recipientSlug) throw new Error("missing_recipient");

  const sb = supabaseAdmin();
  if (!sb) throw new Error("admin_unavailable");

  const recipient = await ctx.step("Reading recipient's profile", async () => {
    const { data } = await sb
      .from("user_profiles")
      .select("display_name, headline, bio, country, city, account_type, persona_data")
      .eq("slug", input.recipientSlug)
      .maybeSingle();
    if (!data) throw new Error("recipient_not_found");
    return data as Record<string, unknown>;
  });

  const sender = await ctx.step("Building your sender context", async () => {
    const { data } = await sb
      .from("user_profiles")
      .select("display_name, headline, bio, country, city, account_type, persona_data")
      .eq("user_id", ctx.userId)
      .maybeSingle();
    return (data as Record<string, unknown> | null) ?? {};
  });

  const promptMessage = [
    `RECIPIENT PROFILE:`,
    JSON.stringify(recipient, null, 2),
    ``,
    `SENDER PROFILE:`,
    JSON.stringify(sender, null, 2),
    ``,
    `SENDER'S INTENT:`,
    input.intent || "(none specified — infer from the sender's profile)",
    ``,
    `LENGTH:`,
    input.length ?? "medium",
    ``,
    `Draft the message now. Return JSON only.`,
  ].join("\n");

  const draft = await ctx.step("Drafting outreach", async () => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      // Local-mode fallback so the run flow can be exercised without
      // an API key. Doesn't pretend to draft anything good.
      return {
        subject: "Quick question",
        body: `Hi ${getStr(recipient, "display_name") || "there"} — I'm working on something and would value 15 minutes of your perspective. ${input.intent ?? ""} Let me know if you have a window this week.`,
      };
    }
    const client = new Anthropic({ apiKey });
    const res = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 600,
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: promptMessage }],
    });
    const text = res.content
      .filter((c) => c.type === "text")
      .map((c) => (c.type === "text" ? c.text : ""))
      .join("")
      .trim();
    // Parse the JSON — Sage occasionally wraps it in a code fence
    // despite instructions, so strip that defensively.
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
    try {
      const parsed = JSON.parse(cleaned) as { subject?: string; body?: string };
      return {
        subject: String(parsed.subject ?? "").trim() || "Quick question",
        body: String(parsed.body ?? "").trim(),
      };
    } catch {
      // If parsing failed, fall back to using the raw text as the body.
      return { subject: "Quick question", body: text };
    }
  });

  if (!draft.body) throw new Error("empty_draft");

  return {
    output: {
      subject: draft.subject,
      body: draft.body,
      recipientSlug: input.recipientSlug,
    },
    // Drafts are never auto-sent — the user reviews and sends from
    // the contact composer, which IS their approval.
    terminal: false,
    title: `Draft for ${getStr(recipient, "display_name") || input.recipientSlug}`,
    notification: {
      title: `Sage drafted a message to ${getStr(recipient, "display_name") || input.recipientSlug}`,
      body: draft.subject,
      url: `/people/${input.recipientSlug}?draft=${ctx.runId}`,
    },
  };
}

function getStr(obj: Record<string, unknown>, key: string): string | undefined {
  const v = obj?.[key];
  return typeof v === "string" ? v : undefined;
}
