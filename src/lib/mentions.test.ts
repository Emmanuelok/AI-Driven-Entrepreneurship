import { describe, it, expect } from "vitest";
import { extractMentionTokens, resolveMentions, type MentionableMember } from "./mentions";

describe("extractMentionTokens", () => {
  it("pulls plain mentions", () => {
    expect(extractMentionTokens("hey @ama, check this")).toEqual(["ama"]);
  });

  it("handles multiple distinct mentions", () => {
    expect(extractMentionTokens("@ama and @kofi pls")).toEqual(["ama", "kofi"]);
  });

  it("dedupes repeat mentions", () => {
    expect(extractMentionTokens("@ama @ama @ama")).toEqual(["ama"]);
  });

  it("ignores emails", () => {
    expect(extractMentionTokens("ping ama@uni.edu")).toEqual([]);
  });

  it("matches slug-style mentions", () => {
    expect(extractMentionTokens("hey @ada-eze")).toEqual(["ada-eze"]);
  });

  it("lowercases the token", () => {
    expect(extractMentionTokens("@Ama")).toEqual(["ama"]);
  });

  it("rejects @ at end of word", () => {
    expect(extractMentionTokens("contact@me later")).toEqual([]);
  });
});

describe("resolveMentions", () => {
  const members: MentionableMember[] = [
    { user_id: "u1", display_name: "Ama Nyarko", email: "ama.nyarko@uni.edu" },
    { user_id: "u2", display_name: "Kofi Mensah", email: null },
    { user_id: "u3", display_name: null, email: "adaeze@uni.edu" },
  ];

  it("matches first-name token", () => {
    expect(resolveMentions("@ama hi", members).userIds).toEqual(["u1"]);
  });

  it("matches slug-form name", () => {
    expect(resolveMentions("@ama-nyarko", members).userIds).toEqual(["u1"]);
  });

  it("matches email localpart when no display name", () => {
    expect(resolveMentions("@adaeze hi", members).userIds).toEqual(["u3"]);
  });

  it("ignores unknown tokens", () => {
    expect(resolveMentions("@nobody", members).userIds).toEqual([]);
  });

  it("returns multiple unique users", () => {
    const out = resolveMentions("@ama and @kofi please", members).userIds;
    expect(out.sort()).toEqual(["u1", "u2"]);
  });
});
