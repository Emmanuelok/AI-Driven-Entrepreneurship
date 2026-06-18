import type { MentionCandidate } from "@/components/use-mention-autocomplete";
import type { WorkspaceMember } from "@/lib/workspace-api";

// Build mention candidates from a workspace's member roster. The same
// shape powers the discussion composer, Sage advisor, and DM dialog —
// extracted here so a fix in one place fixes all three.
//
// Options:
//   includeSage — prepend a reserved 'sage' handle (for the discussion
//                 composer where @sage triggers an inline reply).
//   excludeUserId — drop a specific user from the list (typically the
//                   signed-in user, so @-ing yourself never autocompletes).
export function buildMentionCandidates(
  members: WorkspaceMember[],
  opts?: { includeSage?: boolean; excludeUserId?: string },
): MentionCandidate[] {
  const memberCands: MentionCandidate[] = members
    .filter((m) => !opts?.excludeUserId || m.user_id !== opts.excludeUserId)
    .map((m) => ({
      id: m.user_id,
      display: m.display_name || m.email || "Member",
      // Stable single-word token: first whitespace-separated chunk of
      // the display name, stripped to alphanumerics. The mention parser
      // matches against this exactly.
      token: (m.display_name || m.email || "member")
        .toLowerCase()
        .split(/\s+/)[0]
        .replace(/[^a-z0-9]/g, ""),
      hint: m.role,
    }));
  if (opts?.includeSage) {
    return [{ id: "sage", display: "Sage (AI mentor)", token: "sage", hint: "ask the AI" }, ...memberCands];
  }
  return memberCands;
}
