import { workspaceApi, type WorkspaceKind, type WorkspaceAccent, type TaskStatus } from "@/lib/workspace-api";

// Workspace templates — opinionated starting points so a new workspace
// has a heartbeat the moment it's created (a seeded task board, a
// starter note, and a couple of self-deadlines) instead of a blank room.
//
// Seeding runs CLIENT-SIDE after the workspace is created, reusing the
// existing API routes. Best-effort: a failed seed item doesn't fail the
// workspace creation.

export type WorkspaceTemplate = {
  id: string;
  label: string;
  blurb: string;
  kind: WorkspaceKind;
  accent: WorkspaceAccent;
  titleSuggestion: string;
  description: string;
  tasks: { title: string; status?: TaskStatus }[];
  note?: { title: string; body: string };
  deadlines: { title: string; detail?: string; inDays: number }[];
};

export const WORKSPACE_TEMPLATES: WorkspaceTemplate[] = [
  {
    id: "blank",
    label: "Blank workspace",
    blurb: "Start empty and build it your way.",
    kind: "generic",
    accent: "emerald",
    titleSuggestion: "",
    description: "",
    tasks: [],
    deadlines: [],
  },
  {
    id: "study-group",
    label: "Weekly study group",
    blurb: "Learn the same topic together, every week.",
    kind: "study_group",
    accent: "emerald",
    titleSuggestion: "Weekly study jam",
    description: "A recurring study group. Each week: pick a topic, everyone preps, we meet, we capture what we learned.",
    tasks: [
      { title: "Pick this week's topic", status: "doing" },
      { title: "Each member preps one hard question" },
      { title: "Meet and work through it together" },
      { title: "Post 3 takeaways in the notes" },
    ],
    note: {
      title: "Study log",
      body: "# Study log\n\nA running log of what we cover each week.\n\n## Week 1 — [topic]\n- Key idea:\n- Hardest part:\n- One thing I'll review:\n\n_Add a new section each week. Keep it short and honest._",
    },
    deadlines: [
      { title: "This week's study session", detail: "Meet, review, capture takeaways.", inDays: 7 },
    ],
  },
  {
    id: "research",
    label: "Research workspace",
    blurb: "Co-investigate a question across institutions.",
    kind: "research",
    accent: "amber",
    titleSuggestion: "Research: [your question]",
    description: "A shared research workspace — define the question, scan the literature, plan the method, and track progress together.",
    tasks: [
      { title: "Sharpen the research question to one sentence", status: "doing" },
      { title: "Literature scan — 10 key papers" },
      { title: "Draft the method" },
      { title: "Decide the data / evidence plan" },
    ],
    note: {
      title: "Research plan",
      body: "# Research plan\n\n## Question\n_One sentence. What are we actually trying to find out?_\n\n## Why it matters\n\n## What's already known\n- \n\n## Method\n\n## Data / evidence\n\n## Risks & unknowns\n",
    },
    deadlines: [
      { title: "Literature review draft", detail: "10 papers summarized in the notes.", inDays: 14 },
    ],
  },
  {
    id: "paper",
    label: "Paper to publication",
    blurb: "Draft → review → revise → publish.",
    kind: "paper",
    accent: "rust",
    titleSuggestion: "Manuscript: [working title]",
    description: "Track a manuscript from first draft through review and revision to publication. Each stage is a task; reviewer deadlines get stamped as journal-set.",
    tasks: [
      { title: "Outline the argument", status: "doing" },
      { title: "Write the first full draft" },
      { title: "Internal review by a co-author" },
      { title: "Revise and tighten" },
      { title: "Format for the target journal" },
      { title: "Submit" },
    ],
    note: {
      title: "Manuscript outline",
      body: "# Manuscript outline\n\n**Target journal:** \n**Working title:** \n\n## Abstract (draft)\n\n## 1. Introduction\n- The gap:\n- Our contribution:\n\n## 2. Method\n\n## 3. Results\n\n## 4. Discussion\n\n## 5. Conclusion\n\n---\n_Revision log: record each reviewer round below._\n\n### Round 1 — [date]\n- Reviewer comment →  our response\n",
    },
    deadlines: [
      { title: "First full draft", detail: "Complete draft ready for internal review.", inDays: 21 },
    ],
  },
  {
    id: "project",
    label: "Project / venture",
    blurb: "A team building one thing, end to end.",
    kind: "project",
    accent: "indigo",
    titleSuggestion: "Project: [name]",
    description: "A team workspace for building a product or venture — scope it, build it, test it with real people, ship it.",
    tasks: [
      { title: "Define the smallest shippable version", status: "doing" },
      { title: "Split the build into pieces" },
      { title: "Build the first slice" },
      { title: "Test with 3 real users" },
      { title: "Ship it" },
    ],
    note: {
      title: "Project brief",
      body: "# Project brief\n\n## What we're building\n\n## Who it's for\n\n## What 'done' looks like for v1\n\n## Who's doing what\n\n## Open questions\n",
    },
    deadlines: [
      { title: "MVP demo", detail: "Something real to show, even if rough.", inDays: 14 },
    ],
  },
];

export function getTemplate(id: string): WorkspaceTemplate | undefined {
  return WORKSPACE_TEMPLATES.find((t) => t.id === id);
}

// Seed a freshly-created workspace from a template. Best-effort and
// parallelized where order doesn't matter. Returns a tally so the caller
// can surface partial failures if it wants (we mostly ignore them).
export async function seedFromTemplate(workspaceId: string, template: WorkspaceTemplate): Promise<{ tasks: number; note: boolean; deadlines: number }> {
  let tasks = 0;
  let note = false;
  let deadlines = 0;

  // Tasks — sequential so their `position` ends up in declaration order
  // (each lands at the bottom of its column as it's created).
  for (const t of template.tasks) {
    try {
      const r = await workspaceApi.addTask(workspaceId, { title: t.title, status: t.status ?? "todo" });
      if (r.ok) tasks++;
    } catch { /* best-effort */ }
  }

  // Note — create then save the body (createDoc returns version 1).
  if (template.note) {
    try {
      const created = await workspaceApi.createDoc(workspaceId, template.note.title);
      if (created.ok) {
        const saved = await workspaceApi.saveDoc(workspaceId, created.doc.id, { body: template.note.body, version: created.doc.version });
        note = saved.ok;
      }
    } catch { /* best-effort */ }
  }

  // Deadlines — self-set, relative to now.
  await Promise.all(
    template.deadlines.map(async (d) => {
      try {
        const due = new Date(Date.now() + d.inDays * 86_400_000);
        due.setHours(9, 0, 0, 0);
        const r = await workspaceApi.addDeadline(workspaceId, { title: d.title, detail: d.detail, dueAt: due.toISOString(), setByRole: "self" });
        if (r.ok) deadlines++;
      } catch { /* best-effort */ }
    }),
  );

  return { tasks, note, deadlines };
}
