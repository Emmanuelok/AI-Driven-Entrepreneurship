import { describe, it, expect } from "vitest";
import {
  composeMessageBody, composeDocBody, composeTaskBody, composeDeadlineBody,
  type IndexableWorkspaceMessage, type IndexableWorkspaceDoc, type IndexableWorkspaceTask, type IndexableWorkspaceDeadline,
} from "./workspace-search-indexer";

const baseMsg = (over: Partial<IndexableWorkspaceMessage> = {}): IndexableWorkspaceMessage => ({
  id: "m1", workspace_id: "w1",
  body: "We should ship the LOI by Friday.",
  author_name: "Achieng",
  is_agent: false,
  created_at: "2026-06-01T12:00:00Z",
  ...over,
});

describe("composeMessageBody", () => {
  it("formats author and body", () => {
    expect(composeMessageBody(baseMsg())).toBe("Achieng said: We should ship the LOI by Friday.");
  });

  it("labels agent messages as Sage", () => {
    expect(composeMessageBody(baseMsg({ is_agent: true, author_name: null })))
      .toBe("Sage said: We should ship the LOI by Friday.");
  });

  it("falls back to 'Member' when author name missing", () => {
    expect(composeMessageBody(baseMsg({ author_name: null })))
      .toContain("Member said:");
  });

  it("collapses internal whitespace", () => {
    expect(composeMessageBody(baseMsg({ body: "Multiple    spaces\n\nhere." })))
      .toBe("Achieng said: Multiple spaces here.");
  });
});

describe("composeDocBody", () => {
  const baseDoc = (over: Partial<IndexableWorkspaceDoc> = {}): IndexableWorkspaceDoc => ({
    id: "d1", workspace_id: "w1", title: "Distribution plan",
    body: "Week 1: identify 3 cooperatives. Week 2: pitch.",
    updated_at: "2026-06-01T12:00:00Z",
    ...over,
  });

  it("prepends 'Doc:' with title before body", () => {
    const out = composeDocBody(baseDoc());
    expect(out).toContain("Doc: Distribution plan");
    expect(out).toContain("Week 1: identify");
  });

  it("omits the doc-title line when title is empty", () => {
    const out = composeDocBody(baseDoc({ title: "" }));
    expect(out).not.toMatch(/^Doc:/);
  });

  it("collapses whitespace in body", () => {
    const out = composeDocBody(baseDoc({ body: "Line 1\n\nLine 2" }));
    expect(out).toContain("Line 1 Line 2");
  });
});

describe("composeTaskBody", () => {
  const baseTask = (over: Partial<IndexableWorkspaceTask> = {}): IndexableWorkspaceTask => ({
    id: "t1", workspace_id: "w1",
    title: "Draft LOI for Yendi co-op",
    detail: "Reference last week's interview notes.",
    status: "doing",
    assignee_name: "Achieng",
    ...over,
  });

  it("includes title + status + assignee + detail", () => {
    const out = composeTaskBody(baseTask());
    expect(out).toContain("Task: Draft LOI for Yendi co-op");
    expect(out).toContain("status: doing");
    expect(out).toContain("assigned to Achieng");
    expect(out).toContain("Reference last week");
  });

  it("omits assignee line when none", () => {
    const out = composeTaskBody(baseTask({ assignee_name: null }));
    expect(out).not.toContain("assigned to");
  });

  it("omits detail line when none", () => {
    const out = composeTaskBody(baseTask({ detail: "" }));
    expect(out).not.toContain(" · Reference");
  });
});

describe("composeDeadlineBody", () => {
  const baseDl = (over: Partial<IndexableWorkspaceDeadline> = {}): IndexableWorkspaceDeadline => ({
    id: "dl1", workspace_id: "w1",
    title: "Pilot pitch",
    detail: "Co-op chairman + 2 cooperative members.",
    due_at: "2026-06-30T18:00:00Z",
    status: "open",
    set_by_role: "instructor",
    ...over,
  });

  it("includes title + setter + due date + status + detail", () => {
    const out = composeDeadlineBody(baseDl());
    expect(out).toContain("Deadline: Pilot pitch");
    expect(out).toContain("set by instructor");
    expect(out).toContain("due 2026-06-30");
    expect(out).toContain("status: open");
    expect(out).toContain("Co-op chairman");
  });

  it("formats just the date portion of due_at", () => {
    const out = composeDeadlineBody(baseDl({ due_at: "2026-12-25T09:00:00Z" }));
    expect(out).toContain("due 2026-12-25");
    expect(out).not.toContain("09:00");
  });
});
