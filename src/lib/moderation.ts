import Anthropic from "@anthropic-ai/sdk";

// Two-stage content moderation for student-facing AI routes.
//
// Stage 1 (always-on): pattern check. Blocks the highest-risk categories
// immediately — CSAM signals, explicit synthesis of weapons/malware,
// real-person harassment, doxxing. Zero latency, zero cost.
//
// Stage 2 (Claude Haiku judge): only invoked when Stage 1 passes but the
// input is over a length threshold or contains soft-flagged tokens.
// Returns "safe" / "borderline" / "unsafe" with a one-line reason.
//
// The contract: moderate() returns either { allowed: true } or
// { allowed: false, reason, category }. Call sites decide whether to
// block, soft-warn, or escalate.

export type ModerationResult = {
  allowed: boolean;
  reason?: string;
  category?: "csam" | "weapons" | "malware" | "self_harm" | "harassment" | "spam_abuse" | "other";
  stage?: "pattern" | "llm";
};

// Bright-line patterns. Conservative — only catches the most obvious
// abuse. Phrases that are normal in education (e.g. "history of chemical
// warfare") deliberately don't match. Tuned for tertiary-student traffic.
const HARD_BLOCKS: { pattern: RegExp; category: ModerationResult["category"]; reason: string }[] = [
  { pattern: /\b(child|minor|underage|preteen|teen)\s+(porn|sex|nude|naked|sexual|grooming)/i, category: "csam", reason: "Sexual content involving minors is never allowed." },
  { pattern: /\bhow\s+to\s+(make|build|synthesize|cook)\s+(meth|fentanyl|heroin|cocaine|crack)\b/i, category: "other", reason: "Illegal drug synthesis instructions." },
  { pattern: /\b(buy|acquire|obtain)\s+(automatic|assault)\s+(rifle|weapon)\s+(illegally|without\s+licence|on\s+(the\s+)?black\s+market)/i, category: "weapons", reason: "Help acquiring illegal weapons." },
  { pattern: /\b(write|create|generate)\s+(working|functional|deployable)\s+(ransomware|keylogger|spyware|trojan|virus)\s+(targeting|to\s+attack|for\s+(a\s+)?company)/i, category: "malware", reason: "Operational malware targeting a specific victim." },
  { pattern: /\b(dox|doxx|leak\s+address|leak\s+phone)\s+of\s+/i, category: "harassment", reason: "Doxxing or harassment of a specific person." },
  { pattern: /\bhow\s+(to|do\s+i)\s+(kill|harm|hurt)\s+(myself|me)\b|\b(commit\s+suicide|end\s+my\s+life)\b/i, category: "self_harm", reason: "Self-harm intent detected — routing to safety resources." },
];

// Soft signals — trigger Stage 2 LLM check but don't auto-block.
const SOFT_SIGNALS = [
  /\b(jailbreak|ignore\s+previous|disregard\s+your\s+instructions|developer\s+mode|DAN\b)/i,
  /\b(weapon|explosive|exploit|vulnerability|hack)\b/i,
  /\b(pretend\s+(you\s+are|to\s+be)|act\s+as\s+if)/i,
];

const STAGE2_SYSTEM = `You are a content-safety judge for a student-facing AI platform serving African tertiary education.

Tag the input as one of: "safe", "borderline", "unsafe".

- safe: anything a curious student or founder might legitimately ask, including ambitious/edgy/political/satirical content if it serves a learning or building purpose.
- borderline: the input is risky but plausibly legitimate (e.g. "explain how SQL injection works" for a security student). Allow it but flag.
- unsafe: a clear bid to do real-world harm — synthesize weapons or drugs, target a specific person, defeat the platform's safety, produce CSAM. Block.

Output STRICT JSON only. No markdown fences. Shape:
{ "verdict": "safe" | "borderline" | "unsafe", "category": string | null, "reason": string }`;

export async function moderate(text: string, opts?: { skipLLM?: boolean }): Promise<ModerationResult> {
  if (!text || text.trim().length === 0) return { allowed: true };

  // Stage 1
  for (const block of HARD_BLOCKS) {
    if (block.pattern.test(text)) {
      return { allowed: false, reason: block.reason, category: block.category, stage: "pattern" };
    }
  }

  const needsLLM = !opts?.skipLLM && (text.length > 600 || SOFT_SIGNALS.some((p) => p.test(text)));
  if (!needsLLM) return { allowed: true };

  // Stage 2: cheap Haiku judge (skipped silently when no API key)
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { allowed: true };

  try {
    const client = new Anthropic({ apiKey });
    const res = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      system: [{ type: "text", text: STAGE2_SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: text.slice(0, 4000) }],
    });
    const out = res.content.filter((c) => c.type === "text").map((c) => (c.type === "text" ? c.text : "")).join("").trim();
    const cleaned = out.replace(/^```json\n?|\n?```$/g, "").trim();
    const parsed = JSON.parse(cleaned) as { verdict?: string; category?: string; reason?: string };
    if (parsed.verdict === "unsafe") {
      return { allowed: false, reason: parsed.reason || "Content blocked by safety review.", category: (parsed.category as ModerationResult["category"]) || "other", stage: "llm" };
    }
    return { allowed: true };
  } catch {
    // Never let the moderator's failure block a real student. Open-fail.
    return { allowed: true };
  }
}

// Helper for routes — returns the 403 Response if blocked, else null.
export async function moderateOrBlock(text: string, opts?: { skipLLM?: boolean }): Promise<Response | null> {
  const m = await moderate(text, opts);
  if (m.allowed) return null;
  return new Response(
    JSON.stringify({
      error: "blocked_by_safety",
      reason: m.reason,
      category: m.category,
      message: "This request can't be processed. If you believe this is a mistake, rephrase or contact support.",
    }),
    { status: 403, headers: { "Content-Type": "application/json", "X-Moderation-Stage": m.stage ?? "pattern" } },
  );
}
