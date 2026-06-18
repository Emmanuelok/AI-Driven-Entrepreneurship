import { describe, it, expect } from "vitest";
import { buildMentionCandidates } from "./workspace-mentions";
import type { WorkspaceMember } from "./workspace-api";

function m(over: Partial<WorkspaceMember>): WorkspaceMember {
  return {
    user_id: "u-1",
    role: "member",
    display_name: "Ada Lovelace",
    email: "ada@example.com",
    joined_at: "2025-01-01T00:00:00Z",
    ...over,
  } as WorkspaceMember;
}

describe("buildMentionCandidates", () => {
  it("maps members to {id, display, token, hint}", () => {
    const cands = buildMentionCandidates([m({ user_id: "u-1" })]);
    expect(cands).toEqual([
      { id: "u-1", display: "Ada Lovelace", token: "ada", hint: "member" },
    ]);
  });

  it("derives a token from the first display-name word, lowercase, alphanum-only", () => {
    const cands = buildMentionCandidates([
      m({ user_id: "u-1", display_name: "Bjørn O'Hara" }),
    ]);
    // strips diacritic + apostrophe to plain letters
    expect(cands[0].token).toBe("bjrn");
  });

  it("falls back to email username when display_name is missing", () => {
    const cands = buildMentionCandidates([
      m({ user_id: "u-2", display_name: null as unknown as string, email: "carol@x.com" }),
    ]);
    expect(cands[0].display).toBe("carol@x.com");
    expect(cands[0].token).toBe("carolxcom");
  });

  it("falls back to 'member' token when neither name nor email is present", () => {
    const cands = buildMentionCandidates([
      m({ user_id: "u-3", display_name: null as unknown as string, email: null as unknown as string }),
    ]);
    expect(cands[0].display).toBe("Member");
    expect(cands[0].token).toBe("member");
  });

  it("includes the reserved Sage handle at the head when includeSage is true", () => {
    const cands = buildMentionCandidates([m({ user_id: "u-1" })], { includeSage: true });
    expect(cands[0]).toEqual({
      id: "sage", display: "Sage (AI mentor)", token: "sage", hint: "ask the AI",
    });
    expect(cands[1].id).toBe("u-1");
  });

  it("does not include Sage when includeSage is false / omitted", () => {
    const cands = buildMentionCandidates([m({ user_id: "u-1" })]);
    expect(cands.find((c) => c.id === "sage")).toBeUndefined();
  });

  it("excludes the signed-in user via excludeUserId", () => {
    const cands = buildMentionCandidates(
      [m({ user_id: "u-1", display_name: "Me" }), m({ user_id: "u-2", display_name: "Pat" })],
      { excludeUserId: "u-1" },
    );
    expect(cands).toHaveLength(1);
    expect(cands[0].id).toBe("u-2");
  });

  it("still surfaces Sage even when the only human is excluded", () => {
    const cands = buildMentionCandidates(
      [m({ user_id: "u-1", display_name: "Me" })],
      { includeSage: true, excludeUserId: "u-1" },
    );
    expect(cands).toHaveLength(1);
    expect(cands[0].id).toBe("sage");
  });

  it("hint reflects the member's role", () => {
    const cands = buildMentionCandidates([m({ user_id: "u-1", role: "owner" })]);
    expect(cands[0].hint).toBe("owner");
  });
});
