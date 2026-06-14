import { describe, it, expect } from "vitest";
import { summonsSage, buildTranscript } from "./workspace-discussion";

describe("summonsSage", () => {
  it("triggers on an @sage mention", () => {
    expect(summonsSage("hey @sage what do you think?")).toBe(true);
    expect(summonsSage("@Sage can you summarize this?")).toBe(true);
  });
  it("does not trigger on the bare word", () => {
    expect(summonsSage("that's sage advice")).toBe(false);
    expect(summonsSage("the sageness of it")).toBe(false);
  });
  it("does not trigger on an empty or mentionless message", () => {
    expect(summonsSage("")).toBe(false);
    expect(summonsSage("just a normal message")).toBe(false);
  });
  it("triggers when @sage is among several mentions", () => {
    expect(summonsSage("@ama @sage @kofi can we sync?")).toBe(true);
  });
});

describe("buildTranscript", () => {
  const msgs = [
    { author_name: "Ama", is_agent: false, body: "Should we use a SAFE or a convertible?" },
    { author_name: "Kofi", is_agent: false, body: "I think SAFE is simpler." },
    { author_name: null, is_agent: true, body: "Both convert later; SAFE has no maturity date." },
  ];

  it("renders newest-last in conversational order with names", () => {
    const t = buildTranscript(msgs);
    expect(t).toBe(
      "Ama: Should we use a SAFE or a convertible?\n" +
      "Kofi: I think SAFE is simpler.\n" +
      "Sage: Both convert later; SAFE has no maturity date.",
    );
  });

  it("labels agent messages as Sage", () => {
    expect(buildTranscript([{ author_name: null, is_agent: true, body: "hi" }])).toBe("Sage: hi");
  });

  it("falls back to Member for missing author names", () => {
    expect(buildTranscript([{ author_name: null, is_agent: false, body: "hi" }])).toBe("Member: hi");
  });

  it("keeps the most recent messages when truncating", () => {
    const many = Array.from({ length: 50 }, (_, i) => ({ author_name: "U", is_agent: false, body: `message number ${i}` }));
    const t = buildTranscript(many, 80);
    // The last message must survive; the first must be dropped.
    expect(t).toContain("message number 49");
    expect(t).not.toContain("message number 0");
  });
});
