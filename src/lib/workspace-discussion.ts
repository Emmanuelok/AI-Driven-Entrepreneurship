import { extractMentionTokens } from "@/lib/mentions";

// Small pure helpers for the workspace discussion thread. Kept separate
// from the route so they're unit-testable without Supabase/Anthropic.

// The reserved handle that summons the workspace AI participant. A
// message containing @sage (case-insensitive) asks Sage to reply in
// the thread.
export const SAGE_HANDLE = "sage";

// Does this message summon Sage? True when "@sage" appears as a mention
// token. We intentionally require the @ prefix (handled by
// extractMentionTokens) so prose like "the sage advice" doesn't trigger
// a reply.
export function summonsSage(text: string): boolean {
  return extractMentionTokens(text).includes(SAGE_HANDLE);
}

// Build a compact transcript of the recent thread for Sage's context
// window. Newest-last so the model reads it in conversational order.
// Caps total characters so a long thread can't blow the prompt budget.
export function buildTranscript(
  messages: { author_name: string | null; is_agent: boolean; body: string }[],
  maxChars = 4000,
): string {
  const lines: string[] = [];
  let total = 0;
  // Walk newest→oldest, prepend, stop when we hit the budget — keeps the
  // most recent context when we have to truncate.
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    const who = m.is_agent ? "Sage" : (m.author_name || "Member");
    const line = `${who}: ${m.body}`;
    if (total + line.length > maxChars) break;
    lines.unshift(line);
    total += line.length;
  }
  return lines.join("\n");
}
