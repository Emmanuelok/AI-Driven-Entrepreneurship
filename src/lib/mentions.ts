// Cohort discussion @mention parser + resolver.
//
// Mention syntax: `@token` where token is the first word (alphanumeric
// + dots + dashes) after an `@`. We match the token case-insensitively
// against the cohort member's display_name (whole word OR slug-form
// like "ada-eze"), or the email's username part.
//
// We never resolve to users outside the cohort — preserves the social
// contract (your DM list isn't auto-populated by joining a cohort).

export type MentionableMember = {
  user_id: string;
  display_name: string | null;
  email: string | null;
};

const MENTION_RE = /(^|[^a-zA-Z0-9_])@([a-zA-Z][a-zA-Z0-9._-]{1,30})/g;

export function extractMentionTokens(text: string): string[] {
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  // Reset lastIndex defensively — the RE is global.
  MENTION_RE.lastIndex = 0;
  while ((m = MENTION_RE.exec(text)) !== null) {
    out.add(m[2].toLowerCase());
  }
  return Array.from(out);
}

// Tokenize a candidate's display_name or email-localpart so a mention
// like "@ama" or "@ama-nyarko" hits a member named "Ama Nyarko" or
// "ama.nyarko@uni.edu".
function candidateTokens(member: MentionableMember): string[] {
  const out: string[] = [];
  if (member.display_name) {
    const slug = member.display_name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    out.push(slug);
    const first = member.display_name.toLowerCase().split(/\s+/)[0]?.replace(/[^a-z0-9]/g, "");
    if (first && first.length > 1) out.push(first);
    const noSpace = member.display_name.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (noSpace) out.push(noSpace);
  }
  if (member.email) {
    const local = member.email.split("@")[0]?.toLowerCase();
    if (local) out.push(local);
  }
  return out;
}

// Resolve tokens → unique user_ids. Caller passes the cohort's full
// member roster; we never accept arbitrary user ids.
export function resolveMentions(text: string, members: MentionableMember[]): { userIds: string[]; tokens: string[] } {
  const tokens = extractMentionTokens(text);
  if (tokens.length === 0) return { userIds: [], tokens: [] };

  const userIds = new Set<string>();
  for (const tok of tokens) {
    for (const m of members) {
      if (candidateTokens(m).includes(tok)) {
        userIds.add(m.user_id);
        break;
      }
    }
  }
  return { userIds: Array.from(userIds), tokens };
}
