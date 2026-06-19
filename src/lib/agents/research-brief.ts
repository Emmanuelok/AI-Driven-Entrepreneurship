import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabase";
import type { AgentContext, AgentResult } from "@/lib/agent-runner";

// Research brief — Sage's second agent.
//
// Input: { subjectSlug: string, purpose?: string }
//
// Sage reads the subject's public profile and produces a 4-section
// brief the caller can scan before any outreach: WHAT they're known
// for, WHY now (recent signals), CONVERSATION STARTERS (3-4 specific
// openers grounded in their profile), AVOID (topics or asks that
// would land badly given what's visible).
//
// Differs from outreach_drafter in three ways:
//   1. It reads ONE side (the subject), not both.
//   2. It produces structured analysis, not a draft message.
//   3. The output is referenceable — useful to revisit before a call,
//      not just before a cold send.

const SYSTEM_PROMPT = `You are Sage, the AI mentor inside Sankofa Studio. You are producing a research brief about a member of the platform so the requester (a founder, mentor, instructor, or investor) can scan it before reaching out, meeting them, or pitching them.

Rules:
- Stay grounded in the recipient's actual profile fields. Don't fabricate accomplishments, dates, or quotes.
- Be specific. "Has shipped" beats "is interested in." "Mentions Lagos" beats "based in Africa."
- Read the subject's persona_data carefully — mentor expertise vs investor sectors vs instructor courses all imply very different conversation strategies.
- If a field is empty, NOTE it ("no headline set") rather than inventing one.
- The "avoid" section is critical. Don't be polite-vague there; be concrete about what would land badly.

Return JSON ONLY:
{
  "what":  "1-2 sentence summary of who they are and what they do.",
  "why_now": "1 sentence on signals from their profile that suggest engaging now (or NULL if nothing strong).",
  "starters": ["…", "…", "…"],   // 3-4 specific opening lines
  "avoid":   ["…", "…"]           // 1-3 things to NOT lead with
}`;

export async function researchBrief(ctx: AgentContext): Promise<AgentResult> {
  const input = ctx.input as { subjectSlug?: string; purpose?: string };
  if (!input.subjectSlug) throw new Error("missing_subject");

  const sb = supabaseAdmin();
  if (!sb) throw new Error("admin_unavailable");

  const subject = await ctx.step("Reading subject's profile", async () => {
    const { data } = await sb
      .from("user_profiles")
      .select("display_name, headline, bio, country, city, account_type, persona_data, website_url, linkedin_url, twitter_url")
      .eq("slug", input.subjectSlug)
      .maybeSingle();
    if (!data) throw new Error("subject_not_found");
    return data as Record<string, unknown>;
  });

  // Optional: pull a few of their attestations so the brief can
  // reference public vouches if they exist. Best-effort; brief still
  // works without them.
  const attestations = await ctx.step("Reading public attestations", async () => {
    const userId = (subject as { user_id?: string }).user_id;
    if (!userId) return [];
    const { data } = await sb
      .from("peer_attestations")
      .select("kind, body, attestor_user_id")
      .eq("attested_user_id", userId)
      .limit(5);
    return (data ?? []) as Array<Record<string, unknown>>;
  });

  const promptMessage = [
    `SUBJECT'S PROFILE:`,
    JSON.stringify(subject, null, 2),
    ``,
    `PUBLIC VOUCHES (${attestations.length}):`,
    JSON.stringify(attestations, null, 2),
    ``,
    `REQUESTER'S PURPOSE:`,
    input.purpose ?? "(general — preparing to reach out)",
    ``,
    `Produce the brief now. JSON only.`,
  ].join("\n");

  const brief = await ctx.step("Composing brief", async () => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return {
        what: `${(subject as { display_name?: string }).display_name ?? "Member"} — ${(subject as { headline?: string }).headline ?? "no headline set"}.`,
        why_now: null,
        starters: ["What are you most focused on this quarter?", "What's the biggest blocker you're hitting right now?"],
        avoid: ["Generic 'big fan of your work' opens."],
      };
    }
    const client = new Anthropic({ apiKey });
    const res = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 900,
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: promptMessage }],
    });
    const text = res.content
      .filter((c) => c.type === "text")
      .map((c) => (c.type === "text" ? c.text : ""))
      .join("")
      .trim();
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
    try {
      const parsed = JSON.parse(cleaned) as {
        what?: string; why_now?: string | null;
        starters?: string[]; avoid?: string[];
      };
      return {
        what: String(parsed.what ?? "").trim() || "No summary returned.",
        why_now: parsed.why_now ?? null,
        starters: (parsed.starters ?? []).filter((s) => typeof s === "string"),
        avoid: (parsed.avoid ?? []).filter((s) => typeof s === "string"),
      };
    } catch {
      return { what: text || "Could not parse brief.", why_now: null, starters: [], avoid: [] };
    }
  });

  const displayName = (subject as { display_name?: string }).display_name ?? input.subjectSlug;
  return {
    output: { ...brief, subjectSlug: input.subjectSlug },
    terminal: true, // briefs have no external side effect — they're informational
    title: `Brief on ${displayName}`,
    notification: {
      title: `Sage's brief on ${displayName} is ready`,
      body: brief.what.slice(0, 160),
      url: `/studio/agent-runs/${ctx.runId}`,
    },
  };
}
